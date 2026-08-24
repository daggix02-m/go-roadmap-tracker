/**
 * Unit tests for custom-plan deletion.
 *
 * BUG BEING REPRODUCED: deleting a custom plan hard-removed it from the
 * local array. The sync engine unions plans by id ("missing locally =
 * never existed"), so any stale copy on another device or in the cloud
 * resurrected the "deleted" plan on the next sync.
 *
 * The fix: deletion must leave a TOMBSTONE (`deleted: true`) so
 * mergePlans' "tombstone always wins" rule can propagate it, while
 * `getAllPlans` keeps tombstones invisible to the UI.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deleteCustomPlan, getAllPlans } from '../src/data/plans';
import { threeWayMerge } from '../src/utils/merge';
import { AppData, Plan, PlanProgress } from '../src/types';

// ---------------------------------------------------------------------------
// Fixtures (same conventions as merge.test.ts)
// ---------------------------------------------------------------------------

const emptyProgress: PlanProgress = {
  completedPhases: [],
  criteriaChecked: {},
  stepChecked: {},
  userNotes: {},
  lastStudiedPhaseId: null,
  stepDurations: {},
  stepDoneDay: {}
};

function plan(id: string, name: string, overrides: Partial<Plan> = {}): Plan {
  return {
    id,
    name,
    emoji: '📦',
    accent: 'accent',
    sections: [{ id: 's1', title: 'Part A' }],
    phases: [{ id: 1, section: 's1', title: 'Phase 1', steps: ['a'], exit: ['done'] }],
    lastModifiedAt: 100,
    ...overrides
  };
}

function app(overrides: Partial<AppData> = {}): AppData {
  return {
    version: 2,
    activePlanId: 'go-roadmap',
    activePlanUpdatedAt: 1000,
    customPlans: [],
    settings: {
      dailyReminderEnabled: false,
      dailyReminderTime: '09:00',
      timeFormat: '12h'
    },
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

describe('deleteCustomPlan', () => {
  test('leaves a tombstone (deleted: true) with a bumped lastModifiedAt', () => {
    const data = app({ customPlans: [plan('p1', 'Mine')] });
    const next = deleteCustomPlan(data, 'p1', 5000);

    assert.ok(next, 'delete returns new state');
    const tombstone = next!.customPlans.find((p) => p.id === 'p1');
    assert.ok(tombstone, 'tombstone stays in customPlans so sync can see it');
    assert.equal(tombstone!.deleted, true);
    assert.equal(tombstone!.lastModifiedAt, 5000, 'lastModifiedAt bumped to win LWW');
  });

  test('removes the deleted plan progress entry', () => {
    const data = app({
      customPlans: [plan('p1', 'Mine')],
      progressByPlan: { 'go-roadmap': { ...emptyProgress }, p1: { ...emptyProgress } }
    });
    const next = deleteCustomPlan(data, 'p1', 5000)!;

    assert.equal('p1' in next.progressByPlan, false);
    assert.ok(next.progressByPlan['go-roadmap'], 'other progress untouched');
  });

  test('falls back to the first built-in plan when the deleted plan was active', () => {
    const data = app({ customPlans: [plan('p1', 'Mine')], activePlanId: 'p1' });
    const next = deleteCustomPlan(data, 'p1', 5000)!;

    assert.equal(next.activePlanId, 'go-roadmap');
    assert.equal(next.activePlanUpdatedAt, 5000);
  });

  test('keeps activePlanId when a non-active plan is deleted', () => {
    const data = app({
      customPlans: [plan('p1', 'Mine'), plan('p2', 'Other')],
      activePlanId: 'p2'
    });
    const next = deleteCustomPlan(data, 'p1', 5000)!;

    assert.equal(next.activePlanId, 'p2');
    assert.equal(next.customPlans.length, 2);
  });

  test('refuses to delete built-in or unknown plans (returns null)', () => {
    assert.equal(deleteCustomPlan(app(), 'go-roadmap', 5000), null, 'built-in');
    assert.equal(deleteCustomPlan(app(), 'nope', 5000), null, 'unknown id');
  });

  test('defaults the timestamp to Date.now()', () => {
    const data = app({ customPlans: [plan('p1', 'Mine')] });
    const before = Date.now();
    const next = deleteCustomPlan(data, 'p1')!;
    assert.ok(
      (next.customPlans[0].lastModifiedAt ?? 0) >= before,
      'timestamp injected by default'
    );
  });
});

describe('getAllPlans hides tombstones', () => {
  test('excludes plans marked deleted from the visible list', () => {
    const data = app({
      customPlans: [plan('live', 'Live'), plan('gone', 'Gone', { deleted: true })]
    });

    const visible = getAllPlans(data).filter((p) => !p.builtIn);
    assert.deepEqual(visible.map((p) => p.id), ['live']);
  });

  test('findPlan via getAllPlans no longer resolves a tombstoned plan', () => {
    const data = app({ customPlans: [plan('gone', 'Gone', { deleted: true })] });
    assert.equal(getAllPlans(data).find((p) => p.id === 'gone'), undefined);
  });
});

describe('regression: sync must not resurrect a deleted custom plan', () => {
  test('local tombstone beats a live remote copy during three-way merge', () => {
    // Device A deleted the plan at t=5000 (tombstone). Device B never
    // synced since t=1000 and still has the live plan, then pushes it.
    const base = app({
      customPlans: [plan('p1', 'Original')],
      progressByPlan: { 'go-roadmap': { ...emptyProgress }, p1: { ...emptyProgress } }
    });
    const deletedLocally = deleteCustomPlan(base, 'p1', 5000)!;
    const remote = app({
      customPlans: [plan('p1', 'Original')],
      progressByPlan: { 'go-roadmap': { ...emptyProgress }, p1: { ...emptyProgress } }
    });

    const { merged } = threeWayMerge(base, deletedLocally, remote);

    assert.equal(merged.customPlans.find((p) => p.id === 'p1')?.deleted, true);
    assert.equal(
      getAllPlans(merged).some((p) => p.id === 'p1'),
      false,
      'deleted plan must stay hidden after merge'
    );
  });
});
