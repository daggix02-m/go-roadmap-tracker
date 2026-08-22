import React from 'react';
import { Timer, TerminalSquare, BarChart3, Download, Flame } from 'lucide-react';
import { AccentColor, Plan } from '../types';
import { ProgressSummary } from '../data/progress';

const ACCENT_BAR_CLASS: Record<AccentColor, string> = {
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger'
};

interface HeaderProps {
  plan: Plan;
  progress: ProgressSummary;
  streak: number;
  onOpenStats: () => void;
  onOpenTimer: () => void;
  onOpenCheatsheet?: () => void;
  onOpenInstallGuide: () => void;
  canInstallPwa: boolean;
  onTriggerPwaInstall: () => void;
}

const iconButtonClass =
  'p-2 rounded-md border border-line text-muted hover:text-text hover:bg-hover hover:border-line-strong transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium';

export const Header: React.FC<HeaderProps> = ({
  plan,
  progress,
  streak,
  onOpenStats,
  onOpenTimer,
  onOpenCheatsheet,
  onOpenInstallGuide,
  canInstallPwa,
  onTriggerPwaInstall
}) => {
  return (
    <header className="sticky top-0 z-40 bg-page/90 backdrop-blur-md border-b border-line">
      <div className="max-w-3xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* Wordmark */}
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-text tracking-tight truncate">
              {plan.name}
              <span className="ml-2 font-mono text-[11px] font-normal text-faint">
                {progress.completedPhases}/{progress.totalPhases}
              </span>
            </h1>
            {plan.description && (
              <p className="text-[11px] text-muted truncate">{plan.description}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-md border border-line text-xs font-medium text-warning"
              title={`${streak}-day streak`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span className="font-mono">{streak}d</span>
            </div>

            <button id="header-timer-btn" onClick={onOpenTimer} className={iconButtonClass} title="Focus timer">
              <Timer className="w-4 h-4" />
              <span className="hidden md:inline">Timer</span>
            </button>

            {onOpenCheatsheet && (
              <button
                id="header-cheatsheet-btn"
                onClick={onOpenCheatsheet}
                className={iconButtonClass}
                title={`${plan.name} cheatsheet`}
              >
                <TerminalSquare className="w-4 h-4" />
                <span className="hidden md:inline">Cheatsheet</span>
              </button>
            )}

            <button id="header-stats-btn" onClick={onOpenStats} className={iconButtonClass} title="Progress stats">
              <BarChart3 className="w-4 h-4" />
              <span className="hidden md:inline">Stats</span>
            </button>

            {canInstallPwa ? (
              <button
                id="header-install-btn"
                onClick={onTriggerPwaInstall}
                className="px-2.5 py-2 rounded-md bg-text text-page text-xs font-semibold flex items-center gap-1.5 transition-opacity hover:opacity-85 cursor-pointer"
                title="Install app"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Install</span>
              </button>
            ) : (
              <button
                id="header-guide-btn"
                onClick={onOpenInstallGuide}
                className={iconButtonClass}
                title="Install as app"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div
            role="progressbar"
            aria-valuenow={progress.overallPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Plan progress"
            className="h-1 w-full rounded-full bg-raised overflow-hidden"
          >
            <div
              className={`h-full ${ACCENT_BAR_CLASS[plan.accent]} transition-all duration-500 ease-out`}
              style={{ width: `${progress.overallPercent}%` }}
            />
          </div>
        </div>
      </div>
    </header>
  );
};
