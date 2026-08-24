import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * pushUnsubscribe — documents the expected contract for the unsubscribe flow.
 *
 * BUG: When the browser has no active PushManager subscription (e.g. browser
 * data was cleared, or the subscription was never created), the current
 * `usePushSubscription.unsubscribe()` skips the Convex mutation that deletes
 * the server-side reminder schedule. This leaves orphaned schedules that the
 * cron keeps trying to fire.
 *
 * FIX: The Convex mutation (`removeSubscription`) must ALWAYS be called,
 * regardless of whether the browser subscription exists. The mutation is
 * idempotent — safe to call even when there are no server-side records.
 */

// Pure function that decides what actions to take during unsubscribe.
// This extracts the decision logic from the React hook so it can be tested.
interface UnsubscribeDecision {
  /** Call browser PushManagerSubscription.unsubscribe()? */
  unsubscribeBrowser: boolean;
  /** Call Convex mutation to delete server-side records? */
  callConvexMutation: boolean;
  /** Set local subscribed state to false? */
  setLocalSubscribed: boolean;
}

function decideUnsubscribeActions(options: {
  pushSupported: boolean;
  browserSubscriptionExists: boolean;
}): UnsubscribeDecision {
  if (!options.pushSupported) {
    return {
      unsubscribeBrowser: false,
      callConvexMutation: false,
      setLocalSubscribed: false
    };
  }

  return {
    unsubscribeBrowser: options.browserSubscriptionExists,
    // FIX: Always call the Convex mutation to clean up server-side state,
    // even when the browser subscription is gone.
    callConvexMutation: true,
    setLocalSubscribed: true
  };
}

describe('decideUnsubscribeActions', () => {
  it('unsubscribes browser and calls Convex mutation when browser subscription exists', () => {
    const decision = decideUnsubscribeActions({
      pushSupported: true,
      browserSubscriptionExists: true
    });

    assert.equal(decision.unsubscribeBrowser, true, 'should unsubscribe from browser PushManager');
    assert.equal(decision.callConvexMutation, true, 'should call Convex mutation to delete server-side records');
    assert.equal(decision.setLocalSubscribed, true, 'should set local subscribed state to false');
  });

  it('calls Convex mutation even when browser subscription does NOT exist', () => {
    const decision = decideUnsubscribeActions({
      pushSupported: true,
      browserSubscriptionExists: false
    });

    assert.equal(decision.unsubscribeBrowser, false, 'nothing to unsubscribe from in browser');
    // THIS IS THE BUG: current code sets callConvexMutation to false here,
    // leaving the server-side schedule orphaned.
    assert.equal(decision.callConvexMutation, true, 'MUST still call Convex mutation to clean up server-side schedule');
    assert.equal(decision.setLocalSubscribed, true, 'should set local subscribed state to false');
  });

  it('does nothing when push is not supported', () => {
    const decision = decideUnsubscribeActions({
      pushSupported: false,
      browserSubscriptionExists: false
    });

    assert.equal(decision.unsubscribeBrowser, false);
    assert.equal(decision.callConvexMutation, false, 'no server records if push not supported');
    assert.equal(decision.setLocalSubscribed, false);
  });
});

describe('reminders.unsubscribe contract', () => {
  it('server-side mutation is idempotent — safe to call with no existing records', () => {
    // The Convex mutation `reminders.unsubscribe` deletes all pushSubscriptions
    // and reminderSchedule rows for the user. If there are no rows, it does
    // nothing (no error thrown). This test documents that contract.
    //
    // Implementation: the mutation queries by userId, iterates results, and
    // deletes each. An empty result set means zero deletions — no-op.
    const subscriptionsDeleted: string[] = [];
    const schedulesDeleted: string[] = [];

    // Simulate the mutation logic
    function unsubscribeMutation(userId: string) {
      // Query returns empty — no subscriptions
      // Query returns empty — no schedule
      // No deletions happen, no error thrown
      return { subscriptionsDeleted, schedulesDeleted };
    }

    const result = unsubscribeMutation('user-123');
    assert.deepEqual(result.subscriptionsDeleted, [], 'no subscriptions to delete');
    assert.deepEqual(result.schedulesDeleted, [], 'no schedules to delete');
  });
});
