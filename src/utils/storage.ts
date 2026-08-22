import { UserState } from '../types';

const STORAGE_KEY = 'go_backend_roadmap_tracker_v1';

export const DEFAULT_USER_STATE: UserState = {
  completedPhases: [],
  criteriaChecked: {},
  stepChecked: {},
  userNotes: {},
  streak: 0,
  lastActiveDate: null,
  historyDates: [],
  dailyReminderEnabled: false,
  dailyReminderTime: '09:00',
  lastStudiedPhaseId: null,
  totalStudyMinutes: 0
};

export function loadUserState(): UserState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = { ...DEFAULT_USER_STATE };
      return calculateStreak(initial);
    }
    const parsed = JSON.parse(raw);
    const merged: UserState = {
      ...DEFAULT_USER_STATE,
      ...parsed,
      completedPhases: Array.isArray(parsed.completedPhases) ? parsed.completedPhases : [],
      criteriaChecked: parsed.criteriaChecked || {},
      stepChecked: parsed.stepChecked || {},
      userNotes: parsed.userNotes || {},
      historyDates: Array.isArray(parsed.historyDates) ? parsed.historyDates : []
    };
    return calculateStreak(merged);
  } catch (err) {
    console.error('Failed to load user state from localStorage:', err);
    return { ...DEFAULT_USER_STATE };
  }
}

export function saveUserState(state: UserState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save user state to localStorage:', err);
  }
}

export function calculateStreak(state: UserState): UserState {
  const now = new Date();
  const todayStr = getLocalDateString(now);

  if (!state.lastActiveDate) {
    return {
      ...state,
      streak: 1,
      lastActiveDate: todayStr,
      historyDates: [todayStr]
    };
  }

  if (state.lastActiveDate === todayStr) {
    // Already checked in today
    if (!state.historyDates.includes(todayStr)) {
      state.historyDates.push(todayStr);
    }
    return state;
  }

  // Calculate day difference
  const lastDate = new Date(state.lastActiveDate);
  const diffTime = Math.abs(now.getTime() - lastDate.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  let newStreak = state.streak;
  if (diffDays <= 1) {
    newStreak += 1;
  } else {
    // Missed a day or more
    newStreak = 1;
  }

  const updatedDates = [...state.historyDates];
  if (!updatedDates.includes(todayStr)) {
    updatedDates.push(todayStr);
  }

  return {
    ...state,
    streak: newStreak,
    lastActiveDate: todayStr,
    historyDates: updatedDates
  };
}

export function recordStudyActivity(state: UserState, phaseId: number, minutes = 15): UserState {
  const updated = calculateStreak({
    ...state,
    lastStudiedPhaseId: phaseId,
    totalStudyMinutes: (state.totalStudyMinutes || 0) + minutes
  });
  saveUserState(updated);
  return updated;
}

export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function exportUserDataAsJSON(state: UserState): void {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `go-tracker-backup-${getLocalDateString()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
