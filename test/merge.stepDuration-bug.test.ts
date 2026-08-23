/**
 * PROVE-IT BUG TEST — stepDuration override silently lost during merge.
 *
 * BUG: `recordLWW` in src/utils/merge.ts resolves per-key conflicts by raw
 * value comparison (`v > out[k]` → remote wins). For `stepDurations` the
 * value is seconds, so a LARGER number always wins even when it is merely
 * the stale default on the other device.
 *
 * Repro scenario:
 *   1. Base: step 1_0 duration = 3600s (default) on both devices.
 *   2. Device A shortens it to 1200s (user intent).
 *   3. Device B still has 3600s — it never changed anything.
 *   4. Merge: remote 3600 > local 1200 → merged value is 3600.
 *   5. Conflict detection: bothChangedKey requires BOTH sides to have
 *      changed since base → NOT a conflict → no modal → silent data loss.
 *
 * Expected (correct LWW): local changed since base, remote didn't → local
 * wins (1200s). The user's deliberate setting must survive.
 *
 * This test currently FAILS — it documents the bug for the fix.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { threeWayMerge } from '../src/utils/merge';
import { AppData, AppSettings, PlanProgress } from '../src/types';

const settings: AppSettings = {
  dailyReminderEnabled: false,
  dailyReminderTime: '09:00',
  timeFormat: '12h',
  timezone: undefined,
  dailyFocusGoal: undefined
};

const emptyProgress: PlanProgress = {
  completedPhases: [],
  criteriaChecked: {},
  stepChecked: {},
  userNotes: {},
  lastStudiedPhaseId: null,
  stepDurations: {},
  stepDoneDay: {}
};

function app(duration: Record<string, number>): AppData {
  return {
    version: 2,
    activePlanId: 'go-roadmap',
    customPlans: [],
    settings,
    global: { streak: 0, lastActiveDate: null, historyDates: [], totalStudyMinutes: 0, historyMinutes: {} },
    progressByPlan: { 'go-roadmap': { ...emptyProgress, stepDurations: duration } },
    lastModifiedAt: 1000
  };
}

describe('BUG: step duration override survives merge when other device unchanged', () => {
  test('shortened duration on one device is NOT clobbered by the stale default on the other', () => {
    // Base: step 1_0 is 3600s (default 1h).
    const base = app({ '1_0': 3600 });

    // Device A deliberately shortens it to 1200s (20 min).
    const local = app({ '1_0': 1200 });

    // Device B never touched it — still the 3600s default.
    const remote = app({ '1_0': 3600 });

    const { merged, conflicts } = threeWayMerge(base, local, remote);

    // This is the bug: the user's explicit change is silently discarded.
    assert.equal(
      merged.progressByPlan['go-roadmap'].stepDurations?.['1_0'],
      1200,
      'local change since base must win (remote did not change)'
    );

    // And because bothChangedKey requires two-sided change, there is no
    // conflict to alert the user — so the loss is completely silent.
    assert.equal(
      conflicts.length,
      0,
      'single-sided change must not surface a conflict, but must not lose data either'
    );
  });
});