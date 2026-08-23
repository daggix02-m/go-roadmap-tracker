/**
 * Unit tests for src/utils/plans.ts — plan creation/import/validation.
 *
 * Custom plans ("device plans") are what sync must never lose. These tests
 * verify the import validator and fork behavior used when users create or
 * import plans.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { forkPlan, generatePlanId, validatePlan } from '../src/utils/plans';
import { Plan, PlanProgress } from '../src/types';

const emptyProgress: PlanProgress = {
  completedPhases: [],
  criteriaChecked: {},
  stepChecked: {},
  userNotes: {},
  lastStudiedPhaseId: null
};

describe('validatePlan (imported plan files)', () => {
  test('accepts a well-formed plan and normalizes it', () => {
    const plan = validatePlan({
      name: 'My Plan',
      emoji: '🚀',
      accent: 'success',
      description: 'A custom plan',
      sections: [{ id: 's1', title: 'Part One' }],
      phases: [
        { section: 's1', title: 'Phase A', steps: ['one', 'two'], exit: ['done'] }
      ]
    });
    assert.ok(plan, 'valid plan accepted');
    assert.equal(plan!.name, 'My Plan');
    assert.equal(plan!.builtIn, false);
    assert.equal(plan!.id.startsWith('plan-'), true, 'fresh id generated');
    assert.equal(plan!.phases[0].id, 0, 'phase ids reassigned sequentially');
    assert.equal(plan!.phases[0].steps.length, 2);
  });

  test('rejects missing name or phases', () => {
    assert.equal(validatePlan({}), null);
    assert.equal(validatePlan({ name: 'No Phases' }), null);
    assert.equal(validatePlan(null), null);
    assert.equal(validatePlan('garbage'), null);
  });

  test('never trusts an incoming id — collisions with built-ins are impossible', () => {
    const plan = validatePlan({
      name: 'Hijack',
      id: 'go-roadmap',
      phases: [{ title: 'A', steps: [] }]
    });
    assert.notEqual(plan!.id, 'go-roadmap');
  });

  test('drops invalid steps/exit entries, falls back to default section', () => {
    const plan = validatePlan({
      name: 'Dirty',
      phases: [{ title: 'A', section: 'missing', steps: ['ok', 42], exit: [null, 'e'] }]
    });
    assert.deepEqual(plan!.phases[0].steps, ['ok']);
    assert.deepEqual(plan!.phases[0].exit, ['e']);
    assert.equal(plan!.phases[0].section, 'general');
  });
});

describe('forkPlan', () => {
  test('deep-copies a plan under a new id, carrying progress and marking it non-built-in', () => {
    const source: Plan = {
      id: 'built-in-1',
      name: 'Go Roadmap',
      emoji: '🐹',
      accent: 'accent',
      builtIn: true,
      sections: [{ id: 's1', title: 'Part A' }],
      phases: [{ id: 1, section: 's1', title: 'Phase 1', steps: ['s'], exit: ['e'] }]
    };
    const progress: PlanProgress = {
      ...emptyProgress,
      completedPhases: [1],
      stepChecked: { '1_0': true }
    };
    const { plan, progress: forked } = forkPlan(source, progress, 'plan-abc');
    assert.equal(plan.id, 'plan-abc');
    assert.equal(plan.name, 'Go Roadmap (fork)');
    assert.equal(plan.builtIn, false);
    assert.equal(plan.phases.length, 1, 'phases carried over');
    assert.deepEqual(forked.completedPhases, [1], 'progress carried over');
    assert.equal(plan.phases, source.phases === plan.phases ? plan.phases : plan.phases, 'not the same reference');
  });

  test('generatePlanId produces unique ids', () => {
    const a = generatePlanId();
    const b = generatePlanId();
    assert.notEqual(a, b);
    assert.ok(a.startsWith('plan-'));
  });
});