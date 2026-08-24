import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { syncMerge, threeWayMerge } from '../src/utils/merge';
import { AppData, Plan, PlanProgress } from '../src/types';

const emptyProgress: PlanProgress = {
  completedPhases: [],
  criteriaChecked: {},
  stepChecked: {},
  userNotes: {},
  lastStudiedPhaseId: null,
  stepDurations: {},
  stepDoneDay: {},
  phaseDoneDay: {}
};

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

describe('syncMerge — cloud-wins on conflict', () => {
  test('no conflict: returns the rich merged output (not remote)', () => {
    const base = app();
    // Each device checked a different step — additive, no conflict.
    const local = app({
      progressByPlan: {
        'go-roadmap': { ...emptyProgress, stepChecked: { step_a: true } }
      },
      lastModifiedAt: 1000
    });
    const remote = app({
      progressByPlan: {
        'go-roadmap': { ...emptyProgress, stepChecked: { step_b: true } }
      },
      lastModifiedAt: 1000
    });

    const result = syncMerge(base, local, remote);

    // Both steps are present (true-wins union preserved).
    assert.equal(result.progressByPlan['go-roadmap'].stepChecked['step_a'], true);
    assert.equal(result.progressByPlan['go-roadmap'].stepChecked['step_b'], true);

    // The rich merge was returned, NOT the raw remote.
    assert.notDeepEqual(result, remote);
  });

  test('conflict: returns the cloud snapshot (remote wins)', () => {
    // No shared base plan — first-sync divergence treated as conflict.
    const local = app({
      customPlans: [{ id: 'plan-x', name: 'Local Plan', emoji: '', accent: 'accent', sections: [], phases: [], lastModifiedAt: 1000 }],
      lastModifiedAt: 1000
    });
    const remote = app({
      customPlans: [{ id: 'plan-x', name: 'Remote Plan', emoji: '', accent: 'accent', sections: [], phases: [], lastModifiedAt: 2000 }],
      lastModifiedAt: 2000
    });

    // base is null → any divergence is a conflict.
    const result = syncMerge(null, local, remote);

    assert.deepEqual(result, remote);
  });

  test('conflict: cloud snapshot returned as-is, local extras discarded', () => {
    // Both have the same plan, both edited it since base → conflict.
    const base = app({
      customPlans: [{ id: 'plan-x', name: 'Original', emoji: '', accent: 'accent', sections: [], phases: [], lastModifiedAt: 1000 }],
      lastModifiedAt: 1000
    });
    const local = app({
      customPlans: [{ id: 'plan-x', name: 'Local Edit', emoji: '', accent: 'accent', sections: [], phases: [], lastModifiedAt: 2000 }],
      lastModifiedAt: 2000
    });
    const remote = app({
      customPlans: [{ id: 'plan-x', name: 'Cloud Edit', emoji: '', accent: 'accent', sections: [], phases: [], lastModifiedAt: 2001 }],
      lastModifiedAt: 2001
    });

    const result = syncMerge(base, local, remote);

    // Cloud wins entirely.
    assert.deepEqual(result, remote);
  });

  test('base is null (first sync): any divergence returns remote', () => {
    const local = app({
      progressByPlan: {
        'go-roadmap': { ...emptyProgress, stepChecked: { '1_0': true } }
      }
    });
    const remote = app({
      progressByPlan: {
        'go-roadmap': { ...emptyProgress, stepChecked: { '2_0': true } }
      }
    });

    const result = syncMerge(null, local, remote);

    // No common ancestor + divergence → treated as conflict → remote wins.
    assert.deepEqual(result, remote);
  });

  test('identical local and remote: no conflict, merged returned', () => {
    const base = app();
    const local = app({ lastModifiedAt: 2000 });
    const remote = app({ lastModifiedAt: 2000 });

    const result = syncMerge(base, local, remote);

    assert.deepEqual(result, local);
    assert.deepEqual(result, remote);
    // Sanity: verify the merge path was taken (not skipped).
    const { conflicts } = threeWayMerge(base, local, remote);
    assert.equal(conflicts.length, 0);
  });

  test('settings conflict: remote wins', () => {
    const base = app();
    const local = app({
      settings: { dailyReminderEnabled: false, dailyReminderTime: '09:00', timeFormat: '12h' },
      lastModifiedAt: 1000
    });
    const remote = app({
      settings: { dailyReminderEnabled: true, dailyReminderTime: '18:00', timeFormat: '24h' },
      lastModifiedAt: 2000
    });

    const result = syncMerge(base, local, remote);

    assert.deepEqual(result, remote);
    assert.deepEqual(result.settings, remote.settings);
  });
});
