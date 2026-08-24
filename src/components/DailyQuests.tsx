import React from 'react';
import { Lock, Sparkles } from 'lucide-react';
import { QuestState } from '../types';
import { levelFromXp, xpForLevel } from '../utils/storage';

interface DailyQuestsProps {
  quests: QuestState;
  /**
   * The XP card is locked until the user completes a full phase (and stays
   * active). While locked, a notice explains that completing phases earns XP.
   */
  locked?: boolean;
}

/**
 * Home-page XP card: level, progress bar and total XP. XP is earned only by
 * completing full roadmap phases — the old manual checklist is gone.
 */
export const DailyQuests: React.FC<DailyQuestsProps> = ({ quests, locked = false }) => {
  const level = levelFromXp(quests.xp);
  const levelStart = xpForLevel(level);
  const nextStart = xpForLevel(level + 1);
  const levelPct = Math.min(100, ((quests.xp - levelStart) / (nextStart - levelStart)) * 100);

  return (
    <section aria-label="Experience points" className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold tracking-tight text-text">Experience</h2>
        <span
          className="flex items-center gap-1 font-mono text-[11px]"
          title={`${quests.xp} total experience`}
        >
          <Sparkles className="w-3 h-3 text-warning" aria-hidden="true" />
          <span className="text-text">{quests.xp}</span>
          <span className="text-faint">xp · L{level}</span>
        </span>
      </div>

      {/* Level progress */}
      <div
        className="h-0.5 w-full rounded-full bg-raised overflow-hidden mb-3"
        role="progressbar"
        aria-valuenow={Math.round(levelPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Level ${level} progress`}
      >
        <div
          className="h-full bg-accent transition-all duration-500 ease-out"
          style={{ width: `${levelPct}%` }}
        />
      </div>

      <p className="text-[13px] text-muted leading-relaxed">
        Complete a full roadmap phase to earn XP and level up.
      </p>

      {locked && (
        <p
          role="status"
          className="flex items-start gap-1.5 mt-3 text-[11px] leading-relaxed text-muted bg-raised border border-line rounded-md px-2.5 py-2"
        >
          <Lock className="w-3.5 h-3.5 shrink-0 text-faint mt-px" aria-hidden="true" />
          <span>XP is locked — finish a phase today to earn it.</span>
        </p>
      )}
    </section>
  );
};