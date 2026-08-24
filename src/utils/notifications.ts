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

/** One scheduled tone of the timer-expiry alarm. */
export interface AlarmBeep {
  frequencyHz: number;
  startOffsetSec: number;
  durationSec: number;
}

/**
 * Three rising beeps (E5 → A5 → C6). Rising pitch reads as "finished well"
 * rather than an error buzz; the whole pattern stays under 1.5s so it is
 * noticeable without nagging.
 */
export function buildAlarmBeeps(): AlarmBeep[] {
  return [
    { frequencyHz: 659.25, startOffsetSec: 0, durationSec: 0.16 },
    { frequencyHz: 880, startOffsetSec: 0.22, durationSec: 0.16 },
    { frequencyHz: 1046.5, startOffsetSec: 0.44, durationSec: 0.28 }
  ];
}

/** Louder triple-beep when a focus/break timer hits zero. Safe to call anywhere. */
export async function playAlarm(): Promise<void> {
  try {
    const audioCtx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    // Background tabs suspend audio contexts; resume() unlocks them because
    // starting the timer was a user gesture.
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    const t0 = audioCtx.currentTime + 0.02;
    for (const beep of buildAlarmBeeps()) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(beep.frequencyHz, t0 + beep.startOffsetSec);
      gain.gain.setValueAtTime(0.0001, t0 + beep.startOffsetSec);
      gain.gain.exponentialRampToValueAtTime(
        0.35,
        t0 + beep.startOffsetSec + 0.015
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        t0 + beep.startOffsetSec + beep.durationSec
      );
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t0 + beep.startOffsetSec);
      osc.stop(t0 + beep.startOffsetSec + beep.durationSec + 0.02);
    }
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
