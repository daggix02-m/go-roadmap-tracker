import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateTimerRound,
  buildTimerNotification,
  TimerScheduleEntry
} from '../convex/timerPolicy';

describe('evaluateTimerRound', () => {
  it('returns fire action when at least one push succeeded', () => {
    const entry: TimerScheduleEntry = {
      _id: 'timer1' as any,
      userId: 'user1' as any,
      endsAtMs: 1000,
      kind: 'focus',
      variant: 'study'
    };
    const result = evaluateTimerRound(entry, [
      { ok: true },
      { ok: false, status: 500 }
    ]);
    assert.equal(result.action, 'fire');
    assert.equal(result.failCount, 0);
  });

  it('returns removeSchedule when all subscriptions are gone', () => {
    const entry: TimerScheduleEntry = {
      _id: 'timer1' as any,
      userId: 'user1' as any,
      endsAtMs: 1000,
      kind: 'focus',
      variant: 'study'
    };
    const result = evaluateTimerRound(entry, [
      { ok: false, status: 410 },
      { ok: false, status: 404 }
    ]);
    assert.equal(result.action, 'removeSchedule');
  });

  it('retries on transient failures until cap is reached', () => {
    const entry: TimerScheduleEntry = {
      _id: 'timer1' as any,
      userId: 'user1' as any,
      endsAtMs: 1000,
      kind: 'focus',
      variant: 'study'
    };

    const first = evaluateTimerRound(entry, [{ ok: false, status: 500 }], 0);
    assert.equal(first.action, 'retry');
    assert.equal(first.failCount, 1);

    const capped = evaluateTimerRound(entry, [{ ok: false, status: 500 }], 4);
    assert.equal(capped.action, 'removeSchedule');
    assert.equal(capped.failCount, 5);
  });

  it('returns removeSchedule when no subscriptions exist', () => {
    const entry: TimerScheduleEntry = {
      _id: 'timer1' as any,
      userId: 'user1' as any,
      endsAtMs: 1000,
      kind: 'focus',
      variant: 'study'
    };
    const result = evaluateTimerRound(entry, []);
    assert.equal(result.action, 'removeSchedule');
  });

  it('removes gone endpoints even when another succeeds', () => {
    const entry: TimerScheduleEntry = {
      _id: 'timer1' as any,
      userId: 'user1' as any,
      endsAtMs: 1000,
      kind: 'focus',
      variant: 'study'
    };
    const result = evaluateTimerRound(entry, [
      { ok: true },
      { ok: false, status: 410 }
    ]);
    assert.equal(result.action, 'fire');
    assert.deepEqual(result.removeEndpoints, [1]);
  });
});

describe('buildTimerNotification', () => {
  it('builds a focus study completion notification', () => {
    const entry: TimerScheduleEntry = {
      _id: 'timer1' as any,
      userId: 'user1' as any,
      endsAtMs: 1000,
      kind: 'focus',
      variant: 'study',
      phaseLabel: 'Phase 3 — Interfaces'
    };
    const notif = buildTimerNotification(entry, 60);
    assert.equal(notif.title, 'Focus session complete');
    assert.ok(notif.body.includes('60 min'));
    assert.ok(notif.body.includes('Phase 3 — Interfaces'));
    assert.equal(notif.tag, 'focus-complete');
  });

  it('builds a break completion notification', () => {
    const entry: TimerScheduleEntry = {
      _id: 'timer1' as any,
      userId: 'user1' as any,
      endsAtMs: 1000,
      kind: 'focus',
      variant: 'break'
    };
    const notif = buildTimerNotification(entry, 15);
    assert.equal(notif.title, 'Break time over');
    assert.ok(notif.body.includes('15-minute'));
    assert.equal(notif.tag, 'break-complete');
  });

  it('uses a generic message when no phase label is provided', () => {
    const entry: TimerScheduleEntry = {
      _id: 'timer1' as any,
      userId: 'user1' as any,
      endsAtMs: 1000,
      kind: 'focus',
      variant: 'study'
    };
    const notif = buildTimerNotification(entry, 30);
    assert.ok(notif.body.includes('30 min'));
    assert.ok(notif.body.includes('Open the app'));
  });
});
