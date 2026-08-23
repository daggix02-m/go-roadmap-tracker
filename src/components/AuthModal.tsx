import React, { useState, useRef, useEffect } from 'react';
import { X, Mail, Lock, Loader2, AlertCircle } from 'lucide-react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth } from '@convex-dev/auth/react';

type Mode = 'signIn' | 'signUp';

interface AuthModalProps {
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onClose }) => {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Auto-focus email input on open.
  useEffect(() => {
    emailRef.current?.focus();
  }, [mode]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Trap focus inside modal.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'input, button, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    panel.addEventListener('keydown', trap);
    return () => panel.removeEventListener('keydown', trap);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic client-side validation.
    if (!email.trim() || !email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await signIn('password', {
        flow: mode === 'signUp' ? 'signUp' : 'signIn',
        email: email.trim().toLowerCase(),
        password
      });
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Something went wrong.';
      // Surface meaningful errors from the auth backend.
      if (msg.includes('already exists') || msg.includes('duplicate')) {
        setError('An account with this email already exists. Try signing in.');
      } else if (msg.includes('Invalid') || msg.includes('invalid') || msg.includes('Wrong')) {
        setError('Invalid email or password.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 animate-fade-in flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'signIn' ? 'Sign in' : 'Create account'}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        className="w-full max-w-sm bg-surface border border-line rounded-xl p-5 sm:p-6 relative animate-slide-up"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 p-1.5 rounded-md text-faint hover:text-text hover:bg-hover transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Title + mode toggle */}
        <div className="text-center mb-5">
          <h2 className="text-base font-semibold tracking-tight text-text">
            {mode === 'signIn' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="text-xs text-muted mt-1">
            {mode === 'signIn'
              ? 'Sign in to sync your progress across devices.'
              : 'Start syncing your study progress to the cloud.'}
          </p>
          <div className="flex justify-center gap-1 mt-3" role="tablist" aria-label="Authentication method">
            <button
              role="tab"
              aria-selected={mode === 'signIn'}
              onClick={() => { setMode('signIn'); setError(null); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                mode === 'signIn'
                  ? 'bg-accent text-page'
                  : 'text-muted hover:text-text hover:bg-hover'
              }`}
            >
              Sign in
            </button>
            <button
              role="tab"
              aria-selected={mode === 'signUp'}
              onClick={() => { setMode('signUp'); setError(null); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                mode === 'signUp'
                  ? 'bg-accent text-page'
                  : 'text-muted hover:text-text hover:bg-hover'
              }`}
            >
              Create account
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Error banner */}
          {error && (
            <div className="mb-3 p-2.5 rounded-md border border-danger/30 bg-danger/5 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <span className="text-xs text-danger leading-relaxed">{error}</span>
            </div>
          )}

          {/* Email field */}
          <div className="mb-3">
            <label htmlFor="auth-email" className="sr-only">
              Email address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
              <input
                ref={emailRef}
                id="auth-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-md border border-line bg-raised text-text text-sm font-mono placeholder:text-faint/50 focus:outline-none focus:border-accent/60 transition-colors"
              />
            </div>
          </div>

          {/* Password field */}
          <div className="mb-4">
            <label htmlFor="auth-password" className="sr-only">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
              <input
                id="auth-password"
                type="password"
                autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-md border border-line bg-raised text-text text-sm font-mono placeholder:text-faint/50 focus:outline-none focus:border-accent/60 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-md bg-text text-page text-sm font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-85 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {mode === 'signIn' ? 'Signing in…' : 'Creating account…'}
              </>
            ) : mode === 'signIn' ? (
              'Sign in'
            ) : (
              'Create account'
            )}
          </button>
        </form>

        <p className="text-center text-[11px] text-faint mt-4">
          {mode === 'signIn' ? (
            <>
              Don't have an account?{' '}
              <button
                onClick={() => { setMode('signUp'); setError(null); }}
                className="text-accent hover:underline cursor-pointer"
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => { setMode('signIn'); setError(null); }}
                className="text-accent hover:underline cursor-pointer"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
};
