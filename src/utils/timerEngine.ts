// ---------------------------------------------------------------------------
// Shared wall-clock countdown engine (focus timer + per-step timers)
//
// Timers store an absolute deadline (`endsAtMs`) instead of ticking counters,
// so displayed time stays correct even when the tab throttles background JS,
// the device sleeps, or the PWA is closed and reopened. Persisted to a
// dedicated device-local storage key — timers intentionally do NOT sync.
// ---------------------------------------------------------------------------

export const TIMERS_STORAGE_KEY = 'plan_tracker_timers_v1';

export type TimerKind = 'focus' | 'step';

/** A single countdown. `endsAtMs !== null` means running; otherwise paused/idle. */
export interface TimerState {
  kind: TimerKind;
  /** Configured total duration in seconds. */
  durationSec: number;
  /** Absolute epoch-ms deadline while running; null while paused/idle. */
  endsAtMs: number | null;
  /** Seconds left whenever not running (idle or paused). */
  remainingSec: number;
  /** Step timers only: which phase/step owns this countdown. */
  phaseId?: number;
  stepIdx?: number;
  /** Focus timers only: study sessions log minutes; breaks don't. Engine ignores this. */
  variant?: 'study' | 'break';
}

/** Persisted shape: one focus timer + at most one active step timer. */
export interface TimersBlob {
  focus: TimerState | null;
  step: TimerState | null;
}

// --- pure state transitions -------------------------------------------------

export function createTimer(
  kind: TimerKind,
  durationSec: number,
  owner?: { phaseId: number; stepIdx: number }
): TimerState {
  return {
    kind,
    durationSec,
    endsAtMs: null,
    remainingSec: durationSec,
    ...(owner ?? {})
  };
}

/** Seconds left right now, whether running or not. Never negative. */
export function remainingSeconds(timer: TimerState, nowMs: number): number {
  if (timer.endsAtMs === null) return Math.max(0, Math.floor(timer.remainingSec));
  return Math.max(0, Math.ceil((timer.endsAtMs - nowMs) / 1000));
}

/** Start/resume: converts remaining seconds into an absolute deadline. */
export function startTimer(timer: TimerState, nowMs: number): TimerState {
  const remaining = remainingSeconds(timer, nowMs);
  if (remaining <= 0) return timer;
  return { ...timer, endsAtMs: nowMs + remaining * 1000 };
}

/** Pause: freezes whatever is left into `remainingSec`. */
export function pauseTimer(timer: TimerState, nowMs: number): TimerState {
  if (timer.endsAtMs === null) return timer;
  return {
    ...timer,
    endsAtMs: null,
    remainingSec: remainingSeconds(timer, nowMs)
  };
}

/** Reset to a (possibly new) full duration; also re-selecting a preset uses this. */
export function resetTimer(timer: TimerState, durationSec: number): TimerState {
  return { ...timer, durationSec, endsAtMs: null, remainingSec: durationSec };
}

export function isRunning(timer: TimerState): boolean {
  return timer.endsAtMs !== null;
}

/** True once the countdown reached zero (regardless of running/paused). */
export function hasExpired(timer: TimerState, nowMs: number): boolean {
  return remainingSeconds(timer, nowMs) <= 0;
}

/**
 * A timer that hit zero while nobody was watching (app closed / tab hidden).
 * Returns how long ago it finished in ms, or null if it hasn't finished.
 */
export function expiredAgoMs(timer: TimerState, nowMs: number): number | null {
  if (timer.endsAtMs === null) return null;
  const overshoot = nowMs - timer.endsAtMs;
  return overshoot >= 0 ? overshoot : null;
}

// --- formatting --------------------------------------------------------------

/** MM:SS below an hour, H:MM:SS at or above it. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

// --- persistence ---------------------------------------------------------------

const EMPTY_BLOB: TimersBlob = { focus: null, step: null };

function isValidTimer(value: unknown): value is TimerState {
  if (!value || typeof value !== 'object') return false;
  const t = value as Partial<TimerState>;
  return (
    (t.kind === 'focus' || t.kind === 'step') &&
    typeof t.durationSec === 'number' &&
    t.durationSec > 0 &&
    typeof t.remainingSec === 'number' &&
    (t.endsAtMs === null || typeof t.endsAtMs === 'number')
  );
}

/** Loads timers; corrupt or missing data yields empty state. */
export function loadTimers(): TimersBlob {
  try {
    const raw = localStorage.getItem(TIMERS_STORAGE_KEY);
    if (!raw) return EMPTY_BLOB;
    const parsed = JSON.parse(raw);
    const blob: TimersBlob = {
      focus: isValidTimer(parsed?.focus) ? parsed.focus : null,
      step: isValidTimer(parsed?.step) ? parsed.step : null
    };
    // A timer whose deadline passed long ago still surfaces (expired state is
    // meaningful — callers decide what to do); nothing pruned here.
    return blob;
  } catch {
    return EMPTY_BLOB;
  }
}

export function saveTimers(blob: TimersBlob): void {
  try {
    localStorage.setItem(TIMERS_STORAGE_KEY, JSON.stringify(blob));
  } catch (err) {
    console.error('Failed to persist timers:', err);
  }
}
