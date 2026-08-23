import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  Clock,
  Download,
  Loader2,
  Mail,
  Target,
  Trash2,
  User,
  X
} from 'lucide-react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { useAuthActions, useConvexAuth } from '@convex-dev/auth/react';
import { api } from '../../convex/_generated/api';
import { AppData, AppSettings } from '../types';
import { exportAppDataAsJSON } from '../utils/storage';

interface SettingsModalProps {
  settings: AppSettings;
  onUpdateSettings: (updater: (prev: AppSettings) => AppSettings) => void;
  appData: AppData;
  onClose: () => void;
  /** Opens the sign-in/sign-up modal (used by the signed-out state). */
  onOpenAuthModal: () => void;
}

const FALLBACK_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Africa/Addis_Ababa',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney'
];

const TIMEZONES: string[] =
  typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl
    ? (Intl.supportedValuesOf('timeZone') as string[])
    : FALLBACK_TIMEZONES;

const labelClass = 'block font-mono text-[10px] uppercase tracking-wider text-faint mb-1';
const inputClass =
  'w-full px-2.5 py-1.5 bg-page border border-line rounded-md text-sm text-text placeholder:text-faint focus:outline-none focus:border-accent transition-colors';

function getInitials(name: string, email: string): string {
  const source = name.trim() || email.split('@')[0];
  const parts = source.split(/[._\-\s]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/**
 * Translate raw Convex/auth error strings into user-friendly copy.
 * The most common failure in Settings is a stored token the backend can't
 * verify ("Not authenticated" / "Failed to authenticate") — usually an
 * expired or invalidated session, not a real action failure.
 */
function authErrorMessage(msg: string): string {
  if (
    msg.toLowerCase().includes('not authenticated') ||
    msg.toLowerCase().includes('failed to authenticate') ||
    msg.toLowerCase().includes('no auth provider found')
  ) {
    return 'Session expired — please sign in again.';
  }
  return msg;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdateSettings,
  appData,
  onClose,
  onOpenAuthModal
}) => {
  const { signOut } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.auth.viewer);
  const updateProfile = useMutation(api.profile.updateProfile);
  const generateUploadUrl = useMutation(api.profile.generateUploadUrl);
  const changeEmail = useAction(api.profile.changeEmail);
  const changePassword = useAction(api.profile.changePassword);
  const deleteAccount = useMutation(api.profile.deleteAccount);

  const fileRef = useRef<HTMLInputElement>(null);

  // Server-verified session: `viewer` is null when the stored token can't be
  // verified (expired/invalidated), even if the client still thinks it's
  // signed in. Gate account-management sections on it so users never see
  // dead buttons.
  const sessionLoading = viewer === undefined;
  const sessionOk = viewer !== null;

  // --- profile form ---
  const [name, setName] = useState(viewer?.name ?? '');
  const nameEdited = useRef(false);

  // Keep the name field in sync once viewer loads (modal may open before it resolves).
  useEffect(() => {
    if (!nameEdited.current && viewer?.name) setName(viewer.name);
  }, [viewer?.name]);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // --- email form ---
  const [email, setEmail] = useState('');
  const [emailPw, setEmailPw] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // --- password form ---
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // --- prefs form ---
  const [timezone, setTimezone] = useState(settings.timezone ?? '');
  const [dailyGoal, setDailyGoal] = useState(settings.dailyFocusGoal ? String(settings.dailyFocusGoal) : '');
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null);

  // --- delete account ---
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const email_ = viewer?.email ?? '';
  const displayName = viewer?.name ?? '';
  const avatarUrl = avatarPreview ?? viewer?.image ?? null;

  const saveName = async () => {
    setNameSaving(true);
    setNameMsg(null);
    try {
      await updateProfile({ name });
      setNameMsg({ ok: true, text: 'Name saved.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setNameMsg({ ok: false, text: authErrorMessage(msg) });
    } finally {
      setNameSaving(false);
    }
  };

  const onPickAvatar = async (file: File) => {
    setAvatarBusy(true);
    setAvatarMsg(null);
    try {
      setAvatarPreview(URL.createObjectURL(file));
      const uploadUrl = await generateUploadUrl();
      // Convex storage rejects requests whose Content-Type is empty (e.g.
      // HEIC/camera captures where file.type is ''). Fall back to a generic
      // type so the upload still works.
      const contentType = file.type || 'application/octet-stream';
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: file
      });
      if (!res.ok) throw new Error('Upload failed');
      const { storageId } = await res.json();
      await updateProfile({ image: storageId });
      setAvatarPreview(null);
      setAvatarMsg({ ok: true, text: 'Photo updated.' });
    } catch (err) {
      setAvatarPreview(null);
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setAvatarMsg({ ok: false, text: authErrorMessage(msg) });
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async () => {
    setAvatarBusy(true);
    try {
      await updateProfile({ image: '' });
    } finally {
      setAvatarBusy(false);
    }
  };

  const saveEmail = async () => {
    setEmailMsg(null);
    if (!email.includes('@')) {
      setEmailMsg({ ok: false, text: 'Enter a valid email address.' });
      return;
    }
    setEmailBusy(true);
    try {
      await changeEmail({ currentPassword: emailPw, email });
      setEmail('');
      setEmailPw('');
      setEmailMsg({ ok: true, text: 'Email updated.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setEmailMsg({
        ok: false,
        text: msg.includes('InvalidSecret')
          ? 'Current password is incorrect.'
          : msg.toLowerCase().includes('duplicate')
            ? 'That email is already in use.'
            : authErrorMessage(msg)
      });
    } finally {
      setEmailBusy(false);
    }
  };

  const savePassword = async () => {
    setPwMsg(null);
    if (newPw.length < 8) {
      setPwMsg({ ok: false, text: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ ok: false, text: 'Passwords do not match.' });
      return;
    }
    setPwBusy(true);
    try {
      await changePassword({ currentPassword: curPw, newPassword: newPw });
      setCurPw('');
      setNewPw('');
      setConfirmPw('');
      setPwMsg({ ok: true, text: 'Password updated. Other devices have been signed out.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setPwMsg({
        ok: false,
        text: msg.includes('InvalidSecret')
          ? 'Current password is incorrect.'
          : authErrorMessage(msg)
      });
    } finally {
      setPwBusy(false);
    }
  };

  const savePrefs = () => {
    onUpdateSettings((prev) => {
      const next = { ...prev };
      if (timezone !== '') next.timezone = timezone;
      else delete next.timezone;
      const goal = parseInt(dailyGoal, 10);
      if (Number.isFinite(goal) && goal > 0) next.dailyFocusGoal = goal;
      else delete next.dailyFocusGoal;
      return next;
    });
    setPrefsMsg('Preferences saved.');
    setTimeout(() => setPrefsMsg(null), 3000);
  };

  const handleDeleteAccount = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setDeleteMsg(null);
      return;
    }
    setDeleteBusy(true);
    setDeleteMsg(null);
    try {
      await deleteAccount();
      localStorage.removeItem('plan_tracker_v2');
      localStorage.removeItem('plan_tracker_last_synced');
      await signOut();
      window.location.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setDeleteMsg({ ok: false, text: authErrorMessage(msg) });
      setDeleteBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Account settings"
        className="w-full max-w-lg bg-surface border border-line rounded-xl relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-line px-5 py-3.5 flex items-center justify-between gap-2 z-10">
          <div>
            <h2 className="text-base font-semibold text-text">Account settings</h2>
            <p className="text-[11px] text-muted">Profile, security, and preferences</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="p-1.5 text-muted hover:text-text rounded-md hover:bg-hover transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-6">
          {sessionLoading ? (
            <div className="py-10 text-center text-sm text-muted">Loading account…</div>
          ) : !sessionOk ? (
            <div className="py-6 text-center">
              <h3 className="text-sm font-semibold text-text">Account</h3>
              <p className="text-[11px] text-muted mt-1 mb-3">
                {isAuthenticated
                  ? 'Your session has expired. Sign in again to manage your profile and data.'
                  : 'Sign in to sync your progress, manage your profile, and back up your data.'}
              </p>
              <button
                onClick={onOpenAuthModal}
                className="px-3 py-1.5 rounded-md bg-text text-page text-xs font-semibold transition-opacity hover:opacity-85 cursor-pointer"
              >
                Sign in
              </button>
            </div>
          ) : (
            <>
          {/* Profile */}
          <section className="space-y-3">
            <h3 className={labelClass}>Profile</h3>

            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Profile"
                    className="w-14 h-14 rounded-full object-cover bg-raised border border-line"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-accent text-page flex items-center justify-center text-base font-bold font-mono">
                    {getInitials(displayName, email_)}
                  </div>
                )}
                {avatarBusy && (
                  <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  </div>
                )}
              </div>
              <div className="flex flex-col items-start gap-1.5">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-line text-xs font-medium text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Change photo
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  aria-hidden="true"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) onPickAvatar(f);
                  }}
                />
                {viewer?.image && (
                  <button
                    onClick={removeAvatar}
                    className="text-[11px] text-faint hover:text-danger transition-colors cursor-pointer"
                  >
                    Remove photo
                  </button>
                )}
                {avatarMsg && (
                  <span
                    className={`text-[11px] ${avatarMsg.ok ? 'text-success' : 'text-danger'}`}
                    role={avatarMsg.ok ? 'status' : 'alert'}
                  >
                    {avatarMsg.text}
                  </span>
                )}
              </div>
            </div>

            {/* Name */}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label htmlFor="settings-name" className={labelClass}>
                  Name
                </label>
                <div className="relative">
                  <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
                  <input
                    id="settings-name"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      nameEdited.current = true;
                      setName(e.target.value);
                    }}
                    onBlur={() => name !== displayName && saveName()}
                    className={`${inputClass} pl-8`}
                  />
                </div>
              </div>
              <button
                onClick={saveName}
                disabled={nameSaving || name === displayName}
                className="px-3 py-1.5 rounded-md border border-line text-xs font-medium text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {nameSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
              </button>
              {nameMsg && (
                <p
                  className={`text-[11px] mt-1 ${nameMsg.ok ? 'text-success' : 'text-danger'}`}
                  role={nameMsg.ok ? 'status' : 'alert'}
                >
                  {nameMsg.text}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className={labelClass}>Email</label>
              <div className="flex items-center gap-2 text-sm text-text px-2.5 py-1.5 bg-page border border-line rounded-md">
                <Mail className="w-4 h-4 text-faint shrink-0" />
                <span className="truncate">{email_ || '—'}</span>
              </div>

              <div className="mt-2 p-3 rounded-lg bg-raised border border-line space-y-2">
                <p className="text-[11px] text-muted">Change email (requires current password)</p>
                <input
                  type="email"
                  placeholder="New email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="password"
                  placeholder="Current password"
                  value={emailPw}
                  onChange={(e) => setEmailPw(e.target.value)}
                  className={inputClass}
                />
                <button
                  onClick={saveEmail}
                  disabled={emailBusy || !email || !emailPw}
                  className="w-full px-3 py-1.5 rounded-md bg-text text-page text-xs font-semibold transition-opacity hover:opacity-85 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {emailBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Update email'}
                </button>
                {emailMsg && (
                  <p
                    className={`text-[11px] ${emailMsg.ok ? 'text-success' : 'text-danger'}`}
                    role={emailMsg.ok ? 'status' : 'alert'}
                  >
                    {emailMsg.text}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Security */}
          <section className="space-y-2.5">
            <h3 className={labelClass}>Change password</h3>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Current password"
              value={curPw}
              onChange={(e) => setCurPw(e.target.value)}
              className={inputClass}
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder="New password (min 8 characters)"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className={inputClass}
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Confirm new password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className={inputClass}
            />
            <button
              onClick={savePassword}
              disabled={pwBusy || !curPw || !newPw || !confirmPw}
              className="w-full px-3 py-1.5 rounded-md bg-text text-page text-xs font-semibold transition-opacity hover:opacity-85 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
            >
              {pwBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Update password'}
            </button>
            {pwMsg && (
              <p className={`text-[11px] ${pwMsg.ok ? 'text-success' : 'text-danger'}`} role={pwMsg.ok ? 'status' : 'alert'}>
                {pwMsg.text}
              </p>
            )}
          </section>

          {/* Data */}
          <section className="space-y-2.5 pt-4 border-t border-line">
            <h3 className={labelClass}>Data</h3>
            <button
              onClick={() => exportAppDataAsJSON(appData)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-line text-xs font-medium text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export account data
            </button>

            <div className="p-3 rounded-lg border border-danger/30 bg-danger/5">
              <p className="text-xs text-danger font-medium">Delete account</p>
              <p className="text-[11px] text-muted mt-1 leading-relaxed">
                Permanently removes your cloud data (plans, progress, streak) and sign-in. This
                cannot be undone.
              </p>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteBusy}
                className={`mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                  confirmDelete
                    ? 'border-danger bg-danger text-page'
                    : 'border-danger/40 text-danger/80 hover:text-danger hover:border-danger/60'
                }`}
              >
                {deleteBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" />
                )}
                {confirmDelete ? 'Click again to confirm' : 'Delete account'}
              </button>
              {deleteMsg && (
                <p
                  className={`text-[11px] mt-2 ${deleteMsg.ok ? 'text-success' : 'text-danger'}`}
                  role={deleteMsg.ok ? 'status' : 'alert'}
                >
                  {deleteMsg.text}
                </p>
              )}
            </div>
          </section>
            </>
          )}

          {/* Preferences — local-only settings, work even when signed out */}
          <section className="space-y-3">
            <h3 className={labelClass}>Preferences</h3>

            <div>
              <label htmlFor="settings-tz" className={labelClass}>
                Timezone <span className="text-faint normal-case">(reminder scheduling)</span>
              </label>
              <div className="relative">
                <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
                <select
                  id="settings-tz"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className={`${inputClass} pl-8 cursor-pointer`}
                >
                  <option value="">Use device timezone</option>
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz} className="bg-page">
                      {tz.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="settings-goal" className={labelClass}>
                Daily focus goal (minutes)
              </label>
              <div className="relative">
                <Target className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
                <input
                  id="settings-goal"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="e.g. 60"
                  value={dailyGoal}
                  onChange={(e) => setDailyGoal(e.target.value)}
                  className={`${inputClass} pl-8`}
                />
              </div>
              <p className="text-[11px] text-faint mt-1">
                Shows progress toward your target in the stats modal.
              </p>
            </div>

            <button
              onClick={savePrefs}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-text text-page text-xs font-semibold transition-opacity hover:opacity-85 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              Save preferences
            </button>
            {prefsMsg && <p className="text-[11px] text-success">{prefsMsg}</p>}
          </section>
        </div>
      </div>
    </div>
  );
};