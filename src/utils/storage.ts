import { AppData, GlobalActivity, PlanProgress } from '../types';

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

export const EMPTY_PLAN_PROGRESS: PlanProgress = {
  completedPhases: [],
  criteriaChecked: {},
  stepChecked: {},
  userNotes: {},
  lastStudiedPhaseId: null
};

export function emptyPlanProgress(): PlanProgress {
  return { ...EMPTY_PLAN_PROGRESS, completedPhases: [] };
}

function defaultAppData(): AppData {
  return {
    version: 2,
    activePlanId: 'go-roadmap',
    customPlans: [],
    settings: { dailyReminderEnabled: false, dailyReminderTime: '09:00', timeFormat: '12h' },
    global: { streak: 0, lastActiveDate: null, historyDates: [], totalStudyMinutes: 0 },
    progressByPlan: {}
  };
}

/** Defensive merge of parsed JSON into a complete AppData. */
export function normalizeAppData(parsed: Partial<AppData> | null | undefined): AppData {
  const base = defaultAppData();
  if (!parsed || typeof parsed !== 'object') return base;

  const settings = { ...base.settings };
  if (parsed.settings && typeof parsed.settings === 'object') {
    settings.dailyReminderEnabled = Boolean(parsed.settings.dailyReminderEnabled);
    if (typeof parsed.settings.dailyReminderTime === 'string') {
      settings.dailyReminderTime = parsed.settings.dailyReminderTime;
    }
    if (parsed.settings.timeFormat === '12h' || parsed.settings.timeFormat === '24h') {
      settings.timeFormat = parsed.settings.timeFormat;
    }
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
        lastStudiedPhaseId: typeof raw.lastStudiedPhaseId === 'number' ? raw.lastStudiedPhaseId : null
      };
    }
  }

  return {
    version: 2,
    activePlanId: typeof parsed.activePlanId === 'string' ? parsed.activePlanId : base.activePlanId,
    customPlans: Array.isArray(parsed.customPlans) ? parsed.customPlans : [],
    settings,
    global,
    progressByPlan
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
        totalStudyMinutes: typeof old.totalStudyMinutes === 'number' ? old.totalStudyMinutes : 0
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

export function saveAppData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(data));
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
  const next: AppData = {
    ...data,
    global: calculateGlobalStreak({
      ...data.global,
      totalStudyMinutes: (data.global.totalStudyMinutes || 0) + minutes
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
