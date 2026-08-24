/**
 * Unit tests for src/utils/storage.ts — the streak engine and persisted state.
 *
 * These tests verify the "keep my streak" guarantee at the source:
 *  - opening the app counts as activity (streak preserved / not lost)
 *  - same-day activity does not double-count or reset
 *  - a one-day gap advances the streak; a longer gap resets to 1
 *  - logStudyActivity accumulates minutes and history without losing data
 *  - normalizeAppData defensively handles malformed persisted data
 *  - v1 legacy state migrates into the v2 model
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGlobalStreak,
  getLocalDateString,
  logStudyActivity,
  normalizeAppData,
  loadAppData,
  saveAppData
} from '../src/utils/storage';
import { AppData, GlobalActivity } from '../src/types';

// ---------------------------------------------------------------------------
// localStorage mock (the storage module reads/writes global localStorage)
// ---------------------------------------------------------------------------

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string): string | null => store.get(k) ?? null,
    setItem: (k: string, v: string): void => void store.set(k, v),
    removeItem: (k: string): void => void store.delete(k)
  };
});

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return getLocalDateString(d);
}

function global(overrides: Partial<GlobalActivity>): GlobalActivity {
  return {
    streak: 0,
    lastActiveDate: null,
    historyDates: [],
    totalStudyMinutes: 0,
    historyMinutes: {},
    ...overrides
  };
}

function app(overrides: Partial<AppData> = {}): AppData {
  return {
    version: 2,
    activePlanId: 'go-roadmap',
    customPlans: [],
    settings: {
      dailyReminderEnabled: false,
      dailyReminderTime: '09:00',
      timeFormat: '12h'
    },
    global: global({}),
    progressByPlan: {},
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// calculateGlobalStreak
// ---------------------------------------------------------------------------

describe('calculateGlobalStreak', () => {
  test('first run: streak becomes 1, active date is today, today enters history', () => {
    const out = calculateGlobalStreak(global({}));
    assert.equal(out.streak, 1);
    assert.equal(out.lastActiveDate, getLocalDateString());
    assert.deepEqual(out.historyDates, [getLocalDateString()]);
  });

  test('same-day activity: streak stays the same and today is not duplicated', () => {
    const today = getLocalDateString();
    const out = calculateGlobalStreak(
      global({ streak: 4, lastActiveDate: today, historyDates: [today] })
    );
    assert.equal(out.streak, 4, 'no double-increment on same day');
    assert.deepEqual(out.historyDates, [today], 'no duplicate date');
  });

  test('consecutive day: streak advances by one', () => {
    const out = calculateGlobalStreak(
      global({ streak: 4, lastActiveDate: daysAgo(1), historyDates: [daysAgo(1)] })
    );
    assert.equal(out.streak, 5);
    assert.equal(out.lastActiveDate, getLocalDateString());
  });

  test('a gap of more than one day resets the streak to 1 (documented behavior)', () => {
    const out = calculateGlobalStreak(
      global({ streak: 7, lastActiveDate: daysAgo(3), historyDates: [daysAgo(3)] })
    );
    assert.equal(out.streak, 1, 'streak resets after a multi-day gap');
    assert.equal(out.lastActiveDate, getLocalDateString());
  });

  test('a gap of exactly one day (yesterday -> today) is a continuation', () => {
    const out = calculateGlobalStreak(
      global({ streak: 2, lastActiveDate: daysAgo(1), historyDates: [daysAgo(1)] })
    );
    assert.equal(out.streak, 3);
  });
});

// ---------------------------------------------------------------------------
// logStudyActivity
// ---------------------------------------------------------------------------

describe('logStudyActivity', () => {
  test('adds minutes to total and today, keeps existing history intact', () => {
    const today = getLocalDateString();
    const data = app({
      global: global({ streak: 1, lastActiveDate: today, historyDates: [today], totalStudyMinutes: 15, historyMinutes: { [today]: 15 } }),
      progressByPlan: {
        'go-roadmap': {
          completedPhases: [],
          criteriaChecked: {},
          stepChecked: {},
          userNotes: {},
          lastStudiedPhaseId: 2
        }
      }
    });
    const out = logStudyActivity(data, 'go-roadmap', 4, 30);
    assert.equal(out.global.totalStudyMinutes, 45);
    assert.equal(out.global.historyMinutes[today], 45);
    assert.equal(out.progressByPlan['go-roadmap'].lastStudiedPhaseId, 4);
    assert.ok(out.global.streak >= 1, 'streak never regresses');
  });

  test('persists to localStorage via saveAppData', () => {
    const data = app();
    const out = logStudyActivity(data, 'go-roadmap', 1, 15);
    const raw = store.get('plan_tracker_v2');
    assert.ok(raw, 'state written to storage');
    const parsed = JSON.parse(raw!);
    assert.equal(parsed.global.totalStudyMinutes, 15);
    assert.equal(typeof parsed.lastModifiedAt, 'number', 'LWW timestamp written');
  });

  test('multiple plan studies accumulate without losing prior plan progress', () => {
    const data = app({
      progressByPlan: {
        'plan-a': { completedPhases: [1], criteriaChecked: {}, stepChecked: {}, userNotes: {}, lastStudiedPhaseId: 1 }
      }
    });
    const out = logStudyActivity(data, 'plan-b', 2, 25);
    assert.equal(out.progressByPlan['plan-a'].completedPhases.length, 1, 'plan-a intact');
    assert.equal(out.progressByPlan['plan-b'].lastStudiedPhaseId, 2);
  });
});

// ---------------------------------------------------------------------------
// normalizeAppData — defensive parse of possibly-malformed stored JSON
// ---------------------------------------------------------------------------

describe('normalizeAppData', () => {
  test('returns a usable default for null/undefined/corrupt input', () => {
    const a = normalizeAppData(null);
    assert.equal(a.version, 2);
    assert.equal(a.activePlanId, 'go-roadmap');
    assert.equal(a.global.streak, 0);
    assert.deepEqual(
      a.customPlans.map((p) => p.id),
      ['demo-showcase'],
      'fresh state ships with only the demo showcase plan'
    );
    const b = normalizeAppData({ version: 2, settings: 'garbage' } as unknown as Partial<AppData>);
    assert.equal(b.settings.timeFormat, '12h');
  });

  test('sanitizes historyMinutes — non-positive and non-number values dropped', () => {
    const out = normalizeAppData({
      version: 2,
      global: { streak: 2, lastActiveDate: '2026-08-20', historyDates: ['2026-08-20'], totalStudyMinutes: 30, historyMinutes: { '2026-08-20': 30, '2026-08-21': -5, '2026-08-22': 'x' as unknown as number } }
    } as unknown as Partial<AppData>);
    assert.equal(out.global.historyMinutes['2026-08-20'], 30);
    assert.equal(out.global.historyMinutes['2026-08-21'], undefined);
    assert.equal(out.global.historyMinutes['2026-08-22'], undefined);
  });

  test('keeps only numeric, positive stepDurations', () => {
    const out = normalizeAppData({
      version: 2,
      progressByPlan: {
        'go-roadmap': { stepDurations: { '1_0': 3600, '1_1': -1, '1_2': 'bad' as unknown as number } }
      }
    } as unknown as Partial<AppData>);
    assert.deepEqual(out.progressByPlan['go-roadmap'].stepDurations, { '1_0': 3600 });
  });
});

// ---------------------------------------------------------------------------
// load/save round-trip
// ---------------------------------------------------------------------------

describe('loadAppData / saveAppData round-trip', () => {
  test('save then load preserves data (with streak touched on load)', () => {
    const data = app({
      global: global({ streak: 3, lastActiveDate: daysAgo(1), historyDates: [daysAgo(1)], totalStudyMinutes: 90 })
    });
    saveAppData(data);
    const loaded = loadAppData();
    assert.equal(loaded.global.totalStudyMinutes, 90);
    assert.equal(loaded.global.streak, 4, 'opening the app today continues the streak');
    assert.equal(loaded.version, 2);
  });

  test('v1 legacy state migrates into the v2 model (streak preserved)', () => {
    store.set(
      'go_backend_roadmap_tracker_v1',
      JSON.stringify({
        streak: 5,
        lastActiveDate: daysAgo(1),
        historyDates: [daysAgo(1)],
        totalStudyMinutes: 120,
        completedPhases: [1, 2],
        stepChecked: { '1_0': true },
        criteriaChecked: { '2_0': true },
        lastStudiedPhaseId: 3
      })
    );
    const migrated = loadAppData();
    assert.equal(migrated.global.streak, 6, 'legacy streak preserved and continued today');
    assert.deepEqual(migrated.progressByPlan['go-roadmap'].completedPhases, [1, 2]);
    assert.equal(migrated.progressByPlan['go-roadmap'].stepChecked['1_0'], true);
    assert.equal(migrated.global.totalStudyMinutes, 120);
  });
});