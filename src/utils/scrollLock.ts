import { useEffect } from 'react';

/** Minimal style-surface so the manager is testable without a DOM. */
export interface OverflowSetter {
  getOverflow(): string | null;
  setOverflow(value: string | null): void;
}

/**
 * Manages page-scroll locking for overlays/modals.
 *
 * The first lock captures the current overflow value and hides it; further
 * nested locks are counted but do not touch the value. Only the outermost
 * release restores the captured value, so opening Settings → Import (two
 * modals) can't unlock the page early. An unbalanced unlock is a no-op.
 */
export class ScrollLockManager {
  private locks = 0;
  private previous: string | null = null;

  constructor(private readonly target: OverflowSetter) {}

  get activeLockCount(): number {
    return this.locks;
  }

  lock(): void {
    if (this.locks === 0) {
      this.previous = this.target.getOverflow();
      this.target.setOverflow('hidden');
    }
    this.locks += 1;
  }

  unlock(): void {
    if (this.locks === 0) return;
    this.locks -= 1;
    if (this.locks === 0) {
      this.target.setOverflow(this.previous);
      this.previous = null;
    }
  }
}

// Lazily-built singleton bound to the real document body (built lazily so
// importing this module never touches `document` in a non-browser test).
let defaultManager: ScrollLockManager | null = null;

function getDefaultManager(): ScrollLockManager {
  if (!defaultManager) {
    defaultManager = new ScrollLockManager({
      getOverflow: () => document.body.style.overflow,
      setOverflow: (v) => {
        document.body.style.overflow = v ?? '';
      }
    });
  }
  return defaultManager;
}

/**
 * Locks page scroll for as long as `active` is true. Intended to be called
 * unconditionally from modal bodies that only render while open — the cleanup
 * releases the lock when the modal unmounts.
 */
export function useScrollLock(active: boolean, manager: ScrollLockManager = getDefaultManager()): void {
  useEffect(() => {
    if (!active) return;
    manager.lock();
    return () => manager.unlock();
  }, [active, manager]);
}