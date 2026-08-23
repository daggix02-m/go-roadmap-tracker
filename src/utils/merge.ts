/**
 * Three-way merge engine for AppData snapshots.
 *
 * Given a common ancestor (`base`) and two diverged states (`local`,
 * `remote`), produce a merged result. Returns both the merged data and
 * a list of human-readable conflicts for the resolution modal.
 *
 * RULES
 * -----
 * - **checkbox ticks** (`stepChecked`, `criteriaChecked`): true-wins union
 *   (once checked, stays checked on both sides).
 * - **completedPhases**: union (once completed, stays completed).
 * - **historyMinutes**: max-per-day union (no overwrites).
 * - **global** (streak, lastActiveDate, historyDates, totalStudyMinutes):
 *   best-of-both union (max streak/minutes, unioned dates, most-recent
 *   active date). Streak reconciles on load via `calculateGlobalStreak`.
 * - **stepDurations**, **stepDoneDay**: newer wins per key (by value comparison).
 * - **settings** / **activePlanId**: last-write-wins (`lastModifiedAt` /
 *   `activePlanUpdatedAt`).
 * - **customPlans**: union by `id`; tombstone (`deleted: true`) always wins
 *   over non-deleted.  Per-plan data LWW by `lastModifiedAt`.
 * - **progressByPlan**: merge each plan's progress independently LWW.
 * - **activePlanId**: last-write-wins via `activePlanUpdatedAt`.
 *
 * Everything else (timers, current phase card open state, UI flags)
 * is device-local and never enters the merge.
 *
 * @module
 */

import { AppData, PlanProgress, Plan, GlobalActivity } from '../types';

// ---------------------------------------------------------------------------
// Conflict record
// ---------------------------------------------------------------------------

export interface Conflict {
  /** Dot-path to the conflicting field, e.g. `settings.timeFormat`. */
  field: string;
  /** The value on the local (this-device) side. */
  localValue: unknown;
  /** The value on the remote (cloud) side. */
  remoteValue: unknown;
  /** Human-readable summary of what happened. */
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Merge two flat `Record<string, boolean>` maps with true-wins union. */
function checkboxUnion(
  local: Record<string, boolean>,
  remote: Record<string, boolean>
): Record<string, boolean> {
  const out: Record<string, boolean> = { ...local };
  for (const [k, v] of Object.entries(remote)) {
    if (v) out[k] = true;
  }
  return out;
}

/** Union two number arrays (de-duplicated). */
function numberUnion(a: number[], b: number[]): number[] {
  return [...new Set([...a, ...b])];
}

/** Max-per-day union of historyMinutes maps. */
function historyMinutesUnion(
  local: Record<string, number>,
  remote: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = { ...local };
  for (const [day, mins] of Object.entries(remote)) {
    out[day] = Math.max(out[day] ?? 0, mins);
  }
  return out;
}

/**
 * Merge `global` activity: best-of-both instead of LWW so streak, study
 * minutes and active days carry across devices. Streak reconciles on load
 * via `calculateGlobalStreak`, which is why we keep the higher scalar and
 * the most recent active date.
 */
function mergeGlobal(
  local: GlobalActivity,
  remote: GlobalActivity
): GlobalActivity {
  const historyDates = [...new Set([...local.historyDates, ...remote.historyDates])];
  return {
    streak: Math.max(local.streak, remote.streak),
    lastActiveDate:
      (local.lastActiveDate ?? '') > (remote.lastActiveDate ?? '')
        ? local.lastActiveDate
        : remote.lastActiveDate,
    historyDates,
    totalStudyMinutes: Math.max(local.totalStudyMinutes, remote.totalStudyMinutes),
    historyMinutes: historyMinutesUnion(local.historyMinutes, remote.historyMinutes)
  };
}

/** LWW for a single record<string, V> by comparing values per key. */
function recordLWW<V>(
  local: Record<string, V>,
  remote: Record<string, V>
): Record<string, V> {
  const out: Record<string, V> = { ...local };
  for (const [k, v] of Object.entries(remote)) {
    if (!(k in out) || v > out[k]) out[k] = v;
  }
  return out;
}

/** LWW string record (settings-like, no numeric comparison — use keys present). */
function stringRecordLWW(
  local: Record<string, string>,
  remote: Record<string, string>,
  localTs: number | undefined,
  remoteTs: number | undefined
): Record<string, string> {
  if ((remoteTs ?? 0) > (localTs ?? 0)) return { ...remote };
  return { ...local };
}

/** Pick whichever value has the higher timestamp. */
function lww<T>(local: T, remote: T, localTs?: number, remoteTs?: number): T {
  return (remoteTs ?? 0) > (localTs ?? 0) ? remote : local;
}

// ---------------------------------------------------------------------------
// Merge plans
// ---------------------------------------------------------------------------

function mergePlans(
  localPlans: Plan[],
  remotePlans: Plan[],
  conflicts: Conflict[]
): Plan[] {
  const byId = new Map<string, Plan>();

  // Index local plans.
  for (const p of localPlans) byId.set(p.id, { ...p });

  // Merge remote plans.
  for (const rp of remotePlans) {
    const lp = byId.get(rp.id);
    if (!lp) {
      // New plan from remote — add it.
      byId.set(rp.id, { ...rp });
      continue;
    }

    // Tombstone always wins.
    if (rp.deleted && !lp.deleted) {
      byId.set(rp.id, { ...rp });
      conflicts.push({
        field: `plan.${rp.id}.deleted`,
        localValue: lp.name,
        remoteValue: rp.name,
        message: `"${rp.name}" was deleted on another device and removed here.`
      });
      continue;
    }
    if (lp.deleted && !rp.deleted) {
      // Local tombstone wins — keep lp.
      continue;
    }

    // Both non-deleted: LWW by lastModifiedAt.
    const merged: Plan = { ...lp };
    const localTs = lp.lastModifiedAt ?? 0;
    const remoteTs = rp.lastModifiedAt ?? 0;
    if (remoteTs > localTs) {
      Object.assign(merged, { ...rp });
      conflicts.push({
        field: `plan.${rp.id}`,
        localValue: lp.name,
        remoteValue: rp.name,
        message: `"${rp.name}" was updated on another device.`
      });
    }
    byId.set(rp.id, merged);
  }

  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// Merge progress
// ---------------------------------------------------------------------------

function mergeProgress(
  localProg: Record<string, PlanProgress>,
  remoteProg: Record<string, PlanProgress>,
  conflicts: Conflict[]
): Record<string, PlanProgress> {
  const out: Record<string, PlanProgress> = { ...localProg };

  for (const [planId, rp] of Object.entries(remoteProg)) {
    const lp = out[planId];
    if (!lp) {
      out[planId] = { ...rp };
      continue;
    }

    const merged: PlanProgress = {
      completedPhases: numberUnion(lp.completedPhases, rp.completedPhases),
      criteriaChecked: checkboxUnion(lp.criteriaChecked, rp.criteriaChecked),
      stepChecked: checkboxUnion(lp.stepChecked, rp.stepChecked),
      userNotes: { ...lp.userNotes, ...rp.userNotes },
      lastStudiedPhaseId:
        (rp.lastStudiedPhaseId ?? 0) > (lp.lastStudiedPhaseId ?? 0)
          ? rp.lastStudiedPhaseId
          : lp.lastStudiedPhaseId,
      stepDurations: recordLWW(lp.stepDurations ?? {}, rp.stepDurations ?? {}),
      stepDoneDay: recordLWW(lp.stepDoneDay ?? {}, rp.stepDoneDay ?? {})
    };

    if (JSON.stringify(lp) !== JSON.stringify(rp)) {
      conflicts.push({
        field: `progress.${planId}`,
        localValue: lp.completedPhases.length,
        remoteValue: rp.completedPhases.length,
        message: `Progress on "${planId}" was updated on another device.`
      });
    }

    out[planId] = merged;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Main merge
// ---------------------------------------------------------------------------

export interface MergeResult {
  merged: AppData;
  conflicts: Conflict[];
}

/**
 * Three-way merge: `base` is the common ancestor (last-synced snapshot),
 * `local` is this device, `remote` is the cloud.
 *
 * If `base` is null (first sync), the merge degrades to a best-effort
 * union with true-wins semantics — safe because checkbox ticks and
 * completed phases are only ever additive.
 */
export function threeWayMerge(
  base: AppData | null,
  local: AppData,
  remote: AppData
): MergeResult {
  const conflicts: Conflict[] = [];

  // --- settings & global ---
  const settings = lww(local.settings, remote.settings, local.lastModifiedAt, remote.lastModifiedAt);
  if (JSON.stringify(local.settings) !== JSON.stringify(remote.settings)) {
    conflicts.push({
      field: 'settings',
      localValue: local.settings.timeFormat,
      remoteValue: remote.settings.timeFormat,
      message: 'Settings were updated on another device.'
    });
  }

  const globalActivity = mergeGlobal(local.global, remote.global);

  // --- custom plans ---
  const customPlans = mergePlans(local.customPlans, remote.customPlans, conflicts);

  // --- progress ---
  const progressByPlan = mergeProgress(local.progressByPlan, remote.progressByPlan, conflicts);

  // --- active plan ---
  const activePlanId = lww(local.activePlanId, remote.activePlanId, local.activePlanUpdatedAt, remote.activePlanUpdatedAt);

  const merged: AppData = {
    version: 2,
    activePlanId,
    activePlanUpdatedAt: Math.max(local.activePlanUpdatedAt ?? 0, remote.activePlanUpdatedAt ?? 0),
    customPlans,
    settings,
    global: globalActivity,
    progressByPlan,
    lastModifiedAt: Math.max(local.lastModifiedAt ?? 0, remote.lastModifiedAt ?? 0)
  };

  return { merged, conflicts };
}
