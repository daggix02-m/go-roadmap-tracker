import React, { useMemo } from 'react';
import { X, Flame, Calendar, TrendingUp } from 'lucide-react';
import { Habit, HabitCompletions, HABIT_COLORS } from '../types';
import { calculateStreak, getHabitCompletions } from '../utils/habits';

interface HabitStatsModalProps {
  isOpen: boolean;
  habit: Habit | null;
  completions: HabitCompletions;
  onClose: () => void;
}

/**
 * Per-habit statistics modal — shows streak, completion rate,
 * recent activity heatmap, and best streak.
 */
export const HabitStatsModal: React.FC<HabitStatsModalProps> = ({
  isOpen,
  habit,
  completions,
  onClose,
}) => {
  const habitCompletions = useMemo(
    () => (habit ? getHabitCompletions(completions, habit.id) : {}),
    [completions, habit]
  );

  const streak = useMemo(
    () => calculateStreak(habitCompletions),
    [habitCompletions]
  );

  // Calculate completion rate for last 30 days
  const stats = useMemo(() => {
    const today = new Date();
    let completed = 0;
    let total = 0;

    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      if (habitCompletions[key]) {
        completed++;
      }
      total++;
    }

    return {
      completed30d: completed,
      total30d: total,
      rate30d: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [habitCompletions]);

  // Last 7 days heatmap
  const last7Days = useMemo(() => {
    const today = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      days.push({
        date: key,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        completed: !!habitCompletions[key],
      });
    }
    return days;
  }, [habitCompletions]);

  if (!isOpen || !habit) return null;

  const colorConfig = HABIT_COLORS.find((c) => c.id === habit.color) ?? HABIT_COLORS[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-xl border border-line bg-surface shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={`Stats for ${habit.title}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <div className="flex items-center gap-2">
            <span className="text-lg">{habit.emoji}</span>
            <h2 className="text-sm font-semibold text-text">{habit.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-hover transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-faint" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Streak */}
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${colorConfig.cssClass} flex items-center justify-center`}>
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-lg font-bold text-text">{streak.current}</div>
              <div className="text-[11px] text-faint">Current streak</div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-sm font-mono text-text">{streak.best}</div>
              <div className="text-[11px] text-faint">Best streak</div>
            </div>
          </div>

          {/* 30-day stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 rounded-lg bg-raised text-center">
              <div className="text-sm font-bold text-text">{stats.completed30d}</div>
              <div className="text-[10px] text-faint">Completed</div>
            </div>
            <div className="p-2 rounded-lg bg-raised text-center">
              <div className="text-sm font-bold text-text">{stats.rate30d}%</div>
              <div className="text-[10px] text-faint">Rate</div>
            </div>
            <div className="p-2 rounded-lg bg-raised text-center">
              <div className="text-sm font-bold text-text">{stats.total30d}</div>
              <div className="text-[10px] text-faint">Total days</div>
            </div>
          </div>

          {/* Last 7 days heatmap */}
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-faint mb-2">
              Last 7 days
            </div>
            <div className="flex items-center gap-1">
              {last7Days.map((day) => (
                <div key={day.date} className="flex-1 text-center">
                  <div
                    className={`w-full aspect-square rounded-md mb-1 ${
                      day.completed ? colorConfig.cssClass : 'bg-raised'
                    }`}
                    title={`${day.date}: ${day.completed ? 'Completed' : 'Missed'}`}
                  />
                  <div className="text-[9px] text-faint">{day.dayName}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Habit info */}
          {habit.targetMinutes && (
            <div className="text-[11px] text-faint text-center">
              Daily target: {habit.targetMinutes} minutes
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
