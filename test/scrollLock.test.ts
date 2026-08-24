/**
 * Unit tests for src/utils/scrollLock.ts — the ScrollLockManager.
 *
 * The manager keeps page scroll locked while a modal is open. Because modals
 * can be nested (Settings → Import), the manager must:
 *  - capture the pre-lock overflow value exactly once
 *  - tolerate overlapping locks (only the outermost release restores it)
 *  - ignore unbalanced unlocks
 *  - re-capture the current value on a fresh lock cycle
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ScrollLockManager, OverflowSetter } from '../src/utils/scrollLock';

/** In-memory overflow holder — no DOM needed. */
function holder(initial: string | null = ''): OverflowSetter & { value: string | null } {
  const h = {
    value: initial,
    getOverflow(): string | null {
      return h.value;
    },
    setOverflow(v: string | null): void {
      h.value = v;
    }
  };
  return h;
}

describe('ScrollLockManager', () => {
  test('captures the pre-lock overflow and hides it on the first lock', () => {
    const body = holder('scroll');
    const manager = new ScrollLockManager(body);
    manager.lock();
    assert.equal(body.value, 'hidden', 'overflow hidden while locked');
    assert.equal(manager.activeLockCount, 1);
  });

  test('nested locks do not overwrite the captured overflow', () => {
    const body = holder('auto');
    const manager = new ScrollLockManager(body);
    manager.lock();
    manager.lock();
    assert.equal(body.value, 'hidden', 'still hidden after the second lock');
    manager.unlock();
    assert.equal(body.value, 'hidden', 'first unlock keeps the page locked');
    manager.unlock();
    assert.equal(body.value, 'auto', 'outermost unlock restores the original overflow');
    assert.equal(manager.activeLockCount, 0);
  });

  test('unlock without a lock is a no-op', () => {
    const body = holder('scroll');
    const manager = new ScrollLockManager(body);
    manager.unlock();
    assert.equal(body.value, 'scroll', 'overflow untouched');
    assert.equal(manager.activeLockCount, 0);
  });

  test('a fresh lock cycle re-captures whatever overflow is current', () => {
    const body = holder('auto');
    const manager = new ScrollLockManager(body);

    manager.lock();
    manager.unlock();
    assert.equal(body.value, 'auto');

    // Simulate something else setting overflow between modal sessions.
    body.setOverflow('clip');
    manager.lock();
    manager.unlock();
    assert.equal(body.value, 'clip', 're-captured the new value, not the old one');
  });

  test('empty overflow is restored to an empty string, not left as hidden', () => {
    const body = holder('');
    const manager = new ScrollLockManager(body);
    manager.lock();
    manager.unlock();
    assert.equal(body.value, '', 'restored to the original (empty) overflow');
  });
});