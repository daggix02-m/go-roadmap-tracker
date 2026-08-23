import React, { useState, useRef, useEffect } from 'react';
import { User, LogOut, RefreshCw, Check, ExternalLink } from 'lucide-react';
import { useConvexAuth, useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

interface AccountButtonProps {
  onOpenAuthModal: () => void;
}

function getInitials(email: string): string {
  const [local] = email.split('@');
  const parts = local.split(/[._\-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

export const AccountButton: React.FC<AccountButtonProps> = ({ onOpenAuthModal }) => {
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
    await signOut();
    setOpen(false);
  };

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
  const initials = email ? getInitials(email) : '??';

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Account menu"
        className="w-8 h-8 rounded-full bg-accent text-page flex items-center justify-center text-xs font-bold font-mono transition-opacity hover:opacity-85 cursor-pointer"
        title={email || 'Account'}
      >
        {initials}
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
            <p className="text-xs font-medium text-text truncate">{email || 'Signed in'}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <Check className="w-3 h-3 text-success" />
              <span className="text-[11px] text-faint font-mono">Synced</span>
            </div>
          </div>

          {/* Actions */}
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
