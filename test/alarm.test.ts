import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAlarmBeeps } from '../src/utils/notifications';

describe('buildAlarmBeeps (timer expiry alarm)', () => {
  it('schedules exactly three beeps', () => {
    assert.equal(buildAlarmBeeps().length, 3);
  });

  it('beeps rise in pitch so the alarm reads as "done", not an error tone', () => {
    const beeps = buildAlarmBeeps();
    for (let i = 1; i < beeps.length; i++) {
      assert.ok(
        beeps[i].frequencyHz > beeps[i - 1].frequencyHz,
        `beep ${i} freq ${beeps[i].frequencyHz} should exceed ${beeps[i - 1].frequencyHz}`
      );
    }
  });

  it('beeps play one after another with no overlap', () => {
    const beeps = buildAlarmBeeps();
    for (let i = 1; i < beeps.length; i++) {
      const prevEnd =
        beeps[i - 1].startOffsetSec + beeps[i - 1].durationSec;
      assert.ok(
        beeps[i].startOffsetSec >= prevEnd,
        `beep ${i} starts at ${beeps[i].startOffsetSec} before previous ends at ${prevEnd}`
      );
    }
  });

  it('whole alarm finishes in under 1.5s — noticeable but not nagging', () => {
    const beeps = buildAlarmBeeps();
    const last = beeps[beeps.length - 1];
    assert.ok(last.startOffsetSec + last.durationSec < 1.5);
  });

  it('every beep has a positive audible duration', () => {
    for (const b of buildAlarmBeeps()) {
      assert.ok(b.durationSec > 0.05);
      assert.ok(b.frequencyHz >= 200 && b.frequencyHz <= 4000);
    }
  });
});
