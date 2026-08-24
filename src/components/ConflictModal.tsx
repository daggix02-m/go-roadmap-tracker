import React, { useState, useRef, useEffect } from 'react';
import { AlertTriangle, X, ArrowRight, ArrowLeft, GitMerge } from 'lucide-react';
import { Conflict } from '../utils/merge';
import { useScrollLock } from '../utils/scrollLock';

export type ConflictResolution = 'local' | 'remote' | 'merge';

interface ConflictModalProps {
  conflicts: Conflict[];
  /** `remember` is true when the user asked to store the choice. */
  onResolve: (resolution: ConflictResolution, remember?: boolean) => void;
}

/**
 * Conflict resolution modal — shown when a three-way merge detects
 * diverged data that cannot be auto-resolved. The user picks:
 *   • "Use this device" → local wins entirely
 *   • "Use cloud"       → remote wins entirely
 *   • "Keep both"       → fork: keep local + create a new snapshot
 *     with the remote data under a new plan id (git-style "both")
 * Optionally remembers the choice so future conflicts auto-resolve.
 */
export const ConflictModal: React.FC<ConflictModalProps> = ({ conflicts, onResolve }) => {
  useScrollLock(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const [remember, setRemember] = useState(false);

  // Auto-focus panel for keyboard nav.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Escape closes with "local" (safe default) — never remembers.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onResolve('local');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onResolve]);

  const resolve = (resolution: ConflictResolution) =>
    onResolve(resolution, remember);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 animate-fade-in flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Sync conflict"
      onClick={(e) => e.target === e.currentTarget && onResolve('local')}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-md bg-surface border border-line rounded-xl p-5 sm:p-6 relative animate-slide-up outline-none"
      >
        <button
          onClick={() => onResolve('local')}
          aria-label="Close"
          className="absolute top-3 right-3 p-1.5 rounded-md text-faint hover:text-text hover:bg-hover transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-warning/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-text">
              Sync conflict detected
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Changes were made on both devices since the last sync.
              Choose how to resolve:
            </p>
          </div>
        </div>

        {/* Conflict list */}
        <div className="mb-5 max-h-48 overflow-y-auto rounded-md border border-line bg-raised/50 divide-y divide-line">
          {conflicts.map((c, i) => (
            <div key={i} className="px-3 py-2.5">
              <p className="text-xs font-medium text-text">{c.field}</p>
              <p className="text-[11px] text-muted mt-0.5">{c.message}</p>
            </div>
          ))}
        </div>

        {/* Resolution buttons */}
        <div className="grid grid-cols-1 gap-2">
          <button
            onClick={() => resolve('local')}
            className="flex items-center gap-3 px-4 py-3 rounded-lg border border-line hover:border-accent/50 hover:bg-accent/5 transition-colors cursor-pointer text-left group"
          >
            <ArrowLeft className="w-4 h-4 text-accent shrink-0" />
            <div>
              <p className="text-xs font-semibold text-text group-hover:text-accent">Use this device</p>
              <p className="text-[11px] text-faint mt-0.5">Discard changes from the other device.</p>
            </div>
          </button>

          <button
            onClick={() => resolve('remote')}
            className="flex items-center gap-3 px-4 py-3 rounded-lg border border-line hover:border-accent/50 hover:bg-accent/5 transition-colors cursor-pointer text-left group"
          >
            <ArrowRight className="w-4 h-4 text-accent shrink-0" />
            <div>
              <p className="text-xs font-semibold text-text group-hover:text-accent">Use cloud</p>
              <p className="text-[11px] text-faint mt-0.5">Discard changes made on this device.</p>
            </div>
          </button>

          <button
            onClick={() => resolve('merge')}
            className="flex items-center gap-3 px-4 py-3 rounded-lg border border-line hover:border-accent/50 hover:bg-accent/5 transition-colors cursor-pointer text-left group"
          >
            <GitMerge className="w-4 h-4 text-accent shrink-0" />
            <div>
              <p className="text-xs font-semibold text-text group-hover:text-accent">Keep both</p>
              <p className="text-[11px] text-faint mt-0.5">Preserve both versions as separate plans.</p>
            </div>
          </button>
        </div>

        {/* Remember choice */}
        <label className="mt-4 flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="mt-0.5 w-3.5 h-3.5 accent-current cursor-pointer"
          />
          <span className="text-[11px] text-muted leading-relaxed">
            Always resolve future conflicts this way. You can change it anytime in
            Settings → Preferences → Sync conflicts.
          </span>
        </label>
      </div>
    </div>
  );
};
