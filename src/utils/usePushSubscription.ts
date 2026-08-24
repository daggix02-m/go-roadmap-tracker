/**
 * usePushSubscription — manages Web Push subscription lifecycle.
 *
 * - Detects push support + iOS install requirement.
 * - Subscribes to PushManager when user enables reminders.
 * - Stores subscription via Convex mutation.
 * - Unsubscribes on disable.
 */
import { useCallback, useEffect, useState } from 'react';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { validateVapidKey, urlBase64ToUint8Array } from './vapidKey';

function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export interface PushState {
  /** Push is technically supported (not iOS non-installed). */
  supported: boolean;
  /** iOS but not installed as PWA — needs install-first flow. */
  needsInstall: boolean;
  /** Currently subscribed to push. */
  subscribed: boolean;
  /** True while a subscribe/unsubscribe action is in progress. */
  loading: boolean;
}

export interface PushActions {
  subscribe: (reminderTime: string, tz: string, activePhaseLabel?: string) => Promise<void>;
  unsubscribe: () => Promise<void>;
}

export function usePushSubscription(): PushState & PushActions {
  const { isAuthenticated } = useConvexAuth();
  const vapidKey = useQuery(api.reminders.getVapidKey);
  const storeSubscription = useMutation(api.reminders.subscribe);
  const removeSubscription = useMutation(api.reminders.unsubscribe);

  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  const ios = isIOS();
  const standalone = isStandalone();
  const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window;
  const supported = pushSupported && !(ios && !standalone);
  const needsInstall = ios && !standalone;

  // Check existing subscription on mount.
  useEffect(() => {
    if (!pushSupported) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setSubscribed(!!sub);
      });
    });
  }, [pushSupported]);

  const subscribe = useCallback(
    async (reminderTime: string, tz: string, activePhaseLabel?: string) => {
      if (!pushSupported) return;

      // Validate VAPID key before attempting subscription — PushManager
      // throws a cryptic "AbortError: Registration failed - push service
      // error" when the key is invalid, with no actionable detail.
      const validation = validateVapidKey(vapidKey);
      if (!validation.valid) {
        console.error('[Push] Subscribe aborted — invalid VAPID key:', validation.reason);
        return;
      }

      // Check notification permission — PushManager.subscribe() requires
      // notification permission to be granted. Some browsers throw AbortError
      // if permission is 'denied' or 'default' instead of 'granted'.
      if ('Notification' in window && Notification.permission !== 'granted') {
        console.warn(
          `[Push] Subscribe blocked — notification permission is '${Notification.permission}'. ` +
          'Request permission before calling subscribe().'
        );
        return;
      }

      setLoading(true);
      try {
        const reg = await navigator.serviceWorker.ready;

        // Diagnostic: log the correct scope from the registration (not the controller)
        const swController = navigator.serviceWorker?.controller;
        const notifPerm = 'Notification' in window ? Notification.permission : 'unavailable';
        console.log('[Push] Starting subscription attempt', {
          vapidKeyLength: vapidKey?.length,
          notificationPermission: notifPerm,
          swActive: !!swController,
          swState: swController?.state ?? 'none',
          swScope: reg.scope,
        });

        // Ensure the service worker is fully activated before subscribing.
        // A stale SW in "waiting" state (from previous deployment) can cause
        // PushManager.subscribe() to fail with AbortError.

        // Case 1: SW is still installing — wait for it to finish
        if (reg.installing) {
          console.warn('[Push] Service worker is still installing — waiting');
          await new Promise<void>((resolve) => {
            reg.installing!.addEventListener('statechange', (e) => {
              if ((e.target as ServiceWorker).state === 'activated') resolve();
            });
          });
        }

        // Case 2: Stale SW is waiting — send SKIP_WAITING and wait for new controller
        if (reg.waiting) {
          console.warn('[Push] Service worker is waiting (stale) — sending SKIP_WAITING');
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          await new Promise<void>((resolve) => {
            navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
          });
        }

        // Case 3: No active controller yet — wait for one
        if (!navigator.serviceWorker.controller) {
          console.warn('[Push] No controlling service worker — waiting for controllerchange');
          await new Promise<void>((resolve) => {
            navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
          });
        }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey)
        });
        console.log('[Push] Subscription successful', { endpoint: sub.endpoint.slice(0, 50) + '...' });
        // Store in Convex.
        await storeSubscription({
          endpoint: sub.endpoint,
          subscriptionJson: JSON.stringify(sub.toJSON()),
          reminderTime,
          tz,
          activePhaseLabel
        });
        setSubscribed(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const name = err instanceof Error ? err.name : 'unknown';
        console.error(`[Push] Subscribe failed: ${name}: ${msg}`, err);

        // Actionable diagnostics for the most common failure modes
        if (name === 'AbortError') {
          const notifPerm = 'Notification' in window ? Notification.permission : 'unavailable';
          console.group('[Push] AbortError diagnostics');
          console.error('Notification permission:', notifPerm);
          console.error('VAPID key length:', vapidKey?.length ?? 'null');
          console.error('Service worker active:', !!navigator.serviceWorker?.controller);
          console.error('Secure context:', window.isSecureContext);
          console.error('');
          console.error('Common causes:');
          console.error('  1. Notification permission not granted (current:', notifPerm + ')');
          console.error('  2. Push notifications blocked at OS level (check system settings)');
          console.error('  3. VAPID keys mismatch between client and server (verify with validateVapidKeys)');
          console.error('  4. Push service temporarily unavailable (retry later)');
          console.error('');
          console.error('Fix steps:');
          console.error('  - Ensure notification permission is "granted" before subscribing');
          console.error('  - Check OS notification settings for this browser');
          console.error('  - Verify VAPID keys: call api.push.validateVapidKeys from Convex');
          console.error('  - Try in a different browser to isolate the issue');
          console.groupEnd();
        }
      } finally {
        setLoading(false);
      }
    },
    [pushSupported, vapidKey, storeSubscription]
  );

  const unsubscribe = useCallback(async () => {
    if (!pushSupported) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
      }
      // Always call the Convex mutation to delete server-side schedule,
      // even when the browser subscription is already gone (e.g. cleared
      // browser data). The mutation is idempotent — safe with no records.
      await removeSubscription();
      setSubscribed(false);
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
    } finally {
      setLoading(false);
    }
  }, [pushSupported, removeSubscription]);

  return { supported, needsInstall, subscribed, loading, subscribe, unsubscribe };
}
