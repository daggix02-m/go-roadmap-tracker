import React, { useState, useRef, useEffect } from 'react';
import { Timer, TerminalSquare, BarChart3, Download, Flame, MoreHorizontal } from 'lucide-react';
import { AccentColor, Plan } from '../types';
import { ProgressSummary } from '../data/progress';
import { AccountButton } from './AccountButton';

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
  /** Replaces the static wordmark (used by the plan switcher). */
  titleNode?: React.ReactNode;
  onOpenStats: () => void;
  onOpenTimer: () => void;
  onOpenCheatsheet?: () => void;
  onOpenInstallGuide: () => void;
  canInstallPwa: boolean;
  onTriggerPwaInstall: () => void;
  onOpenAuthModal: () => void;
}

const iconButtonClass =
  'p-2 rounded-md border border-line text-muted hover:text-text hover:bg-hover hover:border-line-strong transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium';

export const Header: React.FC<HeaderProps> = ({
  plan,
  progress,
  streak,
  titleNode,
  onOpenStats,
  onOpenTimer,
  onOpenCheatsheet,
  onOpenInstallGuide,
  canInstallPwa,
  onTriggerPwaInstall,
  onOpenAuthModal
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <header className="bg-page/90 backdrop-blur-md border-b border-line">
      <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* Wordmark / switcher */}
          <div className="min-w-0">
            {titleNode ?? (
              <>
                <h1 className="text-sm font-semibold text-text tracking-tight truncate">
                  {plan.name}
                  <span className="ml-2 font-mono text-[11px] font-normal text-faint">
                    {progress.completedPhases}/{progress.totalPhases}
                  </span>
                </h1>
                {plan.description && (
                  <p className="text-[11px] text-muted truncate">{plan.description}</p>
                )}
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Streak — hidden on very small screens */}
            <div
              className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md border border-line text-xs font-medium text-warning"
              title={`${streak}-day streak`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span className="font-mono">{streak}d</span>
            </div>

            {/* Desktop: show all buttons inline */}
            <div className="hidden md:flex items-center gap-1">
              <button id="header-timer-btn" onClick={onOpenTimer} className={iconButtonClass} title="Focus timer">
                <Timer className="w-4 h-4" />
                <span>Timer</span>
              </button>

              {onOpenCheatsheet && (
                <button
                  id="header-cheatsheet-btn"
                  onClick={onOpenCheatsheet}
                  className={iconButtonClass}
                  title={`${plan.name} cheatsheet`}
                >
                  <TerminalSquare className="w-4 h-4" />
                  <span>Cheatsheet</span>
                </button>
              )}

              <button id="header-stats-btn" onClick={onOpenStats} className={iconButtonClass} title="Progress stats">
                <BarChart3 className="w-4 h-4" />
                <span>Stats</span>
              </button>

              {canInstallPwa ? (
                <button
                  id="header-install-btn"
                  onClick={onTriggerPwaInstall}
                  className="px-2.5 py-2 rounded-md bg-text text-page text-xs font-semibold flex items-center gap-1.5 transition-opacity hover:opacity-85 cursor-pointer"
                  title="Install app"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Install</span>
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

            {/* Mobile: overflow menu */}
            <div className="relative md:hidden" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className={iconButtonClass}
                title="Menu"
                aria-expanded={menuOpen}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-raised border border-line rounded-lg shadow-lg py-1 min-w-[160px]">
                  {/* Streak on mobile */}
                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-warning border-b border-line">
                    <Flame className="w-3.5 h-3.5" />
                    <span className="font-mono font-medium">{streak}-day streak</span>
                  </div>

                  <button
                    onClick={() => { onOpenTimer(); setMenuOpen(false); }}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-text hover:bg-hover w-full text-left cursor-pointer"
                  >
                    <Timer className="w-4 h-4 text-muted" />
                    Focus Timer
                  </button>

                  {onOpenCheatsheet && (
                    <button
                      onClick={() => { onOpenCheatsheet(); setMenuOpen(false); }}
                      className="flex items-center gap-2 px-3 py-2 text-xs text-text hover:bg-hover w-full text-left cursor-pointer"
                    >
                      <TerminalSquare className="w-4 h-4 text-muted" />
                      Cheatsheet
                    </button>
                  )}

                  <button
                    onClick={() => { onOpenStats(); setMenuOpen(false); }}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-text hover:bg-hover w-full text-left cursor-pointer"
                  >
                    <BarChart3 className="w-4 h-4 text-muted" />
                    Stats
                  </button>

                  {canInstallPwa ? (
                    <button
                      onClick={() => { onTriggerPwaInstall(); setMenuOpen(false); }}
                      className="flex items-center gap-2 px-3 py-2 text-xs text-text hover:bg-hover w-full text-left cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-muted" />
                      Install App
                    </button>
                  ) : (
                    <button
                      onClick={() => { onOpenInstallGuide(); setMenuOpen(false); }}
                      className="flex items-center gap-2 px-3 py-2 text-xs text-text hover:bg-hover w-full text-left cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-muted" />
                      Install Guide
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="w-px h-5 bg-line ml-1" aria-hidden="true" />
            <AccountButton onOpenAuthModal={onOpenAuthModal} />
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
