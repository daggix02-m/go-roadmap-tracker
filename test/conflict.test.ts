import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWithPreference } from '../src/utils/merge';
import { normalizeAppData, defaultAppData } from '../src/utils/storage';
import { AppData, AppSettings, Plan } from '../src/types';

const plan = (id: string, name: string, modifiedAt = 100): Plan => ({
  id,
  name,
  accent: 'accent',
  emoji: '📋',
  sections: [],
  phases: [],
  lastModifiedAt: modifiedAt
});

const appData = (customPlans: Plan[]): AppData => ({
  version: 2,
  activePlanId: 'go-roadmap',
  activePlanUpdatedAt: 1,
  customPlans,
  settings: {
    dailyReminderEnabled: false,
    dailyReminderTime: '09:00',
    timeFormat: '12h'
  },
  global: {
    streak: 3,
    lastActiveDate: null,
    historyDates: [],
    totalStudyMinutes: 50,
    historyMinutes: {}
  },
  progressByPlan: {},
  lastModifiedAt: 100
});

describe('resolveWithPreference', () => {
  it("'local' keeps this device's state untouched", () => {
    const local = appData([plan('p1', 'Local plan')]);
    const remote = appData([plan('p2', 'Cloud plan')]);
    const out = resolveWithPreference('local', local, remote);
    assert.deepEqual(out.customPlans.map((p) => p.id), ['p1']);
    assert.equal(out, local);
  });

  it("'remote' adopts the cloud state untouched", () => {
    const local = appData([plan('p1', 'Local plan')]);
    const remote = appData([plan('p2', 'Cloud plan')]);
    const out = resolveWithPreference('remote', local, remote);
    assert.deepEqual(out.customPlans.map((p) => p.id), ['p2']);
    assert.equal(out, remote);
  });

  it("'merge' preserves both versions", () => {
    const local = appData([plan('p1', 'Local plan')]);
    const remote = appData([plan('p2', 'Cloud plan')]);
    const out = resolveWithPreference('merge', local, remote);
    const ids = out.customPlans.map((p) => p.id);
    assert.ok(ids.includes('p1'), 'local plan kept');
    assert.ok(
      ids.some((id) => id.startsWith('p2-fork-')),
      `cloud plan forked under new id, got ${JSON.stringify(ids)}`
    );
  });

  it("'merge' renames forked cloud plans with a '(cloud)' suffix", () => {
    const local = appData([]);
    const remote = appData([plan('p2', 'Roadmap')]);
    const out = resolveWithPreference('merge', local, remote);
    const forked = out.customPlans.find((p) => p.id.startsWith('p2-fork-'));
    assert.ok(forked, 'fork exists');
    assert.equal(forked.name, 'Roadmap (cloud)');
  });

  it("'merge' does not duplicate plans that exist on both devices", () => {
    const shared = plan('shared', 'Both have me');
    const local = appData([shared]);
    const remote = appData([{ ...shared, lastModifiedAt: 200 }]);
    const out = resolveWithPreference('merge', local, remote);
    assert.equal(out.customPlans.length, 1);
  });
});

describe('conflictResolution setting sanitization', () => {
  it("defaults to absent ('ask' behaviour) when never set", () => {
    const data = normalizeAppData(null);
    assert.equal(data.settings.conflictResolution, undefined);
    assert.equal(defaultAppData().settings.conflictResolution, undefined);
  });

  for (const valid of ['ask', 'local', 'remote', 'merge'] as const) {
    it(`accepts '${valid}'`, () => {
      const base = defaultAppData();
      const data = normalizeAppData({
        ...base,
        settings: { ...base.settings, conflictResolution: valid }
      });
      assert.equal(data.settings.conflictResolution, valid);
    });
  }

  it('drops unrecognized values so corrupt cloud data cannot poison settings', () => {
    const base = defaultAppData();
    const data = normalizeAppData({
      ...base,
      settings: {
        ...base.settings,
        // Simulates corrupt cloud data — the wire format is untyped JSON.
        conflictResolution: 'nuke-everything' as unknown as AppSettings['conflictResolution']
      }
    });
    assert.equal(data.settings.conflictResolution, undefined);
  });
});
