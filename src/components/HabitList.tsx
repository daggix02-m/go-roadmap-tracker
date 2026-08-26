import React, { useMemo, useState } from 'react';
import { Plus, Trophy, Flame, AlertTriangle } from 'lucide-react';
import { Habit, HabitCompletions, HabitColor } from '../types';
import { HabitCard } from './HabitCard';
import { getLocalDateString } from '../utils/storage';
import { calculateStreakWithPenalty, getStreakDisplay } from '../utils/habits';

interface HabitListProps {
  habits: Habit[];
  completions: HabitCompletions;
  onToggleCompletion: (habitId: string, day: string) => void;
  onAddHabit: () => void;
  onShowStats: (habitId: string) => void;
  onApplyTemplate?: (templateId: string) => void;
}

/**
 * Daily habit list — Grit-style home page with calendar,
 * streak display, and one-click habit completion.
 */
export const HabitList: React.FC<HabitListProps> = ({
  habits,
  completions,
  onToggleCompletion,
  onAddHabit,
  onShowStats,
  onApplyTemplate,
}) => {
  const today = useMemo(() => getLocalDateString(), []);

  const enabledHabits = useMemo(
    () => habits.filter((h) => h.enabled && !h.deleted),
    [habits]
  );

  // Calculate overall streak across all habits
  const overallStreak = useMemo(() => {
    // Merge all habit completions into one day→completed map
    const merged: Record<string, boolean> = {};
    for (const habit of enabledHabits) {
      const habitCompletions = completions[habit.id] ?? {};
      for (const [date, completed] of Object.entries(habitCompletions)) {
        if (completed) {
          merged[date] = true;
        }
      }
    }
    return calculateStreakWithPenalty(merged);
  }, [enabledHabits, completions]);

  const streakDisplay = getStreakDisplay(overallStreak.current, overallStreak.penalty);

  const todayCompletions = useMemo(() => {
    const completed = enabledHabits.filter(
      (h) => completions[h.id]?.[today]
    ).length;
    return { completed, total: enabledHabits.length };
  }, [enabledHabits, completions, today]);

  const allComplete =
    todayCompletions.total > 0 &&
    todayCompletions.completed === todayCompletions.total;

  const handleToggle = (habitId: string) => {
    onToggleCompletion(habitId, today);
  };

  return (
    <section
      aria-label="Daily habits"
      className="rounded-lg border border-line bg-surface p-4 sm:p-5 space-y-4"
    >
      {/* Header with streak */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold tracking-tight text-text">
            Today's Habits
          </h2>

          {/* Streak display */}
          {overallStreak.current > 0 && (
            <div
              className={`flex items-center gap-1 text-xs font-mono ${streakDisplay.className}`}
              title={`${overallStreak.current} day streak`}
            >
              <Flame className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{streakDisplay.text}</span>
            </div>
          )}

          {/* Penalty display */}
          {overallStreak.penalty < 0 && (
            <div
              className="flex items-center gap-1 text-xs font-mono text-danger"
              title={`${Math.abs(overallStreak.penalty)} missed days penalty`}
            >
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{streakDisplay.text}</span>
            </div>
          )}

          {/* Completion count */}
          {todayCompletions.total > 0 && (
            <span
              className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
                allComplete
                  ? 'bg-success/20 text-success'
                  : 'bg-raised text-faint'
              }`}
            >
              {todayCompletions.completed}/{todayCompletions.total}
            </span>
          )}
        </div>

        <button
          onClick={onAddHabit}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer"
          aria-label="Add new habit"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Add</span>
        </button>
      </div>

      {/* Habit list */}
      {enabledHabits.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-muted mb-3">
            No habits yet. Start building good habits today!
          </p>
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={onAddHabit}
              className="px-3 py-1.5 rounded-md bg-accent text-white text-xs font-semibold transition-opacity hover:opacity-85 cursor-pointer"
            >
              Create your first habit
            </button>
            {onApplyTemplate && (
              <span className="text-[11px] text-faint">
                or choose a template below
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {enabledHabits.map((habit) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              completions={completions}
              isCompleted={!!completions[habit.id]?.[today]}
              onToggle={handleToggle}
              onShowStats={onShowStats}
            />
          ))}
        </div>
      )}

      {/* All complete celebration */}
      {allComplete && (
        <div className="flex items-center justify-center gap-2 py-2 rounded-lg bg-success/10 border border-success/20">
          <Trophy className="w-4 h-4 text-success" aria-hidden="true" />
          <span className="text-xs font-medium text-success">
            Perfect day! All habits completed 🎉
          </span>
        </div>
      )}
    </section>
  );
};
