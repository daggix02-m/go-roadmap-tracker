import React, { useState } from 'react';
import { Bell, BellOff, Check, Clock, Download, Send } from 'lucide-react';
import { AppSettings, Phase } from '../types';
import {
  isNotificationSupported,
  requestNotificationPermission,
  sendTestNotification
} from '../utils/notifications';
import { usePushSubscription } from '../utils/usePushSubscription';

interface NotificationBannerProps {
  settings: AppSettings;
  streak: number;
  activePhase: Phase;
  planName: string;
  onUpdateSettings: (updater: (prev: AppSettings) => AppSettings) => void;
  onOpenInstallGuide: () => void;
}

export const NotificationBanner: React.FC<NotificationBannerProps> = ({
  settings,
  streak,
  activePhase,
  planName,
  onUpdateSettings,
  onOpenInstallGuide
}) => {
  const [isTesting, setIsTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  const push = usePushSubscription();
  const supported = isNotificationSupported();

  const handleEnableNotification = async () => {
    // iOS non-installed → guide to install first.
    if (push.needsInstall) {
      return; // The install prompt handles this via InstallGuideModal.
    }

    const phaseLabel = `Phase ${activePhase.id} — ${activePhase.shortTitle ?? activePhase.title}`;

    // Try push subscription first (works when app is closed).
    if (push.supported && !push.subscribed) {
      const tz = settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      await push.subscribe(settings.dailyReminderTime, tz, phaseLabel);
    }

    // Also enable local notification permission as fallback.
    if (supported) {
      const res = await requestNotificationPermission();
      setPermission(res);
      if (res === 'granted') {
        onUpdateSettings((prev) => ({ ...prev, dailyReminderEnabled: true }));
        sendTestNotification(activePhase, streak, planName);
      }
    } else {
      onUpdateSettings((prev) => ({ ...prev, dailyReminderEnabled: true }));
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

  const isEnabled = permission === 'granted' && settings.dailyReminderEnabled;

  return (
    <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 mt-4">
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
            <p className="font-medium text-text">Study reminders</p>
            <p className="text-xs text-muted leading-relaxed">
              {isEnabled
                ? `Every 2 hours, 5 AM – 11 PM (your time). Next up: phase ${activePhase.id} — ${activePhase.shortTitle ?? activePhase.title}.`
                : 'Get a nudge every 2 hours (5 AM – 11 PM) to keep your streak alive.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          {permission === 'granted' ? (
            <>
              <div className="flex items-center gap-1.5 bg-raised border border-line rounded-md px-2 py-1.5">
                <Clock className="w-3.5 h-3.5 text-muted" />
                <span className="text-xs font-mono text-text whitespace-nowrap">Every 2h · 5 AM–11 PM</span>
              </div>

              <button
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
          ) : push.needsInstall ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-warning font-medium">Install app first</span>
              <button
                onClick={onOpenInstallGuide}
                className="px-2.5 py-1.5 rounded-md border border-warning/40 bg-warning/5 text-warning text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Install
              </button>
            </div>
          ) : (
            <button
              id="enable-notification-btn"
              onClick={handleEnableNotification}
              disabled={push.loading}
              className="px-3 py-1.5 rounded-md bg-text text-page text-xs font-semibold transition-opacity hover:opacity-85 cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              {push.loading ? 'Setting up…' : 'Enable reminders'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
