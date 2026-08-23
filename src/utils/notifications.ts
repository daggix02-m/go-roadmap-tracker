import { Phase } from '../types';

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return 'denied';
  }
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return 'denied';
  }
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
}

export function sendDailyReminderNotification(
  activePhase: Phase,
  streak: number,
  planName = 'Plan'
): boolean {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  const title = `${planName} — ${activePhase.shortTitle || activePhase.title.split('—')[0]}`;
  const options: NotificationOptions & { renotify?: boolean } = {
    body: `Streak: ${streak} day${streak === 1 ? '' : 's'}. Next goal: ${(activePhase.what || activePhase.title).slice(0, 90)}...`,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: 'daily-reminder',
    renotify: true,
    data: {
      url: '/',
      phaseId: activePhase.id
    }
  };

  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, options);
      });
    } else {
      new Notification(title, options);
    }
    return true;
  } catch (err) {
    console.error('Failed to send notification:', err);
    return false;
  }
}

export function sendTestNotification(activePhase: Phase, streak: number, planName = 'Plan'): boolean {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  const title = planName;
  const options: NotificationOptions = {
    body: `Daily reminder is active. You are on ${activePhase.title.split('—')[0]} (${activePhase.shortTitle}). Streak: ${streak} days.`,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: 'test-reminder'
  };

  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, options);
      });
    } else {
      new Notification(title, options);
    }
    return true;
  } catch (err) {
    console.error('Failed to send test notification:', err);
    return false;
  }
}

/** Short two-note chime when a focus session finishes. Silent if audio is unavailable. */
export function playChime(): void {
  try {
    const audioCtx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
    osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  } catch {
    // Audio not available
  }
}

/** OS-level "focus session complete" notification (no-op without permission). */
export function notifyFocusComplete(phaseLabel: string, minutesStudied: number): void {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;
  const title = 'Focus session complete';
  const options: NotificationOptions = {
    body: `${minutesStudied} min logged — ${phaseLabel}.`,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: `focus-complete-${Date.now()}` // unique: sessions can complete back-to-back
  };
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, options));
    } else {
      new Notification(title, options);
    }
  } catch {
    // Notification unavailable
  }
}
