import React, { useState } from 'react';
import { Bell, BellOff, Check, Clock, Send, X } from 'lucide-react';
import { AppSettings, Phase } from '../types';
import { REMINDER_TIME_OPTIONS, formatTime } from '../utils/time';
import {
  isNotificationSupported,
  requestNotificationPermission,
  sendTestNotification
} from '../utils/notifications';

interface NotificationBannerProps {
  settings: AppSettings;
  streak: number;
  activePhase: Phase;
  planName: string;
  onUpdateSettings: (updater: (prev: AppSettings) => AppSettings) => void;
}

const toggleButtonClass = (isActive: boolean) =>
  `px-1.5 py-0.5 rounded font-mono text-[10px] transition-colors cursor-pointer ${
    isActive ? 'bg-text text-page' : 'text-muted hover:text-text'
  }`;

export const NotificationBanner: React.FC<NotificationBannerProps> = ({
  settings,
  streak,
  activePhase,
  planName,
  onUpdateSettings
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
      onUpdateSettings((prev) => ({ ...prev, dailyReminderEnabled: true }));
      sendTestNotification(activePhase, streak, planName);
    }
  };

  const handleTestNotification = () => {
    setIsTesting(true);
    const sent = sendTestNotification(activePhase, streak, planName);
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
    onUpdateSettings((prev) => ({ ...prev, dailyReminderTime: newTime }));
  };

  const handleFormatChange = (format: '12h' | '24h') => {
    onUpdateSettings((prev) => ({ ...prev, timeFormat: format }));
  };

  const isEnabled = permission === 'granted' && settings.dailyReminderEnabled;

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
                ? `Scheduled for ${formatTime(settings.dailyReminderTime, settings.timeFormat)}. Next up: phase ${activePhase.id} — ${activePhase.shortTitle ?? activePhase.title}.`
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
                  value={settings.dailyReminderTime}
                  onChange={handleTimeChange}
                  className="bg-transparent text-text text-xs focus:outline-none cursor-pointer font-mono"
                >
                  {/* Fallback for any stored value outside the 30-min grid */}
                  {!REMINDER_TIME_OPTIONS.includes(settings.dailyReminderTime) && (
                    <option value={settings.dailyReminderTime} className="bg-page">
                      {formatTime(settings.dailyReminderTime, settings.timeFormat)}
                    </option>
                  )}
                  {REMINDER_TIME_OPTIONS.map((time) => (
                    <option key={time} value={time} className="bg-page">
                      {formatTime(time, settings.timeFormat)}
                    </option>
                  ))}
                </select>

                {/* Display format toggle */}
                <div
                  role="group"
                  aria-label="Time display format"
                  className="flex items-center gap-0.5 pl-1 ml-0.5 border-l border-line"
                >
                  <button
                    onClick={() => handleFormatChange('12h')}
                    aria-pressed={settings.timeFormat === '12h'}
                    title="12-hour clock"
                    className={toggleButtonClass(settings.timeFormat === '12h')}
                  >
                    12h
                  </button>
                  <button
                    onClick={() => handleFormatChange('24h')}
                    aria-pressed={settings.timeFormat === '24h'}
                    title="24-hour clock"
                    className={toggleButtonClass(settings.timeFormat === '24h')}
                  >
                    24h
                  </button>
                </div>
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
