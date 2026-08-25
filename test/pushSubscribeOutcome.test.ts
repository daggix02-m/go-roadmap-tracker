import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decideSubscribeOutcome } from '../src/utils/pushReminderPolicy';
import { isAuthError, authErrorMessage } from '../src/utils/authErrors';

/**
 * pushSubscribeOutcome — documents the contract for what happens after the
 * browser-side PushManager.subscribe() succeeds.
 *
 * BUG: `usePushSubscription.subscribe()` calls `storeSubscription` (the
 * `reminders:subscribe` mutation) AFTER the browser subscription is created.
 * When that mutation throws (e.g. "Not authenticated" for a stale/absent
 * session), the browser subscription is left behind while local state says
 * "not subscribed" — on the next page load `pushManager.getSubscription()`
 * finds the orphan and flips the UI to "enabled" with no server-side schedule.
 *
 * FIX: Decide the outcome atomically. When the server mutation fails:
 *   - local `subscribed` stays false,
 *   - the just-created browser subscription is rolled back (best-effort),
 *   - auth failures are classified so the UI can surface a friendly message.
 */

describe('decideSubscribeOutcome', () => {
  it('marks subscribed when the server mutation succeeds', () => {
    const outcome = decideSubscribeOutcome({
      browserSubscriptionCreated: true,
      serverMutationOk: true,
      authError: false
    });

    assert.equal(outcome.subscribed, true, 'should report subscribed');
    assert.equal(outcome.rollbackBrowser, false, 'nothing to roll back on success');
    assert.equal(outcome.errorType, 'none');
  });

  it('rolls back the browser subscription when the server mutation fails', () => {
    const outcome = decideSubscribeOutcome({
      browserSubscriptionCreated: true,
      serverMutationOk: false,
      authError: false
    });

    assert.equal(outcome.subscribed, false, 'MUST NOT report subscribed after a server failure');
    assert.equal(
      outcome.rollbackBrowser,
      true,
      'MUST roll back the orphaned browser subscription to avoid state drift'
    );
    assert.equal(outcome.errorType, 'other');
  });

  it('classifies server auth failures separately', () => {
    const outcome = decideSubscribeOutcome({
      browserSubscriptionCreated: true,
      serverMutationOk: false,
      authError: true
    });

    assert.equal(outcome.errorType, 'auth', 'auth failures must be distinguishable');
    assert.equal(outcome.subscribed, false);
    assert.equal(outcome.rollbackBrowser, true);
  });

  it('does not attempt a rollback when no browser subscription was created', () => {
    const outcome = decideSubscribeOutcome({
      browserSubscriptionCreated: false,
      serverMutationOk: false,
      authError: false
    });

    assert.equal(outcome.rollbackBrowser, false, 'nothing to unsubscribe');
    assert.equal(outcome.subscribed, false);
  });
});

describe('auth failure classification', () => {
  it('detects "Not authenticated" as an auth error', () => {
    assert.equal(isAuthError('Not authenticated'), true);
    assert.equal(isAuthError('Error: [CONVEX M(reminders:subscribe)] Server Error. Not authenticated.'), true);
  });

  it('detects the stale-token verifier errors as auth errors', () => {
    assert.equal(isAuthError('No auth provider found matching the given token'), true);
    assert.equal(isAuthError('Failed to authenticate user'), true);
  });

  it('does not flag unrelated server errors as auth errors', () => {
    assert.equal(isAuthError('Backend error: 500'), false);
    assert.equal(isAuthError('OptimisticConcurrencyControlFailure'), false);
  });

  it('maps auth failures to a friendly re-sign-in message', () => {
    assert.equal(
      authErrorMessage('Server Error\n  Not authenticated'),
      'Session expired — please sign in again.'
    );
  });
});
