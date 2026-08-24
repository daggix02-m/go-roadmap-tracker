import {
  AppData,
  AppSettings,
  CONFLICT_RESOLUTION_PREFS,
  GlobalActivity,
  PlanProgress,
  Quest,
  QuestState,
  HOME_WIDGET_IDS,
  LAYOUT_IDS,
  THEME_IDS
} from '../types';
import { DEMO_PLAN, DEMO_PLAN_ID } from '../data/plans/demo';

/** Legacy single-plan key — kept as the read-only migration source. */
const LEGACY_STORAGE_KEY = 'go_backend_roadmap_tracker_v1';

export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Storage v2 — multi-plan state
// ---------------------------------------------------------------------------

const STORAGE_KEY_V2 = 'plan_tracker_v2';

/**
 * Save-change notification (tiny pub/sub).
 *
 * The sync engine subscribes so it can push to the cloud shortly after a user
 * action — without this, changes only reached the cloud on the 5-minute
 * interval or sign-out (whose push fails after the token is invalidated).
 * Sync-internal saves (the merged result being persisted) pass `{silent:
 * true}` so they don't trigger a redundant push.
 */
type SaveListener = () => void;
const saveListeners: SaveListener[] = [];

export function onAppDataSaved(listener: SaveListener): () => void {
  saveListeners.push(listener);
  return () => {
    const i = saveListeners.indexOf(listener);
    if (i >= 0) saveListeners.splice(i, 1);
  };
}

function notifyAppDataSaved(): void {
  for (const l of saveListeners) l();
}

export const EMPTY_PLAN_PROGRESS: PlanProgress = {
  completedPhases: [],
  criteriaChecked: {},
  stepChecked: {},
  userNotes: {},
  lastStudiedPhaseId: null,
  stepDurations: {},
  stepDoneDay: {},
  phaseDoneDay: {}
};

export function emptyPlanProgress(): PlanProgress {
  return { ...EMPTY_PLAN_PROGRESS, completedPhases: [] };
}

// ---------------------------------------------------------------------------
// Daily quests — XP economy
// ---------------------------------------------------------------------------

/** XP awarded for completing one full roadmap phase. Repeatable — multiple phases stack. */
export const QUEST_XP_PER_PHASE = 25;
/**
 * Current XP economy rules. XP only accrues from completing roadmap phases
 * (the old manual checklist economy is gone). Bump to invalidate old XP
 * balances (normalizeAppData resets them to 0 once).
 */
export const QUEST_RULES_VERSION = 2;

/** Quadratic level curve: L1 at 0 XP, L2 at 100, L3 at 400, Ln at (L-1)²·100. */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return (l - 1) * (l - 1) * 100;
}

export function levelFromXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1;
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

export function emptyQuestState(): QuestState {
  return { items: [], completions: {}, xp: 0 };
}

/**
 * Awards QUEST_XP_PER_PHASE for a completed phase and records it in
 * `earnedPhaseIds` so the same phase is never double-paid. Pure and
 * idempotent — a no-op when the phase already earned XP.
 */
export function awardPhaseXp(state: QuestState, phaseId: number | string): QuestState {
  const key = String(phaseId);
  const earned = state.earnedPhaseIds ?? [];
  if (earned.includes(key)) return state;
  return {
    ...state,
    earnedPhaseIds: [...earned, key],
    xp: state.xp + QUEST_XP_PER_PHASE
  };
}

/**
 * Refunds QUEST_XP_PER_PHASE when a completed phase is un-completed and drops
 * it from `earnedPhaseIds` (so re-completing pays again). Exact inverse of
 * `awardPhaseXp`, floored at zero. Returns the state unchanged when the phase
 * was never awarded.
 */
export function revokePhaseXp(state: QuestState, phaseId: number | string): QuestState {
  const key = String(phaseId);
  const earned = state.earnedPhaseIds ?? [];
  if (!earned.includes(key)) return state;
  return {
    ...state,
    earnedPhaseIds: earned.filter((id) => id !== key),
    xp: Math.max(0, state.xp - QUEST_XP_PER_PHASE)
  };
}

/**
 * XP gate: a day only counts as eligible when the user kept their streak (the
 * day shows up as active) AND completed at least one full phase that day.
 * Mirrors the streak's notion of "active day" — opening the app counts,
 * exactly like `calculateGlobalStreak`.
 */
export function isDayQuestEligible(data: AppData, day: string): boolean {
  const active =
    (data.global.historyDates ?? []).includes(day) ||
    (data.global.historyMinutes?.[day] ?? 0) > 0;
  if (!active) return false;
  return Object.values(data.progressByPlan).some((pp) =>
    Object.values(pp.phaseDoneDay ?? {}).includes(day)
  );
}

export function defaultAppData(): AppData {
  return {
    version: 2,
    activePlanId: 'go-roadmap',
    // The showcase plan ships as an ordinary custom plan: editable, forkable,
    // and deletable through the normal tombstone flow.
    customPlans: [{ ...DEMO_PLAN }],
    settings: {
      dailyReminderEnabled: false,
      dailyReminderTime: '09:00',
      timeFormat: '12h',
      timezone: undefined,
      dailyFocusGoal: undefined
    },
    global: { streak: 0, lastActiveDate: null, historyDates: [], totalStudyMinutes: 0, historyMinutes: {} },
    progressByPlan: {}
  };
}

/** Keeps only entries whose value passes `ok`; non-objects become empty. */
function sanitizeRecord<T>(
  value: unknown,
  ok: (v: unknown) => boolean
): Record<string, T> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof k === 'string' && k.length > 0 && ok(v)) out[k] = v as T;
  }
  return out;
}

/** Sanitizes the persisted quests blob; absent input stays absent. */
function sanitizeQuestState(value: unknown): QuestState | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<QuestState>;

  const items: Quest[] = [];
  if (Array.isArray(raw.items)) {
    for (const q of raw.items) {
      if (!q || typeof q !== 'object') continue;
      if (typeof q.id !== 'string' || !q.id) continue;
      if (typeof q.title !== 'string' || !q.title) continue;
      const item: Quest = {
        id: q.id,
        title: q.title,
        enabled: Boolean(q.enabled),
        createdAt:
          typeof q.createdAt === 'number' && Number.isFinite(q.createdAt) ? q.createdAt : 0
      };
      if (typeof q.emoji === 'string' && q.emoji) item.emoji = q.emoji;
      if (
        typeof q.targetMinutes === 'number' &&
        Number.isFinite(q.targetMinutes) &&
        q.targetMinutes > 0
      ) {
        item.targetMinutes = Math.round(q.targetMinutes);
      }
      if (typeof q.updatedAt === 'number' && Number.isFinite(q.updatedAt)) {
        item.updatedAt = q.updatedAt;
      }
      items.push(item);
    }
  }

  const completions: QuestState['completions'] = {};
  if (raw.completions && typeof raw.completions === 'object') {
    for (const [questId, days] of Object.entries(raw.completions)) {
      if (!questId || !days || typeof days !== 'object') continue;
      completions[questId] = sanitizeRecord<boolean>(days, (v) => v === true);
    }
  }

  const earnedPhaseIds: string[] = [];
  if (Array.isArray(raw.earnedPhaseIds)) {
    for (const id of raw.earnedPhaseIds) {
      if (typeof id === 'string' && /^\d+$/.test(id)) earnedPhaseIds.push(id);
    }
  }

  return {
    items,
    completions,
    xp:
      typeof raw.xp === 'number' && Number.isFinite(raw.xp) && raw.xp > 0
        ? Math.floor(raw.xp)
        : 0,
    ...(typeof raw.rulesVersion === 'number' &&
    Number.isFinite(raw.rulesVersion) &&
    raw.rulesVersion > 0
      ? { rulesVersion: Math.floor(raw.rulesVersion) }
      : {}),
    ...(earnedPhaseIds.length > 0 ? { earnedPhaseIds } : {})
  };
}

/** Defensive merge of parsed JSON into a complete AppData. */
export function normalizeAppData(parsed: Partial<AppData> | null | undefined): AppData {
  const base = defaultAppData();
  if (!parsed || typeof parsed !== 'object') return base;
  const settings: AppSettings = {
    dailyReminderEnabled: Boolean(parsed.settings?.dailyReminderEnabled),
    dailyReminderTime:
      typeof parsed.settings?.dailyReminderTime === 'string'
        ? parsed.settings.dailyReminderTime
        : base.settings.dailyReminderTime,
    timeFormat:
      parsed.settings?.timeFormat === '12h' || parsed.settings?.timeFormat === '24h'
        ? parsed.settings.timeFormat
        : base.settings.timeFormat
  };
  // Only materialize optional keys when they have a real value — the Convex
  // JSON round-trip drops undefined-valued keys, so storing `timezone:
  // undefined` made local settings permanently differ from the echoed cloud
  // snapshot (the sync-echo bug).
  if (typeof parsed.settings?.timezone === 'string' && parsed.settings.timezone.length > 0) {
    settings.timezone = parsed.settings.timezone;
  }
  if (
    typeof parsed.settings?.dailyFocusGoal === 'number' &&
    Number.isFinite(parsed.settings.dailyFocusGoal) &&
    parsed.settings.dailyFocusGoal > 0
  ) {
    settings.dailyFocusGoal = Math.round(parsed.settings.dailyFocusGoal);
  }
  // Appearance settings: only materialize recognized values (same sync-echo
  // discipline as timezone above — absent keys must stay absent).
  if (parsed.settings?.theme && THEME_IDS.includes(parsed.settings.theme)) {
    settings.theme = parsed.settings.theme;
  }
  if (parsed.settings?.layout && LAYOUT_IDS.includes(parsed.settings.layout)) {
    settings.layout = parsed.settings.layout;
  }
  if (parsed.settings?.homeWidget && HOME_WIDGET_IDS.includes(parsed.settings.homeWidget)) {
    settings.homeWidget = parsed.settings.homeWidget;
  }
  if (
    parsed.settings?.conflictResolution &&
    CONFLICT_RESOLUTION_PREFS.includes(parsed.settings.conflictResolution)
  ) {
    settings.conflictResolution = parsed.settings.conflictResolution;
  }

  const global = { ...base.global };
  if (parsed.global && typeof parsed.global === 'object') {
    if (typeof parsed.global.streak === 'number') global.streak = parsed.global.streak;
    if (typeof parsed.global.lastActiveDate === 'string' || parsed.global.lastActiveDate === null) {
      global.lastActiveDate = parsed.global.lastActiveDate;
    }
    if (Array.isArray(parsed.global.historyDates)) global.historyDates = parsed.global.historyDates;
    if (typeof parsed.global.totalStudyMinutes === 'number') {
      global.totalStudyMinutes = parsed.global.totalStudyMinutes;
    }
    if (parsed.global.historyMinutes !== undefined) {
      global.historyMinutes = sanitizeRecord<number>(
        parsed.global.historyMinutes,
        (v) => typeof v === 'number' && v > 0
      );
    } else if (global.historyDates.length > 0) {
      // Pre-graph data: backfill each studied day at the lowest intensity.
      global.historyMinutes = Object.fromEntries(global.historyDates.map((d) => [d, 15]));
    }
  }

  const progressByPlan: Record<string, PlanProgress> = {};
  if (parsed.progressByPlan && typeof parsed.progressByPlan === 'object') {
    for (const [planId, raw] of Object.entries(parsed.progressByPlan)) {
      if (!raw || typeof raw !== 'object') continue;
      progressByPlan[planId] = {
        completedPhases: Array.isArray(raw.completedPhases) ? raw.completedPhases : [],
        criteriaChecked: raw.criteriaChecked && typeof raw.criteriaChecked === 'object' ? raw.criteriaChecked : {},
        stepChecked: raw.stepChecked && typeof raw.stepChecked === 'object' ? raw.stepChecked : {},
        userNotes: raw.userNotes && typeof raw.userNotes === 'object' ? raw.userNotes : {},
        lastStudiedPhaseId: typeof raw.lastStudiedPhaseId === 'number' ? raw.lastStudiedPhaseId : null,
        stepDurations: sanitizeRecord(raw.stepDurations, (v) => typeof v === 'number' && v > 0),
        stepDoneDay: sanitizeRecord(raw.stepDoneDay, (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)),
        phaseDoneDay: sanitizeRecord(raw.phaseDoneDay, (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))
      };
    }
  }

  const customPlans = Array.isArray(parsed.customPlans) ? [...parsed.customPlans] : [];
  // Seed the demo showcase plan only when there is no trace of it — a
  // tombstone (deleted: true) means the user removed it deliberately and it
  // must never come back here or via sync.
  if (!customPlans.some((p) => p && typeof p === 'object' && p.id === DEMO_PLAN_ID)) {
    customPlans.push({ ...DEMO_PLAN });
  }

  let quests = sanitizeQuestState(parsed.quests);
  // One-time XP economy reset: XP earned under older rules (no rulesVersion
  // stamp) is invalid — zero it and stamp the current version so the reset
  // never repeats (even across devices via merge).
  if (quests && (quests.rulesVersion ?? 0) < QUEST_RULES_VERSION) {
    quests = { ...quests, rulesVersion: QUEST_RULES_VERSION, xp: 0 };
  }

  return {
    version: 2,
    activePlanId: typeof parsed.activePlanId === 'string' ? parsed.activePlanId : base.activePlanId,
    activePlanUpdatedAt:
      typeof parsed.activePlanUpdatedAt === 'number' ? parsed.activePlanUpdatedAt : undefined,
    customPlans,
    settings,
    global,
    progressByPlan,
    ...(quests ? { quests } : {}),
    lastModifiedAt:
      typeof parsed.lastModifiedAt === 'number' ? parsed.lastModifiedAt : undefined
  };
}

/** Copy-only migration from the v1 single-plan key. Never deletes or rewrites the legacy key. */
function migrateLegacyState(): AppData | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const old = JSON.parse(raw);
    if (!old || typeof old !== 'object') return null;

    const data = normalizeAppData({
      version: 2,
      activePlanId: 'go-roadmap',
      customPlans: [],
      settings: {
        dailyReminderEnabled: Boolean(old.dailyReminderEnabled),
        dailyReminderTime:
          typeof old.dailyReminderTime === 'string' ? old.dailyReminderTime : '09:00',
        timeFormat: '12h'
      },
      global: {
        streak: typeof old.streak === 'number' ? old.streak : 0,
        lastActiveDate: (old.lastActiveDate as string) ?? null,
        historyDates: Array.isArray(old.historyDates) ? old.historyDates : [],
        totalStudyMinutes: typeof old.totalStudyMinutes === 'number' ? old.totalStudyMinutes : 0,
        historyMinutes: {}
      },
      progressByPlan: {
        'go-roadmap': {
          completedPhases: Array.isArray(old.completedPhases) ? old.completedPhases : [],
          criteriaChecked: old.criteriaChecked ?? {},
          stepChecked: old.stepChecked ?? {},
          userNotes: old.userNotes ?? {},
          lastStudiedPhaseId: typeof old.lastStudiedPhaseId === 'number' ? old.lastStudiedPhaseId : null
        }
      }
    });
    return data;
  } catch (err) {
    console.error('Failed to migrate legacy tracker state:', err);
    return null;
  }
}

/**
 * Streak touch logic shared by load & activity recording.
 * Preserves the original semantics exactly: opening the app counts as
 * activity; a gap of more than one day resets the streak to 1.
 */
export function calculateGlobalStreak(global: GlobalActivity): GlobalActivity {
  const todayStr = getLocalDateString();

  if (!global.lastActiveDate) {
    return {
      ...global,
      streak: 1,
      lastActiveDate: todayStr,
      historyDates: [...new Set([...global.historyDates, todayStr])]
    };
  }

  if (global.lastActiveDate === todayStr) {
    return {
      ...global,
      historyDates: global.historyDates.includes(todayStr)
        ? global.historyDates
        : [...global.historyDates, todayStr]
    };
  }

  const lastDate = new Date(global.lastActiveDate);
  const diffDays = Math.floor(Math.abs(Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  const nextStreak = diffDays <= 1 ? global.streak + 1 : 1;

  return {
    ...global,
    streak: nextStreak,
    lastActiveDate: todayStr,
    historyDates: global.historyDates.includes(todayStr)
      ? global.historyDates
      : [...global.historyDates, todayStr]
  };
}

export function saveAppData(data: AppData, opts?: { silent?: boolean }): void {
  try {
    // NOTE: deliberately does NOT bump `lastModifiedAt` here. The sync engine
    // saves the merged state as-is and pushes it as-is, so local, cloud and
    // the merge base stay identical — otherwise the auto-sync echo re-pushes
    // forever. User actions bump the timestamp explicitly at the call sites
    // (App.tsx handleUpdateData / handleStateReload, logStudyActivity).
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(data));
    if (!opts?.silent) notifyAppDataSaved();
  } catch (err) {
    console.error('Failed to save app data:', err);
  }
}

/** Loads v2 state; migrates v1 on first run (legacy key is left in place as backup). */
export function loadAppData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 2) {
        const data = normalizeAppData(parsed);
        return { ...data, global: calculateGlobalStreak(data.global) };
      }
    }
  } catch (err) {
    console.error('Failed to load app data:', err);
  }

  const migrated = migrateLegacyState();
  if (migrated) {
    const touched = { ...migrated, global: calculateGlobalStreak(migrated.global) };
    saveAppData(touched);
    return touched;
  }

  const fresh = defaultAppData();
  return { ...fresh, global: calculateGlobalStreak(fresh.global) };
}

/** Logs study minutes for a plan phase and bumps the shared streak. */
export function logStudyActivity(
  data: AppData,
  planId: string,
  phaseId: number,
  minutes = 15
): AppData {
  const prev = data.progressByPlan[planId] ?? emptyPlanProgress();
  const todayStr = getLocalDateString();
  const next: AppData = {
    ...data,
    lastModifiedAt: Date.now(),
    global: calculateGlobalStreak({
      ...data.global,
      totalStudyMinutes: (data.global.totalStudyMinutes || 0) + minutes,
      historyMinutes: {
        ...(data.global.historyMinutes ?? {}),
        [todayStr]: (data.global.historyMinutes?.[todayStr] ?? 0) + minutes
      }
    }),
    progressByPlan: {
      ...data.progressByPlan,
      [planId]: { ...prev, lastStudiedPhaseId: phaseId }
    }
  };
  saveAppData(next);
  return next;
}

/** Downloads the complete v2 state (all plans + progress) as a JSON backup. */
export function exportAppDataAsJSON(data: AppData): void {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `plan-tracker-backup-${getLocalDateString()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
