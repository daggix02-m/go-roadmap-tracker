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
 * CONFLICT DETECTION
 * ------------------
 * Conflicts are reported base-aware: only when BOTH sides changed the same
 * field/key since the last sync and settled on different values. Additive
 * differences (e.g. different boxes checked on each device) merge silently —
 * the "conflict" modal only appears for genuinely ambiguous edits. When
 * `base` is null (first sync, or a field new since the last sync) the merge
 * degrades to best-effort: any divergence is reported, since there is no
 * common ancestor to disambiguate against.
 *
 * Everything else (timers, current phase card open state, UI flags)
 * is device-local and never enters the merge.
 *
 * @module
 */

import { AppData, PlanProgress, Plan, GlobalActivity, Quest, QuestState } from '../types';

// ---------------------------------------------------------------------------
// Canonical serialization
// ---------------------------------------------------------------------------

/**
 * Order-insensitive JSON serialization (object keys sorted recursively).
 *
 * The Convex backend re-serializes stored `v.any()` documents with sorted
 * keys, so comparing `JSON.stringify(a) !== JSON.stringify(b)` against an
 * echoed cloud snapshot is unstable (same data, different key order → always
 * "different" → runaway re-push). This canonical form makes equality checks
 * order-independent.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const v = (value as Record<string, unknown>)[k];
      // Treat undefined-valued keys as absent: the Convex JSON round-trip
      // drops them, so `{ a: undefined }` must compare equal to `{}`.
      if (v === undefined) continue;
      parts.push(JSON.stringify(k) + ':' + canonicalJson(v));
    }
    return '{' + parts.join(',') + '}';
  }
  return JSON.stringify(value);
}

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

/**
 * Base-aware LWW for stepDurations.
 *
 * `recordLWW` compares raw values (higher number wins), which silently
 * discards a user's deliberate change: shortening a timer from 3600s to
 * 1200s on one device loses to the stale 3600s default on another device.
 *
 * Correct semantics: per key, the side that CHANGED since the common
 * ancestor wins. Only when both sides changed (or there is no ancestor) do
 * we fall back to the larger value as a deterministic tiebreak — and that
 * genuine double-edit is separately surfaced as a plan-level conflict.
 */
function stepDurationLWW(
  base: Record<string, number> | undefined,
  local: Record<string, number>,
  remote: Record<string, number>
): Record<string, number> {
  const b = base ?? {};
  const out: Record<string, number> = { ...local };
  for (const [k, rv] of Object.entries(remote)) {
    const bv = b[k];
    const lv = out[k];
    if (lv === undefined) {
      // Only the remote has this key — adopt it (a new override).
      out[k] = rv;
      continue;
    }
    const localChanged = bv !== undefined && bv !== lv;
    const remoteChanged = bv !== undefined && bv !== rv;
    if (remoteChanged && !localChanged) {
      // Only the remote changed since base → remote wins.
      out[k] = rv;
    } else if (localChanged && remoteChanged) {
      // Both changed → larger value as a tiebreak (plan-level conflict
      // detection still surfaces this to the user).
      if (rv > lv) out[k] = rv;
    }
    // else: only local changed (or neither) → keep local.
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

/**
 * Merge quest state: items union by id (newer `updatedAt` wins per quest),
 * completions are true-wins (a check on any device sticks), xp is
 * best-of-both. A side without quests at all (old client / fresh account)
 * degrades to the populated side.
 */
function mergeQuests(
  local: QuestState | undefined,
  remote: QuestState | undefined
): QuestState | undefined {
  if (!local && !remote) return undefined;
  const l = local ?? { items: [], completions: {}, xp: 0 };
  const r = remote ?? { items: [], completions: {}, xp: 0 };

  const byId = new Map<string, Quest>();
  for (const q of l.items) byId.set(q.id, { ...q });
  for (const rq of r.items) {
    const lq = byId.get(rq.id);
    if (!lq || ((rq.updatedAt ?? rq.createdAt ?? 0) > (lq.updatedAt ?? lq.createdAt ?? 0))) {
      byId.set(rq.id, { ...rq });
    }
  }

  // True-wins union of the nested day records.
  const completions: QuestState['completions'] = {};
  const sides = [l.completions, r.completions];
  for (const side of sides) {
    for (const [questId, days] of Object.entries(side)) {
      completions[questId] = { ...(completions[questId] ?? {}) };
      for (const [day, done] of Object.entries(days)) {
        if (done) completions[questId][day] = true;
      }
    }
  }

  return {
    items: [...byId.values()],
    completions,
    xp: rulesVersionAwareXp(l, r),
    ...(Math.max(l.rulesVersion ?? 0, r.rulesVersion ?? 0) ? { rulesVersion: Math.max(l.rulesVersion ?? 0, r.rulesVersion ?? 0) } : {})
  };
}

/**
 * XP from the side running a higher rules version wins; on equal versions the
 * higher balance wins. This prevents a stale pre-migration cloud copy from
 * resurrecting an old XP balance over a current-rules (reset-to-0) side.
 */
function rulesVersionAwareXp(l: QuestState, r: QuestState): number {
  const lv = l.rulesVersion ?? 0;
  const rv = r.rulesVersion ?? 0;
  if (lv !== rv) return lv > rv ? l.xp : r.xp;
  return Math.max(l.xp, r.xp);
}

// ---------------------------------------------------------------------------
// Base-aware conflict helpers
// ---------------------------------------------------------------------------

/**
 * True when BOTH sides changed the same key since `base` and settled on
 * different values. Used for stepChecked / criteriaChecked / userNotes /
 * stepDurations / stepDoneDay. Additive changes (a new key set on one side
 * only, or both sides agreeing) do NOT count as a conflict.
 */
function bothChangedKey(
  base: Record<string, unknown> | undefined,
  local: Record<string, unknown>,
  remote: Record<string, unknown>
): boolean {
  const b = base ?? {};
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const bv = b[key];
    const lv = local[key];
    const rv = remote[key];
    if (bv !== lv && bv !== rv && lv !== rv) return true;
  }
  return false;
}

/** True when BOTH sides changed the same phase's completion since `base`. */
function bothChangedPhase(
  base: number[] | undefined,
  local: number[],
  remote: number[]
): boolean {
  const b = new Set(base ?? []);
  for (const phase of new Set([...local, ...remote])) {
    if (b.has(phase) !== local.includes(phase) && b.has(phase) !== remote.includes(phase)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Merge plans
// ---------------------------------------------------------------------------

function mergePlans(
  base: AppData | null,
  localPlans: Plan[],
  remotePlans: Plan[],
  conflicts: Conflict[]
): Plan[] {
  const byId = new Map<string, Plan>();
  const basePlans = base?.customPlans ?? [];

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
      const basePlan = basePlans.find((p) => p.id === rp.id);
      // Only surface the deletion if it's a change since the last sync.
      if (!basePlan || !basePlan.deleted) {
        conflicts.push({
          field: `plan.${rp.id}.deleted`,
          localValue: lp.name,
          remoteValue: rp.name,
          message: `"${rp.name}" was deleted on another device and removed here.`
        });
      }
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
    }

    // Conflict only when both devices edited the same plan since the last
    // sync (or it has no ancestor and the two sides disagree).
    const basePlan = basePlans.find((p) => p.id === rp.id);
    if (basePlan) {
      const localChanged = JSON.stringify(lp) !== JSON.stringify(basePlan);
      const remoteChanged = JSON.stringify(rp) !== JSON.stringify(basePlan);
      if (localChanged && remoteChanged) {
        conflicts.push({
          field: `plan.${rp.id}`,
          localValue: lp.name,
          remoteValue: rp.name,
          message: `"${rp.name}" was edited on both devices.`
        });
      }
    } else if (JSON.stringify(lp) !== JSON.stringify(rp)) {
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
  base: AppData | null,
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

    const bp = base?.progressByPlan?.[planId] ?? null;

    const merged: PlanProgress = {
      completedPhases: numberUnion(lp.completedPhases, rp.completedPhases),
      criteriaChecked: checkboxUnion(lp.criteriaChecked, rp.criteriaChecked),
      stepChecked: checkboxUnion(lp.stepChecked, rp.stepChecked),
      userNotes: { ...lp.userNotes, ...rp.userNotes },
      lastStudiedPhaseId:
        (rp.lastStudiedPhaseId ?? 0) > (lp.lastStudiedPhaseId ?? 0)
          ? rp.lastStudiedPhaseId
          : lp.lastStudiedPhaseId,
      stepDurations: stepDurationLWW(
        bp?.stepDurations ?? {},
        lp.stepDurations ?? {},
        rp.stepDurations ?? {}
      ),
      stepDoneDay: recordLWW(lp.stepDoneDay ?? {}, rp.stepDoneDay ?? {}),
      phaseDoneDay: recordLWW(lp.phaseDoneDay ?? {}, rp.phaseDoneDay ?? {})
    };

    // With a common ancestor, flag the plan only when both devices changed
    // the same thing since the last sync. Without one, flag any divergence
    // (best-effort first-sync behavior).
    const divergent = bp
      ? bothChangedPhase(bp.completedPhases, lp.completedPhases, rp.completedPhases) ||
        bothChangedKey(bp.stepChecked, lp.stepChecked, rp.stepChecked) ||
        bothChangedKey(bp.criteriaChecked, lp.criteriaChecked, rp.criteriaChecked) ||
        bothChangedKey(bp.userNotes, lp.userNotes, rp.userNotes) ||
        bothChangedKey(bp.stepDurations ?? {}, lp.stepDurations ?? {}, rp.stepDurations ?? {}) ||
        bothChangedKey(bp.stepDoneDay ?? {}, lp.stepDoneDay ?? {}, rp.stepDoneDay ?? {}) ||
        bothChangedKey(bp.phaseDoneDay ?? {}, lp.phaseDoneDay ?? {}, rp.phaseDoneDay ?? {}) ||
        (bp.lastStudiedPhaseId !== lp.lastStudiedPhaseId &&
          bp.lastStudiedPhaseId !== rp.lastStudiedPhaseId &&
          lp.lastStudiedPhaseId !== rp.lastStudiedPhaseId)
      : JSON.stringify(lp) !== JSON.stringify(rp);

    if (divergent) {
      conflicts.push({
        field: `progress.${planId}`,
        localValue: lp.completedPhases.length,
        remoteValue: rp.completedPhases.length,
        message: `Progress on "${planId}" was changed on both devices.`
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
 * Conflicts are reported base-aware — only when both sides changed the same
 * thing since the last sync. If `base` is null (first sync), the merge
 * degrades to a best-effort union and reports any divergence.
 */
export function threeWayMerge(
  base: AppData | null,
  local: AppData,
  remote: AppData
): MergeResult {
  const conflicts: Conflict[] = [];

  // --- settings & global ---
  const settings = lww(local.settings, remote.settings, local.lastModifiedAt, remote.lastModifiedAt);

  // Conflict only when both devices changed settings since the last sync
  // (or there is no ancestor and the two sides differ).
  const settingsDivergent = base
    ? JSON.stringify(base.settings) !== JSON.stringify(local.settings) &&
      JSON.stringify(base.settings) !== JSON.stringify(remote.settings)
    : JSON.stringify(local.settings) !== JSON.stringify(remote.settings);
  if (settingsDivergent) {
    conflicts.push({
      field: 'settings',
      localValue: local.settings.timeFormat,
      remoteValue: remote.settings.timeFormat,
      message: 'Settings were changed on both devices.'
    });
  }

  const globalActivity = mergeGlobal(local.global, remote.global);

  // --- custom plans ---
  const customPlans = mergePlans(base, local.customPlans, remote.customPlans, conflicts);

  // --- progress ---
  const progressByPlan = mergeProgress(base, local.progressByPlan, remote.progressByPlan, conflicts);

  // --- active plan ---
  const activePlanId = lww(local.activePlanId, remote.activePlanId, local.activePlanUpdatedAt, remote.activePlanUpdatedAt);

  // --- daily quests ---
  const quests = mergeQuests(local.quests, remote.quests);

  const merged: AppData = {
    version: 2,
    activePlanId,
    activePlanUpdatedAt: Math.max(local.activePlanUpdatedAt ?? 0, remote.activePlanUpdatedAt ?? 0),
    customPlans,
    settings,
    global: globalActivity,
    progressByPlan,
    ...(quests ? { quests } : {}),
    lastModifiedAt: Math.max(local.lastModifiedAt ?? 0, remote.lastModifiedAt ?? 0)
  };

  return { merged, conflicts };
}
// ---------------------------------------------------------------------------
// Conflict resolution by user preference
// ---------------------------------------------------------------------------

/** How a conflict was resolved: keep local, take remote, or fork both. */
export type ConflictResolution = 'local' | 'remote' | 'merge';

/**
 * Apply a conflict resolution to a (local, remote) pair.
 *
 * • 'local'  → local state wins untouched
 * • 'remote' → remote state adopted untouched
 * • 'merge'  → keep local as-is and fork every remote-only custom plan under
 *   a new id with a " (cloud)" suffix so nothing from either side is lost
 *   (git-style "keep both").
 */
export function resolveWithPreference(
  resolution: ConflictResolution,
  local: AppData,
  remote: AppData
): AppData {
  switch (resolution) {
    case 'local':
      return local;
    case 'remote':
      return remote;
    case 'merge': {
      const remoteOnlyPlans = remote.customPlans.filter(
        (rp) => !local.customPlans.some((lp) => lp.id === rp.id)
      );
      const forked = remoteOnlyPlans.map((p) => ({
        ...p,
        id: `${p.id}-fork-${Date.now()}`,
        name: `${p.name} (cloud)`,
        lastModifiedAt: Date.now()
      }));
      return {
        ...local,
        customPlans: [...local.customPlans, ...forked],
        lastModifiedAt: Date.now()
      };
    }
  }
}
