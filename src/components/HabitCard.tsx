import React, { useMemo } from 'react';
import { Check, Flame, BarChart3 } from 'lucide-react';
import { Habit, HABIT_COLORS } from '../types';
import { calculateStreak, getHabitCompletions } from '../utils/habits';
import { HabitCompletions } from '../types';

interface HabitCardProps {
  habit: Habit;
  completions: HabitCompletions;
  isCompleted: boolean;
  onToggle: (habitId: string) => void;
  onShowStats: (habitId: string) => void;
}

/**
 * Individual habit row — Grit-style with color-coded checkbox,
 * emoji, title, streak indicator, and stats button.
 */
export const HabitCard: React.FC<HabitCardProps> = React.memo(({
  habit,
  completions,
  isCompleted,
  onToggle,
  onShowStats,
}) => {
  const habitCompletions = useMemo(
    () => getHabitCompletions(completions, habit.id),
    [completions, habit.id]
  );

  const streak = useMemo(
    () => calculateStreak(habitCompletions),
    [habitCompletions]
  );

  const colorConfig = HABIT_COLORS.find((c) => c.id === habit.color) ?? HABIT_COLORS[0];

  return (
    <div
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
        isCompleted
          ? 'bg-success/10 border-success/30'
          : 'bg-surface border-line hover:border-line-strong'
      }`}
    >
      {/* Color-coded checkbox */}
      <button
        onClick={() => onToggle(habit.id)}
        className={`relative w-6 h-6 rounded-md border-2 flex items-center justify-center transition-[background-color,border-color] shrink-0 cursor-pointer ${
          isCompleted
            ? `${colorConfig.cssClass} border-transparent`
            : 'border-line-strong hover:border-text/40'
        }`}
        aria-label={`${isCompleted ? 'Uncomplete' : 'Complete'} habit: ${habit.title}`}
        aria-pressed={isCompleted}
      >
        {isCompleted && (
          <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
        )}
      </button>

      {/* Habit info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm" aria-hidden="true">{habit.emoji}</span>
          <span
            className={`text-sm font-medium truncate ${
              isCompleted ? 'text-success line-through' : 'text-text'
            }`}
          >
            {habit.title}
          </span>
        </div>
        {habit.targetMinutes && (
          <span className="text-[11px] text-faint">
            {habit.targetMinutes} min/day
          </span>
        )}
      </div>

      {/* Streak indicator */}
      {streak.current > 0 && (
        <div
          className="flex items-center gap-1 text-[11px] font-mono text-warning"
          title={`${streak.current} day streak`}
        >
          <Flame className="w-3 h-3" aria-hidden="true" />
          <span>{streak.current}</span>
        </div>
      )}

      {/* Stats button */}
      <button
        onClick={() => onShowStats(habit.id)}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-hover transition-opacity cursor-pointer"
        aria-label={`Show stats for ${habit.title}`}
      >
        <BarChart3 className="w-3.5 h-3.5 text-faint" />
      </button>
    </div>
  );
});

HabitCard.displayName = 'HabitCard';
