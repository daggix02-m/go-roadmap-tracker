import React from 'react';
import { Timer, TerminalSquare, BarChart3, Download, Flame } from 'lucide-react';
import { UserState } from '../types';
import { ROADMAP_DATA } from '../data/roadmapData';
import { getProgressSummary } from '../data/progress';

interface HeaderProps {
  userState: UserState;
  onOpenStats: () => void;
  onOpenTimer: () => void;
  onOpenCheatsheet: () => void;
  onOpenInstallGuide: () => void;
  canInstallPwa: boolean;
  onTriggerPwaInstall: () => void;
}

const iconButtonClass =
  'p-2 rounded-md border border-line text-muted hover:text-text hover:bg-hover hover:border-line-strong transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium';

export const Header: React.FC<HeaderProps> = ({
  userState,
  onOpenStats,
  onOpenTimer,
  onOpenCheatsheet,
  onOpenInstallGuide,
  canInstallPwa,
  onTriggerPwaInstall
}) => {
  const progress = getProgressSummary(userState);

  return (
    <header className="sticky top-0 z-40 bg-page/90 backdrop-blur-md border-b border-line">
      <div className="max-w-3xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* Wordmark */}
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-text tracking-tight truncate">
              Go Backend Roadmap
              <span className="ml-2 font-mono text-[11px] font-normal text-faint">
                {progress.completedPhases}/{progress.totalPhases}
              </span>
            </h1>
            <p className="text-[11px] text-muted truncate">Foundations to production</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-md border border-line text-xs font-medium text-warning"
              title={`${userState.streak}-day streak`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span className="font-mono">{userState.streak}d</span>
            </div>

            <button id="header-timer-btn" onClick={onOpenTimer} className={iconButtonClass} title="Focus timer">
              <Timer className="w-4 h-4" />
              <span className="hidden md:inline">Timer</span>
            </button>

            <button
              id="header-cheatsheet-btn"
              onClick={onOpenCheatsheet}
              className={iconButtonClass}
              title="Go cheatsheet"
            >
              <TerminalSquare className="w-4 h-4" />
              <span className="hidden md:inline">Cheatsheet</span>
            </button>

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
            aria-label="Roadmap progress"
            className="h-1 w-full rounded-full bg-raised overflow-hidden"
          >
            <div
              className="h-full bg-accent transition-all duration-500 ease-out"
              style={{ width: `${progress.overallPercent}%` }}
            />
          </div>
        </div>
      </div>
    </header>
  );
};
