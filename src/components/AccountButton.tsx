import React, { useState, useRef, useEffect } from 'react';
import { User, LogOut, Settings, RefreshCw, Check, ExternalLink, CloudOff } from 'lucide-react';
import { useConvexAuth, useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { SyncStatus } from './Header';

interface AccountButtonProps {
  onOpenAuthModal: () => void;
  onOpenSettings: () => void;
  syncStatus?: SyncStatus;
  /** Flush pending local changes before the auth session is torn down. */
  onBeforeSignOut?: () => Promise<void>;
}

const SYNCED_WINDOW_MS = 6 * 60 * 1000; // "Synced" while last push was within the 5-min push cadence

function getInitials(email: string): string {
  const [local] = email.split('@');
  const parts = local.split(/[._\-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function getNameInitials(name: string): string {
  const parts = name.split(/[\s._\-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export const AccountButton: React.FC<AccountButtonProps> = ({ onOpenAuthModal, onOpenSettings, syncStatus, onBeforeSignOut }) => {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const viewer = useQuery(api.auth.viewer);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const handleSignOut = async () => {
    // Flush local changes to the cloud first — the token is still valid here,
    // unlike in the post-sign-out effect.
    try {
      await onBeforeSignOut?.();
    } catch {
      // Best-effort flush; sign out regardless.
    }
    await signOut();
    setOpen(false);
  };

  // Honest sync status: syncing now → spinner; recent successful sync cycle
  // → "Synced"; otherwise (never synced / stale) → "Not synced".
  const syncedRecently =
    !!syncStatus?.lastSyncedAt &&
    Date.now() - syncStatus.lastSyncedAt < SYNCED_WINDOW_MS;

  const statusNode = syncStatus?.syncing ? (
    <div className="flex items-center gap-1.5 mt-1">
      <RefreshCw className="w-3 h-3 text-muted animate-spin" />
      <span className="text-[11px] text-faint font-mono">Syncing…</span>
    </div>
  ) : syncedRecently ? (
    <div className="flex items-center gap-1.5 mt-1">
      <Check className="w-3 h-3 text-success" />
      <span className="text-[11px] text-faint font-mono">Synced</span>
    </div>
  ) : (
    <div className="flex items-center gap-1.5 mt-1">
      <CloudOff className="w-3 h-3 text-warning" />
      <span className="text-[11px] text-faint font-mono">Not synced</span>
    </div>
  );

  // Loading skeleton.
  if (isLoading) {
    return (
      <div className="w-8 h-8 rounded-full bg-raised animate-pulse" aria-hidden="true" />
    );
  }

  // Signed-out state: ghost button.
  if (!isAuthenticated) {
    return (
      <button
        onClick={onOpenAuthModal}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-line text-xs font-medium text-muted hover:text-text hover:bg-hover hover:border-line-strong transition-colors cursor-pointer"
        title="Sign in to sync"
      >
        <User className="w-3.5 h-3.5" />
        <span className="hidden md:inline">Sign in</span>
      </button>
    );
  }

  // Signed-in state: avatar + popover.
  const email = viewer?.email ?? '';
  const name = viewer?.name ?? '';
  const avatarUrl = viewer?.image ?? null;
  const initials = avatarUrl
    ? ''
    : (name ? getNameInitials(name) : getInitials(email) || '??');

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Account menu"
        className="w-8 h-8 rounded-full bg-accent text-page flex items-center justify-center text-xs font-bold font-mono transition-opacity hover:opacity-85 cursor-pointer overflow-hidden"
        title={name || email || 'Account'}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Account actions"
          className="absolute right-0 top-full mt-2 w-56 py-1 rounded-lg bg-surface border border-line shadow-lg animate-slide-up z-50"
        >
          {/* User info */}
          <div className="px-3 py-2 border-b border-line">
            <p className="text-xs font-medium text-text truncate">{name || email || 'Signed in'}</p>
            {name && <p className="text-[11px] text-faint truncate mt-0.5">{email}</p>}
            {statusNode}
          </div>

          {/* Actions */}
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onOpenSettings(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </button>
          <button
            role="menuitem"
            onClick={() => { handleSignOut(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
};
