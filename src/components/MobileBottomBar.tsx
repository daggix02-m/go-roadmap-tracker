import React from 'react';
import { Timer, TerminalSquare, BarChart3, CircleCheck } from 'lucide-react';
import { Phase } from '../types';

interface MobileBottomBarProps {
  activePhase: Phase;
  totalPhases: number;
  completedCount: number;
  onJumpToActive: () => void;
  onOpenTimer: () => void;
  onOpenStats: () => void;
  onOpenCheatsheet?: () => void;
}

/**
 * Mobile-only bottom bar: current phase (tap to jump) plus one-tap access to
 * the most-used surfaces — Timer, Cheatsheet, Stats. Replaces the overflow
 * menu's two-tap flow for those actions and merges with the old DailyFocusBar
 * role. Desktop keeps the header buttons + DailyFocusBar unchanged.
 */
export const MobileBottomBar: React.FC<MobileBottomBarProps> = ({
  activePhase,
  totalPhases,
  completedCount,
  onJumpToActive,
  onOpenTimer,
  onOpenStats,
  onOpenCheatsheet
}) => {
  const isAllComplete = completedCount >= totalPhases;

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 bg-page/95 backdrop-blur-md border-t border-line safe-bottom md:hidden">
      <div className="max-w-3xl mx-auto px-4 pt-2.5 pb-1 flex items-center justify-between gap-3">
        <button
          onClick={onJumpToActive}
          className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer group"
          title="Scroll to current phase"
        >
          <span className="shrink-0 w-8 h-8 rounded-md border border-line flex items-center justify-center text-muted group-hover:text-text transition-colors">
            {isAllComplete ? (
              <CircleCheck className="w-4 h-4 text-success" />
            ) : (
              <span className="font-mono text-xs">{String(activePhase.id).padStart(2, '0')}</span>
            )}
          </span>
          <span className="min-w-0">
            <span className="block font-mono text-[10px] uppercase tracking-wider text-faint">
              {isAllComplete ? 'Plan complete' : 'Current phase'}
            </span>
            <span className="block text-xs font-medium text-text truncate group-hover:text-accent transition-colors">
              {isAllComplete
                ? `All ${totalPhases} phases completed`
                : activePhase.shortTitle ?? activePhase.title}
            </span>
          </span>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenCheatsheet && (
            <button
              onClick={onOpenCheatsheet}
              aria-label="Open cheatsheet"
              title="Cheatsheet"
              className="min-h-10 min-w-10 flex items-center justify-center rounded-md text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer"
            >
              <TerminalSquare className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onOpenTimer}
            aria-label="Open focus timer"
            title="Focus timer"
            className="min-h-10 min-w-10 flex items-center justify-center rounded-md text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer"
          >
            <Timer className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenStats}
            aria-label="Open stats"
            title="Progress stats"
            className="min-h-10 min-w-10 flex items-center justify-center rounded-md text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer"
          >
            <BarChart3 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};