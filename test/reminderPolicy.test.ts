import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPushFailure,
  evaluateReminderRound,
  MAX_CONSECUTIVE_FAILURES
} from '../convex/reminderPolicy';

const ok = { ok: true };
const gone = { ok: false, status: 410 }; // endpoint no longer exists
const fail = { ok: false };

describe('classifyPushFailure', () => {
  it('treats 404/410 as gone — endpoint will never work again', () => {
    assert.equal(classifyPushFailure(404), 'gone');
    assert.equal(classifyPushFailure(410), 'gone');
  });

  it('treats 400/401/403 as an auth/key problem needing re-subscription', () => {
    assert.equal(classifyPushFailure(400), 'auth');
    assert.equal(classifyPushFailure(401), 'auth');
    assert.equal(classifyPushFailure(403), 'auth');
  });

  it('treats anything else (429, 500, network) as transient', () => {
    assert.equal(classifyPushFailure(429), 'transient');
    assert.equal(classifyPushFailure(500), 'transient');
    assert.equal(classifyPushFailure(undefined), 'transient');
  });
});

describe('evaluateReminderRound', () => {
  it('advances the schedule when at least one push succeeded', () => {
    const out = evaluateReminderRound([fail, ok], { failCount: 3 });
    assert.equal(out.action, 'advance');
    assert.equal(out.failCount, 0);
    assert.equal(out.lastError, undefined);
  });

  it('removes the schedule when every subscription is gone', () => {
    const out = evaluateReminderRound([gone, gone], {});
    assert.equal(out.action, 'removeSchedule');
  });

  it('gone subscriptions are removed even when another sub succeeds', () => {
    const out = evaluateReminderRound([ok, gone], {});
    assert.equal(out.action, 'advance');
    assert.deepEqual(out.removeEndpoints, [1], 'caller must know which sub to delete');
  });

  it('keeps retrying on transient failures until the cap is reached', () => {
    const first = evaluateReminderRound([fail], { failCount: 0 });
    assert.equal(first.action, 'retry');
    assert.equal(first.failCount, 1);
    assert.equal(first.lastError, 'transient');

    const nearCap = evaluateReminderRound(
      [fail],
      { failCount: MAX_CONSECUTIVE_FAILURES - 2 }
    );
    assert.equal(nearCap.action, 'retry');

    const capped = evaluateReminderRound(
      [fail],
      { failCount: MAX_CONSECUTIVE_FAILURES - 1 }
    );
    assert.equal(capped.action, 'removeSchedule');
  });

  it('flags auth failures distinctly so the UI can ask for a re-subscribe', () => {
    const out = evaluateReminderRound([{ ok: false, status: 403 }], { failCount: 0 });
    assert.equal(out.action, 'retry');
    assert.equal(out.lastError, 'auth');
  });

  it('an empty round (no subscriptions) removes the schedule', () => {
    assert.equal(evaluateReminderRound([], {}).action, 'removeSchedule');
  });
});
