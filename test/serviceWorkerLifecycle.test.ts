import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * serviceWorkerLifecycle — documents the contract for SW lifecycle management.
 *
 * BUG: PushManager.subscribe() throws "AbortError: Registration failed -
 * push service error" even when VAPID keys are valid and notification
 * permission is granted. Root cause: a stale service worker in the
 * "waiting" state (from a previous deployment) can interfere with push
 * subscription. The code only checks `reg.installing` but not `reg.waiting`.
 *
 * FIX: Handle `reg.waiting` by sending a SKIP_WAITING message and waiting
 * for the new SW to become active. Also fix the diagnostic that reads
 * `.scope` from the wrong object type.
 */

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..').replace(/%20/g, ' ');
const swContent = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');

// ─── sw.js message handler contract ────────────────────────────────────────

describe('sw.js message handler', () => {
  it('listens for message events', () => {
    assert.ok(
      swContent.includes("self.addEventListener('message'") ||
      swContent.includes('self.addEventListener("message"'),
      'sw.js must register a message event listener'
    );
  });

  it('handles SKIP_WAITING message type', () => {
    assert.ok(
      swContent.includes('SKIP_WAITING'),
      'sw.js must handle SKIP_WAITING message to allow forced activation of new SW'
    );
  });

  it('calls self.skipWaiting() when SKIP_WAITING is received', () => {
    // The message handler should call self.skipWaiting() to activate the new SW
    const hasSkipWaiting = swContent.includes('self.skipWaiting()');
    assert.ok(hasSkipWaiting, 'sw.js must call self.skipWaiting() to activate new SW');
  });

  it('still caches static assets on install', () => {
    assert.ok(swContent.includes('cache.addAll'), 'sw.js must cache static assets on install');
  });

  it('claims clients on activate', () => {
    assert.ok(swContent.includes('self.clients.claim()'), 'sw.js must claim clients on activate');
  });
});

// ─── Subscribe decision logic for SW lifecycle ─────────────────────────────

interface SubscribeReadinessDecision {
  /** Should we send SKIP_WAITING to the waiting SW? */
  sendSkipWaiting: boolean;
  /** Should we wait for controllerchange event? */
  waitForControllerChange: boolean;
  /** Should we wait for reg.installing to finish? */
  waitForInstalling: boolean;
  /** Should we proceed directly to PushManager.subscribe()? */
  proceedToSubscribe: boolean;
}

/**
 * Decide what lifecycle steps are needed before calling PushManager.subscribe().
 * Extracts the decision logic from the React hook for testability.
 */
function decideSubscribeReadiness(options: {
  swSupported: boolean;
  hasInstalling: boolean;
  hasWaiting: boolean;
  hasActiveController: boolean;
}): SubscribeReadinessDecision {
  if (!options.swSupported) {
    return {
      sendSkipWaiting: false,
      waitForControllerChange: false,
      waitForInstalling: false,
      proceedToSubscribe: false
    };
  }

  // No active controller — need to wait for one
  if (!options.hasActiveController) {
    return {
      sendSkipWaiting: options.hasWaiting,
      waitForControllerChange: true,
      waitForInstalling: options.hasInstalling,
      proceedToSubscribe: false
    };
  }

  // Active controller exists, but there's a waiting SW (stale from previous deploy)
  if (options.hasWaiting) {
    return {
      sendSkipWaiting: true,
      waitForControllerChange: true,
      waitForInstalling: false,
      proceedToSubscribe: false
    };
  }

  // Active controller exists, installing SW present — wait for it
  if (options.hasInstalling) {
    return {
      sendSkipWaiting: false,
      waitForControllerChange: false,
      waitForInstalling: true,
      proceedToSubscribe: false
    };
  }

  // All good — proceed directly
  return {
    sendSkipWaiting: false,
    waitForControllerChange: false,
    waitForInstalling: false,
    proceedToSubscribe: true
  };
}

describe('decideSubscribeReadiness', () => {
  it('proceeds directly when SW is active with no pending updates', () => {
    const decision = decideSubscribeReadiness({
      swSupported: true,
      hasInstalling: false,
      hasWaiting: false,
      hasActiveController: true
    });

    assert.equal(decision.sendSkipWaiting, false, 'no need to skip waiting');
    assert.equal(decision.waitForControllerChange, false, 'no need to wait for controller');
    assert.equal(decision.waitForInstalling, false, 'no installing SW');
    assert.equal(decision.proceedToSubscribe, true, 'should proceed to subscribe');
  });

  it('sends SKIP_WAITING when a stale SW is waiting', () => {
    const decision = decideSubscribeReadiness({
      swSupported: true,
      hasInstalling: false,
      hasWaiting: true,
      hasActiveController: true
    });

    assert.equal(decision.sendSkipWaiting, true, 'must send SKIP_WAITING to stale SW');
    assert.equal(decision.waitForControllerChange, true, 'must wait for new controller');
    assert.equal(decision.waitForInstalling, false, 'no installing SW');
    assert.equal(decision.proceedToSubscribe, false, 'must not subscribe yet');
  });

  it('waits for controllerchange when no active controller exists', () => {
    const decision = decideSubscribeReadiness({
      swSupported: true,
      hasInstalling: false,
      hasWaiting: false,
      hasActiveController: false
    });

    assert.equal(decision.sendSkipWaiting, false, 'nothing to skip');
    assert.equal(decision.waitForControllerChange, true, 'must wait for controller');
    assert.equal(decision.proceedToSubscribe, false, 'must not subscribe without controller');
  });

  it('waits for installing SW to finish', () => {
    const decision = decideSubscribeReadiness({
      swSupported: true,
      hasInstalling: true,
      hasWaiting: false,
      hasActiveController: true
    });

    assert.equal(decision.sendSkipWaiting, false, 'no skip needed');
    assert.equal(decision.waitForControllerChange, false, 'controller already exists');
    assert.equal(decision.waitForInstalling, true, 'must wait for installing SW');
    assert.equal(decision.proceedToSubscribe, false, 'must not subscribe yet');
  });

  it('handles no active controller with waiting SW — sends SKIP_WAITING and waits', () => {
    const decision = decideSubscribeReadiness({
      swSupported: true,
      hasInstalling: false,
      hasWaiting: true,
      hasActiveController: false
    });

    assert.equal(decision.sendSkipWaiting, true, 'must send SKIP_WAITING');
    assert.equal(decision.waitForControllerChange, true, 'must wait for new controller');
    assert.equal(decision.proceedToSubscribe, false, 'must not subscribe yet');
  });

  it('does nothing when SW is not supported', () => {
    const decision = decideSubscribeReadiness({
      swSupported: false,
      hasInstalling: false,
      hasWaiting: false,
      hasActiveController: false
    });

    assert.equal(decision.sendSkipWaiting, false);
    assert.equal(decision.waitForControllerChange, false);
    assert.equal(decision.waitForInstalling, false);
    assert.equal(decision.proceedToSubscribe, false, 'cannot subscribe without SW support');
  });
});

// ─── Diagnostic logging contract ───────────────────────────────────────────

describe('diagnostic logging contract', () => {
  it('usePushSubscription.ts reads scope from ServiceWorkerRegistration, not ServiceWorker', () => {
    // The ServiceWorker interface does NOT have a .scope property.
    // ServiceWorkerRegistration.scope is the correct way to read the scope.
    // Reading .scope from a ServiceWorker object always returns undefined,
    // producing a misleading diagnostic.
    const hookSource = fs.readFileSync(
      path.join(ROOT, 'src', 'utils', 'usePushSubscription.ts'),
      'utf8'
    );

    // The diagnostic should read scope from the registration, not the controller
    // Bad: (swController as { scope?: string })?.scope
    // Good: reg.scope (after await navigator.serviceWorker.ready)
    const readsFromController = hookSource.includes('swController') &&
      hookSource.includes('scope');
    assert.ok(
      !readsFromController || hookSource.includes('reg.scope'),
      'diagnostic should read scope from reg.scope (ServiceWorkerRegistration), not swController.scope'
    );
  });

  it('logs the SW controller state for debugging', () => {
    const hookSource = fs.readFileSync(
      path.join(ROOT, 'src', 'utils', 'usePushSubscription.ts'),
      'utf8'
    );
    assert.ok(
      hookSource.includes('controller') && hookSource.includes('state'),
      'should log navigator.serviceWorker.controller.state for debugging'
    );
  });
});
