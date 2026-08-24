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
import { validateVapidKey } from './vapidKey';

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
        console.error('Push subscribe aborted:', validation.reason);
        return;
      }

      // Diagnostic logging — helps identify why PushManager.subscribe() fails.
      // The "AbortError: push service error" can mean: invalid VAPID keys,
      // push permission denied, service worker not ready, or push service
      // unavailable.
      const perm = 'Notification' in window ? Notification.permission : 'unavailable';
      const swController = navigator.serviceWorker?.controller;
      console.log('[Push] Starting subscription attempt', {
        vapidKeyLength: vapidKey?.length,
        notificationPermission: perm,
        swActive: !!swController,
        swScope: (swController as { scope?: string })?.scope
      });

      setLoading(true);
      try {
        const reg = await navigator.serviceWorker.ready;

        // Ensure the service worker is actually active (not just "ready").
        // A newly registered SW may be in "installing" or "activating" state.
        if (reg.installing) {
          console.warn('[Push] Service worker is still installing — waiting');
          await new Promise<void>((resolve) => {
            reg.installing!.addEventListener('statechange', (e) => {
              if ((e.target as ServiceWorker).state === 'activated') resolve();
            });
          });
        }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey
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
        // Log the full error message — "AbortError: Registration failed -
        // push service error" usually means invalid VAPID keys or the push
        // service is unavailable (offline, blocked by browser settings).
        const msg = err instanceof Error ? err.message : String(err);
        const name = err instanceof Error ? err.name : 'unknown';
        console.error(`[Push] Subscribe failed: ${name}: ${msg}`, err);

        // Extra diagnostics for the most common failure
        if (name === 'AbortError') {
          console.error('[Push] AbortError通常意味着:');
          console.error('  1. VAPID密钥不匹配 (客户端和服务端不同)');
          console.error('  2. 推送通知被浏览器/系统阻止');
          console.error('  3. 推送服务不可用 (离线或被限制)');
          console.error('[Push] 请检查:');
          console.error('  - Convex环境变量 VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL 是否已设置');
          console.error('  - 浏览器通知权限是否已授予');
          console.error('  - 是否在HTTPS环境下 (推送需要HTTPS)');
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
