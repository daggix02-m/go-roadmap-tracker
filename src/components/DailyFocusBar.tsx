import React from 'react';
import { ArrowUpRight, Timer, CircleCheck } from 'lucide-react';
import { Phase } from '../types';

interface DailyFocusBarProps {
  activePhase: Phase;
  totalPhases: number;
  completedCount: number;
  onJumpToActive: () => void;
  onOpenTimer: () => void;
}

export const DailyFocusBar: React.FC<DailyFocusBarProps> = ({
  activePhase,
  totalPhases,
  completedCount,
  onJumpToActive,
  onOpenTimer
}) => {
  const isAllComplete = completedCount >= totalPhases;

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 bg-page/95 backdrop-blur-md border-t border-line safe-bottom">
      <div className="max-w-3xl mx-auto px-4 pt-2.5 flex items-center justify-between gap-3">
        <button
          onClick={onJumpToActive}
          className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
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
            <span className="block text-xs sm:text-sm font-medium text-text truncate group-hover:text-accent transition-colors">
              {isAllComplete ? `All ${totalPhases} phases completed` : `${activePhase.shortTitle ?? activePhase.title}`}
            </span>
          </span>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOpenTimer}
            aria-label="Open focus timer"
            className="p-2 rounded-md border border-line text-muted hover:text-text hover:bg-hover hover:border-line-strong transition-colors cursor-pointer"
          >
            <Timer className="w-4 h-4" />
          </button>
          <button
            onClick={onJumpToActive}
            className="px-3 py-1.5 rounded-md bg-text text-page text-xs font-semibold flex items-center gap-1 transition-opacity hover:opacity-85 cursor-pointer"
          >
            Jump to phase
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
