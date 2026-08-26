import React from 'react';

/** Intensity bucket shared by every activity widget. Index 0 = rest day. */
export function levelClass(minutes: number): string {
  if (minutes <= 0) return 'bg-line/40';
  if (minutes < 30) return 'bg-accent/25';
  if (minutes < 60) return 'bg-accent/45';
  if (minutes < 120) return 'bg-accent/70';
  return 'bg-accent';
}

/** Maps a plan accent to its live theme variable. */
export function accentVar(planAccent: string): string {
  switch (planAccent) {
    case 'success':
      return 'var(--t-success)';
    case 'warning':
      return 'var(--t-warning)';
    case 'danger':
      return 'var(--t-danger)';
    default:
      return 'var(--t-accent)';
  }
}

export interface WidgetData {
  /** Minutes studied per local day ('YYYY-MM-DD'). */
  historyMinutes: Record<string, number>;
  dailyFocusGoal?: number;
  streak: number;
  completedPhases: number;
  totalPhases: number;
  totalStudyMinutes: number;
  /** Active plan accent token name ('accent' | 'success' | …). */
  planAccent: string;
  /** Habit completions per habitId → date → completed. */
  habitCompletions?: Record<string, Record<string, boolean>>;
  /** Number of habits completed on a given day. */
  getHabitCountForDay?: (date: string) => { completed: number; total: number };
}

export const WidgetBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="-mx-1 overflow-x-auto pb-1">
    <div className="min-w-max px-1">{children}</div>
  </div>
);
