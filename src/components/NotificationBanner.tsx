import React, { useState } from 'react';
import { Bell, BellOff, Check, Clock, Send, X } from 'lucide-react';
import { Phase, UserState } from '../types';
import {
  isNotificationSupported,
  requestNotificationPermission,
  sendTestNotification
} from '../utils/notifications';

interface NotificationBannerProps {
  userState: UserState;
  activePhase: Phase;
  onUpdateState: (updater: (prev: UserState) => UserState) => void;
}

/** Every 30-minute slot of the day, stored as "HH:MM" (24h) for the scheduler. */
const REMINDER_TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hours = String(Math.floor(i / 2)).padStart(2, '0');
  const minutes = i % 2 === 0 ? '00' : '30';
  return `${hours}:${minutes}`;
});

/** "21:30" -> "9:30 PM" */
function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export const NotificationBanner: React.FC<NotificationBannerProps> = ({
  userState,
  activePhase,
  onUpdateState
}) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  const supported = isNotificationSupported();

  if (isDismissed) {
    return null;
  }

  const handleEnableNotification = async () => {
    if (!supported) {
      alert('Web Notifications are not supported in this browser. You can still track progress.');
      return;
    }

    const res = await requestNotificationPermission();
    setPermission(res);

    if (res === 'granted') {
      onUpdateState((prev) => ({
        ...prev,
        dailyReminderEnabled: true
      }));
      sendTestNotification(activePhase, userState.streak);
    }
  };

  const handleTestNotification = () => {
    setIsTesting(true);
    const sent = sendTestNotification(activePhase, userState.streak);
    if (sent) {
      setTestSuccess(true);
      setTimeout(() => setTestSuccess(false), 3000);
    } else if (permission !== 'granted') {
      handleEnableNotification();
    }
    setIsTesting(false);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTime = e.target.value;
    onUpdateState((prev) => ({
      ...prev,
      dailyReminderTime: newTime
    }));
  };

  const isEnabled = permission === 'granted' && userState.dailyReminderEnabled;

  return (
    <div className="max-w-3xl mx-auto px-4 mt-4">
      <div className="p-3.5 rounded-lg bg-surface border border-line flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`p-2 rounded-md shrink-0 ${
              isEnabled ? 'bg-accent/10 text-accent' : 'bg-raised text-muted'
            }`}
          >
            {isEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </div>
          <div className="min-w-0 text-sm">
            <p className="font-medium text-text">Daily reminder</p>
            <p className="text-xs text-muted leading-relaxed">
              {isEnabled
                ? `Scheduled for ${formatTime12(userState.dailyReminderTime)}. Next up: phase ${activePhase.id} — ${activePhase.shortTitle}.`
                : 'Get a daily nudge to keep your streak alive.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          {permission === 'granted' ? (
            <>
              <div className="flex items-center gap-1.5 bg-raised border border-line rounded-md px-2 py-1.5">
                <Clock className="w-3.5 h-3.5 text-muted" />
                <select
                  aria-label="Daily reminder time"
                  value={userState.dailyReminderTime}
                  onChange={handleTimeChange}
                  className="bg-transparent text-text text-xs focus:outline-none cursor-pointer font-mono"
                >
                  {/* Fallback for any stored value outside the 30-min grid */}
                  {!REMINDER_TIME_OPTIONS.includes(userState.dailyReminderTime) && (
                    <option value={userState.dailyReminderTime} className="bg-page">
                      {formatTime12(userState.dailyReminderTime)}
                    </option>
                  )}
                  {REMINDER_TIME_OPTIONS.map((time) => (
                    <option key={time} value={time} className="bg-page">
                      {formatTime12(time)}
                    </option>
                  ))}
                </select>
              </div>

              <button
                id="test-notification-btn"
                onClick={handleTestNotification}
                disabled={isTesting}
                className="px-2.5 py-1.5 rounded-md border border-line hover:border-line-strong hover:bg-hover text-muted hover:text-text text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                {testSuccess ? (
                  <span className="flex items-center gap-1 text-success">
                    <Check className="w-3.5 h-3.5" /> Sent
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Send className="w-3.5 h-3.5" /> Test
                  </span>
                )}
              </button>
            </>
          ) : (
            <button
              id="enable-notification-btn"
              onClick={handleEnableNotification}
              className="px-3 py-1.5 rounded-md bg-text text-page text-xs font-semibold transition-opacity hover:opacity-85 cursor-pointer whitespace-nowrap"
            >
              Enable reminders
            </button>
          )}

          <button
            onClick={() => setIsDismissed(true)}
            aria-label="Dismiss banner"
            className="p-1.5 text-faint hover:text-text rounded-md transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
