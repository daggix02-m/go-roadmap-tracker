/**
 * Habit tracking tests.
 *
 * Tests the Grit-style habit tracking system:
 *  - Habit data model and CRUD operations
 *  - Daily completion tracking
 *  - Streak calculation
 *  - Achievement definitions
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  Habit,
  HabitColor,
  HABIT_COLORS,
  HabitCompletions,
  HabitStreak,
  Achievement,
  ACHIEVEMENTS,
} from '../src/types';
import {
  createHabit,
  toggleHabitCompletion,
  getHabitCompletions,
  calculateStreak,
  getAchievements,
  deleteHabit,
  updateHabit,
} from '../src/utils/habits';

// ---------------------------------------------------------------------------
// Habit colors
// ---------------------------------------------------------------------------

describe('HABIT_COLORS', () => {
  test('contains at least 6 color options', () => {
    assert.ok(HABIT_COLORS.length >= 6, 'Should have at least 6 habit colors');
  });

  test('each color has id, label, and cssClass', () => {
    for (const color of HABIT_COLORS) {
      assert.ok(color.id, `Color ${JSON.stringify(color)} missing id`);
      assert.ok(color.label, `Color ${JSON.stringify(color)} missing label`);
      assert.ok(color.cssClass, `Color ${JSON.stringify(color)} missing cssClass`);
    }
  });
});

// ---------------------------------------------------------------------------
// createHabit
// ---------------------------------------------------------------------------

describe('createHabit', () => {
  test('creates a habit with required fields', () => {
    const habit = createHabit('Exercise', 'fitness');
    assert.equal(habit.title, 'Exercise');
    assert.equal(habit.emoji, 'fitness');
    assert.equal(habit.color, 'blue'); // default color
    assert.equal(habit.enabled, true);
    assert.ok(habit.id, 'Should have an id');
    assert.ok(habit.createdAt, 'Should have createdAt');
  });

  test('creates a habit with custom color', () => {
    const habit = createHabit('Read', 'book', 'green');
    assert.equal(habit.color, 'green');
  });

  test('creates a habit with optional target', () => {
    const habit = createHabit('Meditate', 'brain', 'purple', 10);
    assert.equal(habit.targetMinutes, 10);
  });

  test('generates unique ids', () => {
    const h1 = createHabit('A', 'a');
    const h2 = createHabit('B', 'b');
    assert.notEqual(h1.id, h2.id, 'Habit ids should be unique');
  });
});

// ---------------------------------------------------------------------------
// toggleHabitCompletion
// ---------------------------------------------------------------------------

describe('toggleHabitCompletion', () => {
  test('marks a habit as completed for today', () => {
    const today = new Date().toISOString().split('T')[0];
    const completions = toggleHabitCompletion({}, 'habit-1', today);
    assert.equal(completions['habit-1'], true);
  });

  test('unmarks a habit that was completed', () => {
    const today = new Date().toISOString().split('T')[0];
    const initial = { 'habit-1': true };
    const completions = toggleHabitCompletion(initial, 'habit-1', today);
    assert.equal(completions['habit-1'], undefined);
  });

  test('does not affect other habits', () => {
    const today = new Date().toISOString().split('T')[0];
    const initial = { 'habit-1': true };
    const completions = toggleHabitCompletion(initial, 'habit-2', today);
    assert.equal(completions['habit-1'], true);
    assert.equal(completions['habit-2'], true);
  });
});

// ---------------------------------------------------------------------------
// calculateStreak
// ---------------------------------------------------------------------------

describe('calculateStreak', () => {
  test('returns 0 for empty completions', () => {
    const streak = calculateStreak({});
    assert.equal(streak.current, 0);
    assert.equal(streak.best, 0);
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

    const streak = calculateStreak(completions);
    assert.equal(streak.current, 5);
    assert.equal(streak.best, 5);
  });

  test('breaks streak on gap day', () => {
    const today = new Date();
    const completions: Record<string, boolean> = {};

    // Mark today and 2 days ago, but not yesterday
    const todayKey = today.toISOString().split('T')[0];
    completions[todayKey] = true;

    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    completions[twoDaysAgo.toISOString().split('T')[0]] = true;

    const streak = calculateStreak(completions);
    assert.equal(streak.current, 1, 'Streak should be 1 (only today)');
  });
});

// ---------------------------------------------------------------------------
// getAchievements
// ---------------------------------------------------------------------------

describe('getAchievements', () => {
  test('returns all defined achievements', () => {
    const achievements = getAchievements();
    assert.ok(achievements.length > 0, 'Should have achievements');
  });

  test('each achievement has required fields', () => {
    const achievements = getAchievements();
    for (const a of achievements) {
      assert.ok(a.id, 'Achievement missing id');
      assert.ok(a.title, 'Achievement missing title');
      assert.ok(a.description, 'Achievement missing description');
      assert.ok(a.icon, 'Achievement missing icon');
    }
  });

  test('first-habit achievement is unlocked when user has habits', () => {
    const habits: Habit[] = [
      createHabit('Test', 'test'),
    ];
    const achievements = getAchievements(habits, 0);
    const firstHabit = achievements.find((a) => a.id === 'first-habit');
    assert.ok(firstHabit, 'Should have first-habit achievement');
    assert.equal(firstHabit.unlocked, true, 'first-habit should be unlocked');
  });

  test('first-habit achievement is locked when user has no habits', () => {
    const achievements = getAchievements([], 0);
    const firstHabit = achievements.find((a) => a.id === 'first-habit');
    assert.equal(firstHabit?.unlocked, false, 'first-habit should be locked');
  });
});

// ---------------------------------------------------------------------------
// deleteHabit
// ---------------------------------------------------------------------------

describe('deleteHabit', () => {
  test('removes a habit from the list', () => {
    const habits: Habit[] = [
      createHabit('A', 'a'),
      createHabit('B', 'b'),
    ];
    const deleted = deleteHabit(habits, habits[0].id);
    assert.equal(deleted.length, 1);
    assert.equal(deleted[0].title, 'B');
  });

  test('returns original list if id not found', () => {
    const habits: Habit[] = [createHabit('A', 'a')];
    const deleted = deleteHabit(habits, 'nonexistent');
    assert.equal(deleted.length, 1);
  });
});

// ---------------------------------------------------------------------------
// updateHabit
// ---------------------------------------------------------------------------

describe('updateHabit', () => {
  test('updates habit fields', () => {
    const habits: Habit[] = [createHabit('Old', 'old')];
    const updated = updateHabit(habits, habits[0].id, { title: 'New', color: 'red' });
    assert.equal(updated[0].title, 'New');
    assert.equal(updated[0].color, 'red');
  });

  test('does not affect other habits', () => {
    const habits: Habit[] = [
      createHabit('A', 'a'),
      createHabit('B', 'b'),
    ];
    const updated = updateHabit(habits, habits[0].id, { title: 'Updated' });
    assert.equal(updated[1].title, 'B', 'Other habits should not change');
  });
});
