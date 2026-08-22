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
  planName = 'Roadmap'
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

export function sendTestNotification(activePhase: Phase, streak: number, planName = 'Roadmap'): boolean {
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
