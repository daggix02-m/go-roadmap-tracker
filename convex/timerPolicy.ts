/**
 * timerPolicy — pure decision logic for the focus-timer expiry push.
 *
 * Kept free of Convex imports so it can be unit-tested with node:test
 * (test/timerPolicy.test.ts) and imported by convex/timerSchedule.ts.
 */

export type TimerFailureKind = 'gone' | 'auth' | 'transient';

export interface PushAttempt {
  ok: boolean;
  status?: number;
}

export interface TimerScheduleEntry {
  _id: string;
  userId: string;
  endsAtMs: number;
  kind: 'focus' | 'step';
  variant?: 'study' | 'break';
  phaseLabel?: string;
}

export interface TimerRoundResult {
  action: 'fire' | 'retry' | 'removeSchedule';
  failCount: number;
  lastError?: TimerFailureKind;
  removeEndpoints?: number[];
}

export const MAX_TIMER_FAILURES = 5;

export function classifyTimerFailure(status?: number): TimerFailureKind {
  if (status === 404 || status === 410) return 'gone';
  if (status === 400 || status === 401 || status === 403) return 'auth';
  return 'transient';
}

/**
 * Decide what happens after one cron round of sending push notifications
 * for an expired focus timer.
 *
 * • any success   → fire (notification delivered), reset failure tracking
 * • all gone      → remove schedule; nothing can ever deliver
 * • otherwise     → increment failCount and retry until cap
 */
export function evaluateTimerRound(
  entry: TimerScheduleEntry,
  attempts: PushAttempt[],
  currentFailCount = 0
): TimerRoundResult {
  const removeEndpoints = attempts
    .map((a, i) => (a.ok ? -1 : classifyTimerFailure(a.status) === 'gone' ? i : -1))
    .filter((i) => i >= 0);

  if (attempts.some((a) => a.ok)) {
    return {
      action: 'fire',
      failCount: 0,
      ...(removeEndpoints.length > 0 ? { removeEndpoints } : {})
    };
  }

  if (attempts.length === 0 || removeEndpoints.length === attempts.length) {
    return { action: 'removeSchedule', failCount: 0, lastError: 'gone' };
  }

  const failCount = currentFailCount + 1;
  const firstFailure = attempts.find((a) => !a.ok && classifyTimerFailure(a.status) !== 'gone');
  const lastError = classifyTimerFailure(firstFailure?.status);

  if (failCount >= MAX_TIMER_FAILURES) {
    return { action: 'removeSchedule', failCount, lastError };
  }
  return { action: 'retry', failCount, lastError };
}

export interface TimerNotification {
  title: string;
  body: string;
  tag: string;
}

/**
 * Build the push notification payload for an expired focus timer.
 */
export function buildTimerNotification(
  entry: TimerScheduleEntry,
  minutesStudied: number
): TimerNotification {
  if (entry.variant === 'break') {
    return {
      title: 'Break time over',
      body: `Your ${minutesStudied}-minute break is done. Ready to focus again?`,
      tag: 'break-complete'
    };
  }

  const phasePart = entry.phaseLabel ? ` — ${entry.phaseLabel}` : '';
  return {
    title: 'Focus session complete',
    body: entry.phaseLabel
      ? `${minutesStudied} min logged${phasePart}. Great work — take a break or keep going!`
      : `${minutesStudied} min logged. Open the app to see your progress.`,
    tag: 'focus-complete'
  };
}
