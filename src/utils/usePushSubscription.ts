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
      if (!pushSupported || !vapidKey) return;
      setLoading(true);
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey
        });
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
        console.error('Push subscribe failed:', err);
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
        await removeSubscription();
      }
      setSubscribed(false);
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
    } finally {
      setLoading(false);
    }
  }, [pushSupported, removeSubscription]);

  return { supported, needsInstall, subscribed, loading, subscribe, unsubscribe };
}
