import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decideBannerButtons } from '../src/utils/pushReminderPolicy';

/**
 * notificationBanner — documents the expected rendering logic for the
 * reminder banner's buttons.
 *
 * BUG: The banner shows "Test" and "Turn off" buttons whenever
 * `permission === 'granted'`, regardless of `dailyReminderEnabled`.
 * After clicking "Turn off", `dailyReminderEnabled` becomes false but
 * the buttons don't change — making it look like nothing happened.
 *
 * FIX 1: When `dailyReminderEnabled` is false and permission is granted,
 * show an "Enable reminders" button instead of "Turn off".
 *
 * BUG 2: The "Enable reminders" button calls `reminders:subscribe`, a
 * server mutation, even when the user has no valid session. The mutation
 * then throws "Not authenticated" and leaves the browser push subscription
 * orphaned.
 *
 * FIX 2: Reminders are stored server-side and delivered by the cron, so
 * they require a signed-in session. When signed out, show a "Sign in to
 * sync reminders" CTA instead of "Enable reminders".
 */

describe('decideBannerButtons', () => {
  it('shows the sign-in CTA instead of Enable when signed out', () => {
    const state = decideBannerButtons({
      permission: 'granted',
      dailyReminderEnabled: false,
      needsInstall: false,
      serverBroken: false,
      pushSupported: true,
      isAuthenticated: false,
      authLoading: false
    });

    assert.equal(state.showSignInButton, true, 'signed-out users must be prompted to sign in');
    assert.equal(
      state.showEnableButton,
      false,
      'MUST NOT show Enable — it would call a server mutation with no session'
    );
  });

  it('does not show the sign-in CTA while auth is still loading', () => {
    const state = decideBannerButtons({
      permission: 'granted',
      dailyReminderEnabled: false,
      needsInstall: false,
      serverBroken: false,
      pushSupported: true,
      isAuthenticated: false,
      authLoading: true
    });

    assert.equal(state.showSignInButton, false, 'avoid flashing the CTA during auth boot');
    assert.equal(state.showEnableButton, false);
  });

  it('sign-in gate takes priority over an enabled reminder state', () => {
    const state = decideBannerButtons({
      permission: 'granted',
      dailyReminderEnabled: true,
      needsInstall: false,
      serverBroken: false,
      pushSupported: true,
      isAuthenticated: false,
      authLoading: false
    });

    assert.equal(state.showSignInButton, true);
    assert.equal(state.showTurnOffButton, false, 'turning off also requires a session');
  });

  it('shows Enable button when authenticated and permission is not granted', () => {
    const state = decideBannerButtons({
      permission: 'default',
      dailyReminderEnabled: false,
      needsInstall: false,
      serverBroken: false,
      pushSupported: true,
      isAuthenticated: true,
      authLoading: false
    });

    assert.equal(state.showEnableButton, true, 'should show Enable reminders button');
    assert.equal(state.showTestButton, false);
    assert.equal(state.showTurnOffButton, false);
    assert.equal(state.showSignInButton, false);
  });

  it('shows Test and Turn off when authenticated, granted, and enabled', () => {
    const state = decideBannerButtons({
      permission: 'granted',
      dailyReminderEnabled: true,
      needsInstall: false,
      serverBroken: false,
      pushSupported: true,
      isAuthenticated: true,
      authLoading: false
    });

    assert.equal(state.showEnableButton, false);
    assert.equal(state.showTestButton, true, 'should show Test button');
    assert.equal(state.showTurnOffButton, true, 'should show Turn off button');
    assert.equal(state.showSignInButton, false);
  });

  it('shows Enable button when authenticated, granted, but reminders disabled', () => {
    const state = decideBannerButtons({
      permission: 'granted',
      dailyReminderEnabled: false,
      needsInstall: false,
      serverBroken: false,
      pushSupported: true,
      isAuthenticated: true,
      authLoading: false
    });

    assert.equal(state.showEnableButton, true, 'MUST show Enable button when reminders are disabled');
    assert.equal(state.showTestButton, false, 'should NOT show Test when reminders are disabled');
    assert.equal(state.showTurnOffButton, false, 'should NOT show Turn off when reminders are disabled');
  });

  it('shows install prompt on iOS when not installed as PWA, ahead of the auth gate', () => {
    const state = decideBannerButtons({
      permission: 'default',
      dailyReminderEnabled: false,
      needsInstall: true,
      serverBroken: false,
      pushSupported: false,
      isAuthenticated: false,
      authLoading: false
    });

    assert.equal(state.showInstallPrompt, true);
    assert.equal(state.showEnableButton, false);
    assert.equal(state.showSignInButton, false);
  });

  it('shows repair button when server reports broken delivery', () => {
    const state = decideBannerButtons({
      permission: 'granted',
      dailyReminderEnabled: true,
      needsInstall: false,
      serverBroken: true,
      pushSupported: true,
      isAuthenticated: true,
      authLoading: false
    });

    assert.equal(state.showRepairButton, true, 'should show repair button when server is broken');
    assert.equal(state.showTurnOffButton, true);
    assert.equal(state.showSignInButton, false);
  });
});
