/**
 * Unit tests for the three-way merge engine (src/utils/merge.ts).
 *
 * These tests are the core guarantee for cross-device sync:
 *  - streaks survive a merge (best-of-both, never reset below the max)
 *  - custom plans ("device plans") are unioned by id, never lost
 *  - progress checkboxes are true-wins (once checked, stays checked)
 *  - tombstone deletions propagate correctly
 *  - genuine double-edits surface as conflicts; additive edits merge silently
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { threeWayMerge, Conflict } from '../src/utils/merge';
import { AppData, AppSettings, Plan, PlanProgress, GlobalActivity } from '../src/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseSettings: AppSettings = {
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

function app(overrides: Partial<AppData> = {}): AppData {
  return {
    version: 2,
    activePlanId: 'go-roadmap',
    activePlanUpdatedAt: 1000,
    customPlans: [],
    settings: { ...baseSettings },
    global: {
      streak: 0,
      lastActiveDate: null,
      historyDates: [],
      totalStudyMinutes: 0,
      historyMinutes: {}
    },
    progressByPlan: { 'go-roadmap': { ...emptyProgress } },
    lastModifiedAt: 1000,
    ...overrides
  };
}

function plan(id: string, name: string, overrides: Partial<Plan> = {}): Plan {
  return {
    id,
    name,
    emoji: '📋',
    accent: 'accent',
    builtIn: false,
    sections: [{ id: 's1', title: 'Phase 1' }],
    phases: [],
    ...overrides
  };
}

function withStep(data: AppData, planId: string, step: string, checked = true): AppData {
  const p = data.progressByPlan[planId] ?? { ...emptyProgress };
  return app({
    ...data,
    progressByPlan: {
      ...data.progressByPlan,
      [planId]: { ...p, stepChecked: { ...p.stepChecked, [step]: checked } }
    }
  });
}

function withNote(data: AppData, planId: string, phase: number, text: string): AppData {
  const p = data.progressByPlan[planId] ?? { ...emptyProgress };
  return app({
    ...data,
    progressByPlan: {
      ...data.progressByPlan,
      [planId]: { ...p, userNotes: { ...p.userNotes, [phase]: text } }
    }
  });
}

function fieldNames(conflicts: Conflict[]): string[] {
  return conflicts.map((c) => c.field);
}

// ---------------------------------------------------------------------------
// Streak & global activity — the "never lose my streak" guarantee
// ---------------------------------------------------------------------------

describe('merge: global activity / streak preservation', () => {
  test('streak is best-of-both (max wins) — a higher streak on either device survives', () => {
    const base = app();
    const local = app({
      global: { streak: 3, lastActiveDate: '2026-08-20', historyDates: ['2026-08-20'], totalStudyMinutes: 45, historyMinutes: { '2026-08-20': 45 } }
    });
    const remote = app({
      global: { streak: 5, lastActiveDate: '2026-08-21', historyDates: ['2026-08-21'], totalStudyMinutes: 90, historyMinutes: { '2026-08-21': 90 } }
    });
    const { merged } = threeWayMerge(base, local, remote);
    assert.equal(merged.global.streak, 5, 'max streak must win');
    assert.equal(merged.global.totalStudyMinutes, 90, 'max minutes must win');
    assert.deepEqual(merged.global.historyDates, ['2026-08-20', '2026-08-21'], 'all active days preserved');
  });

  test('historyMinutes are max-per-day union — no day is overwritten with a smaller value', () => {
    const base = app({
      global: { streak: 1, lastActiveDate: '2026-08-20', historyDates: ['2026-08-20'], totalStudyMinutes: 15, historyMinutes: { '2026-08-20': 15 } }
    });
    const local = app({
      global: { streak: 2, lastActiveDate: '2026-08-21', historyDates: ['2026-08-20', '2026-08-21'], totalStudyMinutes: 45, historyMinutes: { '2026-08-20': 15, '2026-08-21': 30 } }
    });
    const remote = app({
      global: { streak: 2, lastActiveDate: '2026-08-21', historyDates: ['2026-08-20', '2026-08-21'], totalStudyMinutes: 60, historyMinutes: { '2026-08-20': 25, '2026-08-21': 45 } }
    });
    const { merged } = threeWayMerge(base, local, remote);
    assert.equal(merged.global.historyMinutes['2026-08-20'], 25, 'max per-day minutes');
    assert.equal(merged.global.historyMinutes['2026-08-21'], 45, 'max per-day minutes');
  });

  test('most recent active date wins across devices', () => {
    const local = app({ global: { streak: 2, lastActiveDate: '2026-08-22', historyDates: ['2026-08-21', '2026-08-22'], totalStudyMinutes: 30, historyMinutes: { '2026-08-22': 30 } } });
    const remote = app({ global: { streak: 3, lastActiveDate: '2026-08-23', historyDates: ['2026-08-21', '2026-08-23'], totalStudyMinutes: 60, historyMinutes: { '2026-08-23': 60 } } });
    const { merged } = threeWayMerge(null, local, remote);
    assert.equal(merged.global.lastActiveDate, '2026-08-23');
  });

  test('no streak or activity data is ever dropped when merging two studied devices', () => {
    // Device A studied days X+Y, device B studied days Y+Z.
    const local = app({ global: { streak: 3, lastActiveDate: '2026-08-22', historyDates: ['2026-08-21', '2026-08-22'], totalStudyMinutes: 30, historyMinutes: { '2026-08-21': 15, '2026-08-22': 15 } } });
    const remote = app({ global: { streak: 2, lastActiveDate: '2026-08-23', historyDates: ['2026-08-22', '2026-08-23'], totalStudyMinutes: 45, historyMinutes: { '2026-08-22': 15, '2026-08-23': 30 } } });
    const { merged } = threeWayMerge(null, local, remote);
    assert.deepEqual(
      new Set(merged.global.historyDates),
      new Set(['2026-08-21', '2026-08-22', '2026-08-23']),
      'all study days preserved'
    );
    assert.equal(merged.global.streak, 3, 'higher streak survives');
    assert.ok(merged.global.totalStudyMinutes >= 45, 'total minutes never shrink');
  });
});

// ---------------------------------------------------------------------------
// Custom plans — the "keep my device plans" guarantee
// ---------------------------------------------------------------------------

describe('merge: custom plans (device plans)', () => {
  test('plans created on different devices are unioned by id — nothing is lost', () => {
    const base = app();
    const local = app({ customPlans: [plan('plan-a', 'My Go Plan')] });
    const remote = app({ customPlans: [plan('plan-b', 'Rust Plan')] });
    const { merged, conflicts } = threeWayMerge(base, local, remote);
    const ids = merged.customPlans.map((p) => p.id).sort();
    assert.deepEqual(ids, ['plan-a', 'plan-b'], 'both plans survive');
    assert.equal(conflicts.length, 0, 'additive plan creation is not a conflict');
  });

  test('same plan edited on both devices: newer lastModifiedAt wins (LWW)', () => {
    const base = app({ customPlans: [plan('plan-x', 'Original', { lastModifiedAt: 100 })] });
    const local = app({ customPlans: [plan('plan-x', 'Original edited locally', { lastModifiedAt: 200 })] });
    const remote = app({ customPlans: [plan('plan-x', 'Original edited remotely', { lastModifiedAt: 300 })] });
    const { merged } = threeWayMerge(base, local, remote);
    const p = merged.customPlans.find((c) => c.id === 'plan-x')!;
    assert.equal(p.name, 'Original edited remotely', 'remote (newer ts) wins');
  });

  test('deleting a plan on one device is a tombstone that wins — user intent respected', () => {
    const base = app({ customPlans: [plan('plan-x', 'Plan X', { lastModifiedAt: 100 })] });
    const local = app({ customPlans: [plan('plan-x', 'Plan X', { lastModifiedAt: 100 })] });
    const remote = app({
      customPlans: [plan('plan-x', 'Plan X', { lastModifiedAt: 200, deleted: true })]
    });
    const { merged, conflicts } = threeWayMerge(base, local, remote);
    assert.equal(merged.customPlans.find((c) => c.id === 'plan-x')?.deleted, true);
    assert.ok(
      conflicts.some((c) => c.field === 'plan.plan-x.deleted'),
      'deletion is surfaced to the user'
    );
  });

  test('first sync (no ancestor) with two divergent plans reports a conflict but keeps both', () => {
    const local = app({ customPlans: [plan('plan-x', 'Name A', { lastModifiedAt: 100 })] });
    const remote = app({ customPlans: [plan('plan-x', 'Name B', { lastModifiedAt: 200 })] });
    const { merged, conflicts } = threeWayMerge(null, local, remote);
    assert.equal(conflicts.length, 1);
    // Merge still resolves LWW: newer ts wins, no crash, no data corruption.
    assert.equal(merged.customPlans[0].name, 'Name B');
  });

  test('remote-only plan added during merge keeps its full structure (phases/sections)', () => {
    const remotePlan = plan('plan-imported', 'Imported', {
      phases: [
        { id: 0, section: 's1', title: 'Phase A', steps: ['s1'], exit: ['e1'] }
      ],
      lastModifiedAt: 50
    });
    const local = app();
    const remote = app({ customPlans: [remotePlan] });
    const { merged } = threeWayMerge(null, local, remote);
    assert.equal(merged.customPlans.length, 1);
    assert.equal(merged.customPlans[0].phases.length, 1);
    assert.deepEqual(merged.customPlans[0].phases[0].steps, ['s1']);
  });
});

// ---------------------------------------------------------------------------
// Progress — checkbox union & conflict detection
// ---------------------------------------------------------------------------

describe('merge: plan progress', () => {
  test('different boxes checked on different devices merge silently (no conflict)', () => {
    const base = app();
    const local = withStep(app(), 'go-roadmap', '1_0');
    const remote = withStep(app(), 'go-roadmap', '2_0');
    const { merged, conflicts } = threeWayMerge(base, local, remote);
    assert.equal(conflicts.length, 0, 'additive checkbox ticks are not conflicts');
    assert.equal(merged.progressByPlan['go-roadmap'].stepChecked['1_0'], true);
    assert.equal(merged.progressByPlan['go-roadmap'].stepChecked['2_0'], true);
  });

  test('true-wins: once checked on one device, an un-check on the other does not un-check it', () => {
    const base = app();
    const local = withStep(app(), 'go-roadmap', '1_0', true);
    const remote = withStep(app(), 'go-roadmap', '1_0', false);
    const { merged } = threeWayMerge(base, local, remote);
    assert.equal(merged.progressByPlan['go-roadmap'].stepChecked['1_0'], true);
  });

  test('completedPhases union across devices — completion is never lost', () => {
    const base = app();
    const local = app({
      progressByPlan: {
        'go-roadmap': { ...emptyProgress, completedPhases: [1, 2] }
      }
    });
    const remote = app({
      progressByPlan: {
        'go-roadmap': { ...emptyProgress, completedPhases: [2, 3] }
      }
    });
    const { merged } = threeWayMerge(base, local, remote);
    assert.deepEqual(merged.progressByPlan['go-roadmap'].completedPhases, [1, 2, 3]);
  });

  test('both devices edit the same note differently → conflict is reported', () => {
    const base = app();
    const local = withNote(app(), 'go-roadmap', 3, 'note from device A');
    const remote = withNote(app(), 'go-roadmap', 3, 'note from device B');
    const { conflicts } = threeWayMerge(base, local, remote);
    assert.ok(
      conflicts.some((c) => c.field === 'progress.go-roadmap'),
      `expected a progress conflict, got ${fieldNames(conflicts)}`
    );
  });

  test('userNotes are per-plan-key merged — a note on a different phase survives', () => {
    const base = app();
    const local = withNote(app(), 'go-roadmap', 3, 'phase 3 note');
    const remote = withNote(app(), 'go-roadmap', 5, 'phase 5 note');
    const { merged, conflicts } = threeWayMerge(base, local, remote);
    assert.equal(merged.progressByPlan['go-roadmap'].userNotes[3], 'phase 3 note');
    assert.equal(merged.progressByPlan['go-roadmap'].userNotes[5], 'phase 5 note');
    assert.equal(conflicts.length, 0, 'notes on different phases are additive');
  });

  // stepDurations merge is base-aware: the side that changed since the common
  // ancestor wins per key. A user's deliberate shorten on one device survives
  // even when the other device still holds the stale default.
  test('stepDurations LWW per key — single-sided changes survive', () => {
    const base = app({
      progressByPlan: {
        'go-roadmap': { ...emptyProgress, stepDurations: { '1_0': 3600, '2_0': 3600 } }
      }
    });
    const local = app({
      progressByPlan: { 'go-roadmap': { ...emptyProgress, stepDurations: { '1_0': 1200, '2_0': 3600 } } }
    });
    const remote = app({
      progressByPlan: { 'go-roadmap': { ...emptyProgress, stepDurations: { '1_0': 3600, '2_0': 5400 } } }
    });
    const { merged } = threeWayMerge(base, local, remote);
    const d = merged.progressByPlan['go-roadmap'].stepDurations!;
    assert.equal(d['1_0'], 1200, 'local changed since base → local wins (not clobbered by stale default)');
    assert.equal(d['2_0'], 5400, 'remote changed since base → remote wins');
  });
});

// ---------------------------------------------------------------------------
// Settings & active plan — LWW semantics
// ---------------------------------------------------------------------------

describe('merge: settings & active plan', () => {
  test('settings changed on one device merge silently', () => {
    const base = app();
    const local = app({ settings: { ...baseSettings, timeFormat: '24h' }, lastModifiedAt: 2000 });
    const remote = app();
    const { conflicts } = threeWayMerge(base, local, remote);
    assert.equal(conflicts.length, 0);
  });

  test('settings changed on both devices → conflict surfaced', () => {
    const base = app();
    const local = app({ settings: { ...baseSettings, timeFormat: '24h' }, lastModifiedAt: 2000 });
    const remote = app({ settings: { ...baseSettings, dailyFocusGoal: 90 }, lastModifiedAt: 3000 });
    const { conflicts } = threeWayMerge(base, local, remote);
    assert.ok(conflicts.some((c) => c.field === 'settings'));
  });

  test('active plan switches by last write (activePlanUpdatedAt LWW)', () => {
    const base = app();
    const local = app({ activePlanId: 'plan-a', activePlanUpdatedAt: 1000 });
    const remote = app({ activePlanId: 'plan-b', activePlanUpdatedAt: 2000 });
    const { merged } = threeWayMerge(base, local, remote);
    assert.equal(merged.activePlanId, 'plan-b');
  });
});

// ---------------------------------------------------------------------------
// Resolve-then-resync — the stuck-conflict-modal regression guard
// ---------------------------------------------------------------------------

describe('merge: resolve-then-resync stability', () => {
  test('after resolving a conflict, re-merging against the resolved state stays clean', () => {
    const base = app();
    const local = withStep(app(), 'go-roadmap', '1_0');
    const remote = withStep(app(), 'go-roadmap', '2_0');
    const r1 = threeWayMerge(base, local, remote);
    // User picks "use this device" → resolved = local, pushed to cloud.
    const resolved = local;
    const r2 = threeWayMerge(resolved, local, resolved);
    assert.equal(r2.conflicts.length, 0, 'modal must not reappear after resolution');
  });
});