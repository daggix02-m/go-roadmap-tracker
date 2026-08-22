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

export function sendDailyReminderNotification(activePhase: Phase, streak: number): boolean {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  const title = `Go roadmap — ${activePhase.shortTitle || activePhase.title.split('—')[0]}`;
  const options: NotificationOptions & { renotify?: boolean } = {
    body: `Streak: ${streak} day${streak === 1 ? '' : 's'}. Next Goal: ${activePhase.what.slice(0, 90)}...`,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: 'go-daily-reminder',
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

export function sendTestNotification(activePhase: Phase, streak: number): boolean {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  const title = 'Go Roadmap Tracker';
  const options: NotificationOptions = {
    body: `Daily reminder is active. You are on ${activePhase.title.split('—')[0]} (${activePhase.shortTitle}). Streak: ${streak} days.`,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: 'go-test-reminder'
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
