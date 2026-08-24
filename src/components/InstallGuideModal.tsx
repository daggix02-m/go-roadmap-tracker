import React from 'react';
import { Download, Share, Smartphone, Monitor, WifiOff, BellRing, X } from 'lucide-react';
import { useScrollLock } from '../utils/scrollLock';

interface InstallGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  canInstallPwa: boolean;
  onTriggerPwaInstall: () => void;
}

export const InstallGuideModal: React.FC<InstallGuideModalProps> = ({
  isOpen,
  onClose,
  canInstallPwa,
  onTriggerPwaInstall
}) => {
  useScrollLock(isOpen);
  if (!isOpen) return null;

  const stepBadge =
    'w-5 h-5 rounded-full bg-raised border border-line text-[10px] font-medium flex items-center justify-center text-muted shrink-0 font-mono';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Install as app"
        className="w-full max-w-md bg-surface border border-line rounded-xl p-5 sm:p-6 relative max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close install guide"
          className="absolute top-3.5 right-3.5 p-1.5 text-muted hover:text-text rounded-md hover:bg-hover transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5 mb-1">
          <Smartphone className="w-5 h-5 text-accent" />
          <h2 className="text-base font-semibold text-text">Install as app</h2>
        </div>
        <p className="text-xs text-muted mb-5 leading-relaxed">
          Add the tracker to your home screen for a fullscreen app experience with offline support
          and daily reminders.
        </p>

        {canInstallPwa && (
          <div className="mb-5 p-4 rounded-lg border border-accent/40 bg-accent/10 flex flex-col gap-2.5">
            <span className="text-sm font-medium text-text">One-tap install is available</span>
            <button
              onClick={() => {
                onTriggerPwaInstall();
                onClose();
              }}
              className="py-2.5 px-4 rounded-md bg-text text-page font-semibold text-sm flex items-center justify-center gap-2 transition-opacity hover:opacity-85 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Install now
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mb-5">
          <div className="p-3 rounded-lg border border-line bg-raised flex items-center gap-2.5 text-xs text-text/90">
            <WifiOff className="w-4 h-4 text-success shrink-0" />
            Works offline
          </div>
          <div className="p-3 rounded-lg border border-line bg-raised flex items-center gap-2.5 text-xs text-text/90">
            <BellRing className="w-4 h-4 text-accent shrink-0" />
            Daily reminders
          </div>
        </div>

        {/* iOS */}
        <div className="p-4 rounded-lg border border-line mb-3">
          <div className="flex items-center gap-2 text-sm font-medium text-text mb-3">
            <Share className="w-4 h-4 text-muted" />
            iOS — Safari
          </div>
          <ol className="space-y-2.5 text-xs text-muted leading-relaxed">
            <li className="flex items-start gap-2.5">
              <span className={stepBadge}>1</span>
              <span>Tap the <strong className="text-text">Share</strong> button at the bottom of Safari.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className={stepBadge}>2</span>
              <span>Scroll down and tap <strong className="text-text">Add to Home Screen</strong>.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className={stepBadge}>3</span>
              <span>Tap <strong className="text-text">Add</strong> in the top-right corner.</span>
            </li>
          </ol>
        </div>

        {/* Android */}
        <div className="p-4 rounded-lg border border-line mb-3">
          <div className="flex items-center gap-2 text-sm font-medium text-text mb-3">
            <Download className="w-4 h-4 text-muted" />
            Android — Chrome / Edge
          </div>
          <ol className="space-y-2.5 text-xs text-muted leading-relaxed">
            <li className="flex items-start gap-2.5">
              <span className={stepBadge}>1</span>
              <span>Open the browser menu (three vertical dots).</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className={stepBadge}>2</span>
              <span>
                Select <strong className="text-text">Install app</strong> or{' '}
                <strong className="text-text">Add to Home screen</strong>.
              </span>
            </li>
          </ol>
        </div>

        {/* Desktop */}
        <div className="p-4 rounded-lg border border-line">
          <div className="flex items-center gap-2 text-sm font-medium text-text mb-3">
            <Monitor className="w-4 h-4 text-muted" />
            Desktop — Chrome / Edge / Brave
          </div>
          <ol className="space-y-2.5 text-xs text-muted leading-relaxed">
            <li className="flex items-start gap-2.5">
              <span className={stepBadge}>1</span>
              <span>
                Look for the <strong className="text-text">install icon</strong> (a monitor with a
                down-arrow) in the address bar, or open the browser menu.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className={stepBadge}>2</span>
              <span>
                Click <strong className="text-text">Install</strong> /{' '}
                <strong className="text-text">Install Plan Tracker</strong>.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className={stepBadge}>3</span>
              <span>
                The app opens in its own window with an icon in your dock/taskbar — no browser
                chrome.
              </span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
};
