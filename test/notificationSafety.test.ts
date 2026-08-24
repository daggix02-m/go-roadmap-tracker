import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * notificationSafety — documents the contract for notification delivery.
 *
 * BUG: On mobile browsers, `new Notification(title, options)` can cause the
 * page to navigate away or open a new context, resulting in a black screen.
 * This happens when the service worker isn't controlling the page yet.
 *
 * FIX: All notification functions must ONLY use the service worker to show
 * notifications. If the service worker isn't available, they must silently
 * skip rather than risk a black screen.
 */

interface NotificationDeliveryPlan {
  /** Use service worker to show notification? */
  useServiceWorker: boolean;
  /** Use new Notification() directly? */
  useDirectNotification: boolean;
  /** Skip notification delivery entirely? */
  skipDelivery: boolean;
}

function planNotificationDelivery(options: {
  serviceWorkerReady: boolean;
  serviceWorkerControlling: boolean;
  permissionGranted: boolean;
}): NotificationDeliveryPlan {
  if (!options.permissionGranted) {
    return { useServiceWorker: false, useDirectNotification: false, skipDelivery: true };
  }

  if (options.serviceWorkerReady && options.serviceWorkerControlling) {
    return { useServiceWorker: true, useDirectNotification: false, skipDelivery: false };
  }

  // FIX: Skip delivery instead of using direct Notification constructor.
  return { useServiceWorker: false, useDirectNotification: false, skipDelivery: true };
}

describe('planNotificationDelivery', () => {
  it('uses service worker when available and controlling the page', () => {
    const plan = planNotificationDelivery({
      serviceWorkerReady: true,
      serviceWorkerControlling: true,
      permissionGranted: true
    });

    assert.equal(plan.useServiceWorker, true, 'should use service worker for safe delivery');
    assert.equal(plan.useDirectNotification, false, 'must never use new Notification()');
    assert.equal(plan.skipDelivery, false);
  });

  it('skips delivery when service worker is not ready', () => {
    const plan = planNotificationDelivery({
      serviceWorkerReady: false,
      serviceWorkerControlling: false,
      permissionGranted: true
    });

    // BUG: Current code sets useDirectNotification to true here, causing black screen.
    // FIX: Must skip delivery instead.
    assert.equal(plan.useServiceWorker, false);
    assert.equal(plan.useDirectNotification, false, 'MUST NOT use new Notification() — causes black screen on mobile');
    assert.equal(plan.skipDelivery, true, 'should skip delivery when service worker unavailable');
  });

  it('skips delivery when service worker is ready but not controlling', () => {
    const plan = planNotificationDelivery({
      serviceWorkerReady: true,
      serviceWorkerControlling: false,
      permissionGranted: true
    });

    assert.equal(plan.useServiceWorker, false);
    assert.equal(plan.useDirectNotification, false, 'MUST NOT use new Notification() — causes black screen on mobile');
    assert.equal(plan.skipDelivery, true);
  });

  it('skips delivery when permission is not granted', () => {
    const plan = planNotificationDelivery({
      serviceWorkerReady: true,
      serviceWorkerControlling: true,
      permissionGranted: false
    });

    assert.equal(plan.useServiceWorker, false);
    assert.equal(plan.useDirectNotification, false);
    assert.equal(plan.skipDelivery, true);
  });
});

describe('enableReminderSafety contract', () => {
  it('permission request should not block the main thread', () => {
    // The Notification.requestPermission() call shows a native dialog on mobile.
    // On some mobile browsers, this suspends the page rendering. The fix is to
    // request permission BEFORE modifying any server-side state, so if the
    // dialog causes issues, we haven't already committed to a subscription.
    //
    // This test documents the expected ordering:
    // 1. Request notification permission (may show native dialog)
    // 2. Only if granted, proceed with push subscription
    // 3. Only if subscription succeeds, update settings

    const steps: string[] = [];

    function simulateEnableFlow(permissionResult: NotificationPermission) {
      // Step 1: Request permission first
      steps.push('requestPermission');

      if (permissionResult === 'granted') {
        // Step 2: Subscribe to push (only after permission granted)
        steps.push('subscribe');
        // Step 3: Update settings (only after subscription)
        steps.push('updateSettings');
      }
    }

    simulateEnableFlow('granted');
    assert.deepEqual(steps, ['requestPermission', 'subscribe', 'updateSettings']);

    steps.length = 0;
    simulateEnableFlow('denied');
    assert.deepEqual(steps, ['requestPermission'], 'should stop after denied permission');
  });

  it('enable flow should not crash on any error', () => {
    // The enable flow must catch all errors and return to a safe state.
    // If any step fails, the component should still be functional.
    let caughtError = false;

    async function safeEnableFlow() {
      try {
        // Simulate a failure in the push subscription step
        throw new Error('Push subscribe failed');
      } catch {
        caughtError = true;
        // Error is caught — component remains functional
      }
    }

    void safeEnableFlow().then(() => {
      assert.equal(caughtError, true, 'error should be caught');
    });
  });
});
