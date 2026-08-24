/**
 * reminderPolicy — pure decision logic for the reminder cron.
 *
 * Kept free of Convex imports so it can be unit-tested with node:test
 * (test/reminderPolicy.test.ts) and imported by convex/reminders.ts.
 *
 * The bug this replaces: ANY failed push round used to delete the whole
 * reminder schedule silently — one transient error (or a subscription made
 * before VAPID keys were configured) and reminders stopped forever.
 */

export type PushFailureKind = 'gone' | 'auth' | 'transient';

export interface PushAttempt {
  ok: boolean;
  /** HTTP status from the push gateway, when the send failed. */
  status?: number;
}

export interface ReminderRoundResult {
  /** advance = push delivered · retry = keep schedule · removeSchedule = give up. */
  action: 'advance' | 'retry' | 'removeSchedule';
  /** Running consecutive-failure counter to persist on the schedule doc. */
  failCount: number;
  /** Why pushes are failing ('auth' → client should re-subscribe). */
  lastError?: PushFailureKind;
  /** Indices of attempts whose endpoints should be deleted (404/410). */
  removeEndpoints?: number[];
}

/** A schedule is only abandoned after this many consecutive failed rounds. */
export const MAX_CONSECUTIVE_FAILURES = 5;

export function classifyPushFailure(status?: number): PushFailureKind {
  if (status === 404 || status === 410) return 'gone';
  if (status === 400 || status === 401 || status === 403) return 'auth';
  return 'transient';
}

/**
 * Decide what happens to a user's reminder schedule after one cron round.
 *
 * • any success        → advance to the next slot, reset failure tracking
 * • all gone (or none) → remove the schedule; nothing can ever deliver
 * • otherwise          → increment failCount and retry until
 *   MAX_CONSECUTIVE_FAILURES consecutive rounds have failed
 */
export function evaluateReminderRound(
  attempts: PushAttempt[],
  state: { failCount?: number }
): ReminderRoundResult {
  const removeEndpoints = attempts
    .map((a, i) => (a.ok ? -1 : classifyPushFailure(a.status) === 'gone' ? i : -1))
    .filter((i) => i >= 0);

  if (attempts.some((a) => a.ok)) {
    return {
      action: 'advance',
      failCount: 0,
      ...(removeEndpoints.length > 0 ? { removeEndpoints } : {})
    };
  }

  // No deliverable subscription remains — dead schedule.
  if (attempts.length === 0 || removeEndpoints.length === attempts.length) {
    return { action: 'removeSchedule', failCount: 0, lastError: 'gone' };
  }

  const failCount = (state.failCount ?? 0) + 1;
  const firstFailure = attempts.find((a) => !a.ok && classifyPushFailure(a.status) !== 'gone');
  const lastError = classifyPushFailure(firstFailure?.status);

  if (failCount >= MAX_CONSECUTIVE_FAILURES) {
    return { action: 'removeSchedule', failCount, lastError };
  }
  return { action: 'retry', failCount, lastError };
}
