/**
 * Habit tracking enhanced tests.
 *
 * Tests the calendar view, streak penalties for missed days,
 * and daily plan templates.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  Habit,
  HabitCompletions,
  HabitDayStatus,
} from '../src/types';
import {
  calculateStreakWithPenalty,
  getCalendarDays,
  getDayStatus,
  getStreakDisplay,
  DAILY_PLAN_TEMPLATES,
  getTemplateHabits,
} from '../src/utils/habits';

// ---------------------------------------------------------------------------
// Streak calculation with penalty
// ---------------------------------------------------------------------------

describe('calculateStreakWithPenalty', () => {
  test('returns 0 for empty completions', () => {
    const streak = calculateStreakWithPenalty({});
    assert.equal(streak.current, 0);
    assert.equal(streak.best, 0);
    assert.equal(streak.penalty, 0);
  });

  test('calculates streak from consecutive days', () => {
    const today = new Date();
    const completions: Record<string, boolean> = {};

    // Mark last 5 days as completed
    for (let i = 0; i < 5; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      completions[key] = true;
    }

    const streak = calculateStreakWithPenalty(completions);
    assert.equal(streak.current, 5);
    assert.equal(streak.best, 5);
    assert.equal(streak.penalty, 0);
  });

  test('applies -1 penalty for each missed day', () => {
    const today = new Date();
    const completions: Record<string, boolean> = {};

    // Mark today and 2 days ago as completed, but NOT yesterday
    const todayKey = today.toISOString().split('T')[0];
    completions[todayKey] = true;

    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    completions[twoDaysAgo.toISOString().split('T')[0]] = true;

    const streak = calculateStreakWithPenalty(completions);
    assert.equal(streak.current, 1, 'Current streak should be 1 (only today)');
    assert.equal(streak.penalty, -1, 'Should have -1 penalty for missed yesterday');
  });

  test('penalty accumulates for multiple missed days', () => {
    const today = new Date();
    const completions: Record<string, boolean> = {};

    // Mark today and 4 days ago, miss 3 days in between
    const todayKey = today.toISOString().split('T')[0];
    completions[todayKey] = true;

    const fourDaysAgo = new Date(today);
    fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
    completions[fourDaysAgo.toISOString().split('T')[0]] = true;

    const streak = calculateStreakWithPenalty(completions);
    assert.equal(streak.current, 1);
    assert.equal(streak.penalty, -3, 'Should have -3 penalty for 3 missed days');
  });
});

// ---------------------------------------------------------------------------
// Calendar days
// ---------------------------------------------------------------------------

describe('getCalendarDays', () => {
  test('returns 42 days (6 weeks) for a month view', () => {
    const days = getCalendarDays(2026, 0); // January 2026
    assert.equal(days.length, 42);
  });

  test('first day starts on Sunday of the week containing the 1st', () => {
    const days = getCalendarDays(2026, 0); // January 2026
    // Jan 1, 2026 is a Thursday, so the calendar starts on Dec 27 (Sunday)
    assert.equal(days[0].date, '2025-12-27');
  });

  test('each day has required fields', () => {
    const days = getCalendarDays(2026, 0);
    for (const day of days) {
      assert.ok(day.date, 'Day should have date');
      assert.equal(typeof day.isCurrentMonth, 'boolean');
      assert.equal(typeof day.isToday, 'boolean');
    }
  });

  test('marks current month days correctly', () => {
    const days = getCalendarDays(2026, 0); // January 2026
    const janDays = days.filter((d) => d.isCurrentMonth);
    assert.ok(janDays.length >= 28, 'January should have at least 28 days');
    assert.ok(janDays.length <= 31, 'January should have at most 31 days');
  });
});

// ---------------------------------------------------------------------------
// Day status
// ---------------------------------------------------------------------------

describe('getDayStatus', () => {
  test('returns "completed" for completed days', () => {
    const completions: HabitCompletions = {
      'habit-1': { '2026-01-15': true },
    };
    const status = getDayStatus(completions, '2026-01-15');
    assert.equal(status, 'completed');
  });

  test('returns "missed" for past days without completion', () => {
    const completions: HabitCompletions = {};
    const status = getDayStatus(completions, '2025-01-15');
    assert.equal(status, 'missed');
  });

  test('returns "future" for future days', () => {
    const completions: HabitCompletions = {};
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    const futureKey = futureDate.toISOString().split('T')[0];
    const status = getDayStatus(completions, futureKey);
    assert.equal(status, 'future');
  });

  test('returns "today" for today', () => {
    const completions: HabitCompletions = {};
    const today = new Date().toISOString().split('T')[0];
    const status = getDayStatus(completions, today);
    assert.equal(status, 'today');
  });
});

// ---------------------------------------------------------------------------
// Streak display
// ---------------------------------------------------------------------------

describe('getStreakDisplay', () => {
  test('shows fire emoji for active streaks', () => {
    const display = getStreakDisplay(5, 0);
    assert.equal(display.emoji, '🔥');
    assert.equal(display.text, '5');
    assert.equal(display.className, 'text-warning');
  });

  test('shows warning for negative streak', () => {
    const display = getStreakDisplay(0, -3);
    assert.equal(display.emoji, '⚠️');
    assert.equal(display.text, '-3');
    assert.equal(display.className, 'text-danger');
  });

  test('shows neutral for zero streak', () => {
    const display = getStreakDisplay(0, 0);
    assert.equal(display.emoji, '—');
    assert.equal(display.text, '0');
    assert.equal(display.className, 'text-faint');
  });
});

// ---------------------------------------------------------------------------
// Daily plan templates
// ---------------------------------------------------------------------------

describe('DAILY_PLAN_TEMPLATES', () => {
  test('contains at least 3 templates', () => {
    assert.ok(DAILY_PLAN_TEMPLATES.length >= 3);
  });

  test('each template has required fields', () => {
    for (const template of DAILY_PLAN_TEMPLATES) {
      assert.ok(template.id, 'Template should have id');
      assert.ok(template.name, 'Template should have name');
      assert.ok(template.emoji, 'Template should have emoji');
      assert.ok(template.habits.length > 0, 'Template should have habits');
    }
  });
});

describe('getTemplateHabits', () => {
  test('returns habits from a template', () => {
    const template = DAILY_PLAN_TEMPLATES[0];
    const habits = getTemplateHabits(template.id);
    assert.ok(habits.length > 0);
    assert.equal(habits.length, template.habits.length);
  });

  test('returns empty array for unknown template', () => {
    const habits = getTemplateHabits('nonexistent');
    assert.equal(habits.length, 0);
  });
});
