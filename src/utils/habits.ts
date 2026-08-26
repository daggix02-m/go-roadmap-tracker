/**
 * Habit tracking utilities.
 *
 * Implements Grit-style daily habit tracking with completions, streaks,
 * achievements, and calendar views. All functions are pure — they take
 * state and return new state without side effects.
 */
import {
  Habit,
  HabitColor,
  HabitCompletions,
  HabitStreak,
  HabitDayStatus,
  CalendarDay,
  StreakDisplay,
  DailyPlanTemplate,
  Achievement,
  ACHIEVEMENTS,
  HABIT_COLORS,
} from '../types';

// ---------------------------------------------------------------------------
// Habit CRUD
// ---------------------------------------------------------------------------

/** Generate a simple unique id (timestamp + random suffix). */
function generateHabitId(): string {
  return `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Create a new habit with sensible defaults. */
export function createHabit(
  title: string,
  emoji: string,
  color: HabitColor = 'blue',
  targetMinutes?: number
): Habit {
  return {
    id: generateHabitId(),
    title,
    emoji,
    color,
    enabled: true,
    targetMinutes,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** Update fields on a habit (returns new array). */
export function updateHabit(
  habits: Habit[],
  habitId: string,
  updates: Partial<Pick<Habit, 'title' | 'emoji' | 'color' | 'enabled' | 'targetMinutes'>>
): Habit[] {
  return habits.map((h) =>
    h.id === habitId ? { ...h, ...updates, updatedAt: Date.now() } : h
  );
}

/** Delete a habit by id (returns new array). */
export function deleteHabit(habits: Habit[], habitId: string): Habit[] {
  return habits.filter((h) => h.id !== habitId);
}

// ---------------------------------------------------------------------------
// Completions
// ---------------------------------------------------------------------------

/** Toggle a habit's completion for a given day. Returns new completions map. */
export function toggleHabitCompletion(
  completions: Record<string, boolean>,
  habitId: string,
  day: string
): Record<string, boolean> {
  const next = { ...completions };
  if (next[habitId]) {
    delete next[habitId];
  } else {
    next[habitId] = true;
  }
  return next;
}

/** Get all completions for a specific habit (date -> completed). */
export function getHabitCompletions(
  allCompletions: HabitCompletions,
  habitId: string
): Record<string, boolean> {
  return allCompletions[habitId] ?? {};
}

// ---------------------------------------------------------------------------
// Streak calculation
// ---------------------------------------------------------------------------

/** Calculate current and best streak from a habit's daily completions. */
export function calculateStreak(
  completions: Record<string, boolean>
): HabitStreak {
  const result = calculateStreakWithPenalty(completions);
  return { current: result.current, best: result.best, penalty: result.penalty };
}

/**
 * Calculate streak with penalty for missed days.
 * Each missed day applies a -1 penalty to the streak.
 */
export function calculateStreakWithPenalty(
  completions: Record<string, boolean>
): HabitStreak {
  const today = new Date();
  const todayKey = today.toISOString().split('T')[0];

  // Get all dates with completions
  const completedDates = Object.keys(completions)
    .filter((d) => completions[d])
    .sort()
    .reverse(); // most recent first

  if (completedDates.length === 0) {
    return { current: 0, best: 0, penalty: 0 };
  }

  // Calculate best streak (longest consecutive run ever)
  const allDates = Object.keys(completions)
    .filter((d) => completions[d])
    .sort();

  let best = 0;
  let streak = 0;
  let prevDate: Date | null = null;

  for (const dateStr of allDates) {
    const currentDate = new Date(dateStr);

    if (prevDate) {
      const diffTime = currentDate.getTime() - prevDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        streak++;
      } else {
        streak = 1;
      }
    } else {
      streak = 1;
    }

    best = Math.max(best, streak);
    prevDate = currentDate;
  }

  // Calculate current streak and penalty
  let current = 0;
  let penalty = 0;

  // Find the earliest completed date
  const earliestCompleted = new Date(allDates[0]);

  // Walk backwards from today
  let checkDate = new Date(today);
  let streakPhase = true; // true = counting streak, false = counting penalty

  while (true) {
    // Stop if we've gone past all completed dates
    if (checkDate < earliestCompleted) break;

    const dateKey = checkDate.toISOString().split('T')[0];
    const dayCompleted = completedDates.includes(dateKey);

    if (streakPhase) {
      if (dayCompleted) {
        current++;
      } else {
        // First gap — switch to penalty counting
        streakPhase = false;
        penalty = -1;
      }
    } else {
      // Penalty phase — count all missed days
      if (dayCompleted) {
        // Found a completed day in the penalty zone — stop counting
        break;
      }
      penalty--;
    }

    checkDate.setDate(checkDate.getDate() - 1);

    // Stop conditions
    if (current + Math.abs(penalty) > 365) break;
    if (Math.abs(penalty) > 30) break;
  }

  return {
    current: Math.max(0, current),
    best: Math.max(best, current),
    penalty,
  };
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

/**
 * Get all days for a month view (6 weeks = 42 days).
 * Starts on Sunday of the week containing the 1st.
 */
export function getCalendarDays(year: number, month: number): CalendarDay[] {
  const today = new Date();
  const todayKey = today.toISOString().split('T')[0];

  // First day of the month
  const firstDay = new Date(year, month, 1);
  // Last day of the month
  const lastDay = new Date(year, month + 1, 0);

  // Start from Sunday before or on the 1st
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const days: CalendarDay[] = [];
  const currentDate = new Date(startDate);

  // Generate 42 days (6 weeks)
  for (let i = 0; i < 42; i++) {
    const dateKey = currentDate.toISOString().split('T')[0];
    const isCurrentMonth = currentDate.getMonth() === month;
    const isToday = dateKey === todayKey;

    days.push({
      date: dateKey,
      isCurrentMonth,
      isToday,
      status: 'none', // Will be set by getDayStatus
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return days;
}

/**
 * Get the status of a specific day for display.
 */
export function getDayStatus(
  completions: HabitCompletions,
  date: string
): HabitDayStatus {
  const today = new Date().toISOString().split('T')[0];

  if (date === today) return 'today';

  // Check if any habit is completed on this day
  const hasCompletion = Object.values(completions).some(
    (habitCompletions) => habitCompletions[date]
  );

  if (hasCompletion) return 'completed';

  // Check if it's a past day
  const dateObj = new Date(date);
  const todayObj = new Date(today);

  if (dateObj < todayObj) return 'missed';

  return 'future';
}

/**
 * Get streak display info for the UI.
 */
export function getStreakDisplay(
  current: number,
  penalty: number
): StreakDisplay {
  if (penalty < 0) {
    return {
      emoji: '⚠️',
      text: `${penalty}`,
      className: 'text-danger',
    };
  }

  if (current > 0) {
    return {
      emoji: '🔥',
      text: `${current}`,
      className: 'text-warning',
    };
  }

  return {
    emoji: '—',
    text: '0',
    className: 'text-faint',
  };
}

// ---------------------------------------------------------------------------
// Daily plan templates
// ---------------------------------------------------------------------------

/** Pre-defined daily plan templates for quick habit setup. */
export const DAILY_PLAN_TEMPLATES: DailyPlanTemplate[] = [
  {
    id: 'morning-routine',
    name: 'Morning Routine',
    emoji: '🌅',
    description: 'Start your day with energy and focus',
    habits: [
      { title: 'Wake up early', emoji: '⏰', color: 'orange' },
      { title: 'Meditate', emoji: '🧘', color: 'purple' },
      { title: 'Exercise', emoji: '💪', color: 'green' },
      { title: 'Healthy breakfast', emoji: '🥗', color: 'teal' },
      { title: 'Plan the day', emoji: '📝', color: 'blue' },
    ],
  },
  {
    id: 'work-productivity',
    name: 'Work Productivity',
    emoji: '💼',
    description: 'Stay focused and productive at work',
    habits: [
      { title: 'Deep work session', emoji: '🎯', color: 'blue' },
      { title: 'Take breaks', emoji: '☕', color: 'orange' },
      { title: 'Review tasks', emoji: '✅', color: 'green' },
      { title: 'No social media', emoji: '📵', color: 'red' },
      { title: 'End of day review', emoji: '📊', color: 'purple' },
    ],
  },
  {
    id: 'health-wellness',
    name: 'Health & Wellness',
    emoji: '💚',
    description: 'Take care of your body and mind',
    habits: [
      { title: 'Drink 8 glasses water', emoji: '💧', color: 'blue' },
      { title: 'Exercise 30 min', emoji: '🏃', color: 'green' },
      { title: 'Eat vegetables', emoji: '🥦', color: 'green' },
      { title: 'Sleep 8 hours', emoji: '😴', color: 'purple' },
      { title: 'No junk food', emoji: '🚫', color: 'red' },
    ],
  },
  {
    id: 'learning-growth',
    name: 'Learning & Growth',
    emoji: '📚',
    description: 'Invest in your personal development',
    habits: [
      { title: 'Read 30 minutes', emoji: '📖', color: 'blue' },
      { title: 'Practice skill', emoji: '🎯', color: 'purple' },
      { title: 'Journal', emoji: '✍️', color: 'teal' },
      { title: 'Learn something new', emoji: '🧠', color: 'orange' },
      { title: 'Reflect on progress', emoji: '🪞', color: 'pink' },
    ],
  },
];

/**
 * Get habits from a template (ready to create).
 */
export function getTemplateHabits(
  templateId: string
): { title: string; emoji: string; color: HabitColor }[] {
  const template = DAILY_PLAN_TEMPLATES.find((t) => t.id === templateId);
  return template?.habits ?? [];
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

/** Get all achievements with unlock status based on current habit state. */
export function getAchievements(
  habits: Habit[] = [],
  totalCompletions: number = 0,
  bestStreak: number = 0
): Achievement[] {
  const enabledHabits = habits.filter((h) => h.enabled && !h.deleted);

  return ACHIEVEMENTS.map((a) => {
    let unlocked = false;

    switch (a.id) {
      case 'first-habit':
        unlocked = enabledHabits.length >= 1;
        break;
      case 'five-habits':
        unlocked = enabledHabits.length >= 5;
        break;
      case 'streak-7':
        unlocked = bestStreak >= 7;
        break;
      case 'streak-30':
        unlocked = bestStreak >= 30;
        break;
      case 'hundred-completions':
        unlocked = totalCompletions >= 100;
        break;
      case 'all-complete':
        // This is checked per-day in the UI, not a static unlock
        unlocked = false;
        break;
    }

    return { ...a, unlocked };
  });
}
