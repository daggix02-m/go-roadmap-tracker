import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * notificationBanner — documents the expected rendering logic for the
 * reminder banner's buttons.
 *
 * BUG: The banner shows "Test" and "Turn off" buttons whenever
 * `permission === 'granted'`, regardless of `dailyReminderEnabled`.
 * After clicking "Turn off", `dailyReminderEnabled` becomes false but
 * the buttons don't change — making it look like nothing happened.
 *
 * FIX: When `dailyReminderEnabled` is false and permission is granted,
 * show an "Enable reminders" button instead of "Turn off".
 */

interface BannerButtonState {
  showEnableButton: boolean;
  showTestButton: boolean;
  showTurnOffButton: boolean;
  showRepairButton: boolean;
  showInstallPrompt: boolean;
}

function decideBannerButtons(options: {
  permission: NotificationPermission;
  dailyReminderEnabled: boolean;
  needsInstall: boolean;
  serverBroken: boolean;
  pushSupported: boolean;
}): BannerButtonState {
  if (options.needsInstall) {
    return {
      showEnableButton: false,
      showTestButton: false,
      showTurnOffButton: false,
      showRepairButton: false,
      showInstallPrompt: true
    };
  }

  if (options.permission !== 'granted') {
    return {
      showEnableButton: true,
      showTestButton: false,
      showTurnOffButton: false,
      showRepairButton: false,
      showInstallPrompt: false
    };
  }

  // permission === 'granted'
  // FIX: Only show Test + Turn off when dailyReminderEnabled is also true.
  if (options.dailyReminderEnabled) {
    return {
      showEnableButton: false,
      showTestButton: true,
      showTurnOffButton: true,
      showRepairButton: options.serverBroken,
      showInstallPrompt: false
    };
  }

  // Permission granted but reminders disabled — show Enable button
  return {
    showEnableButton: true,
    showTestButton: false,
    showTurnOffButton: false,
    showRepairButton: false,
    showInstallPrompt: false
  };
}

describe('decideBannerButtons', () => {
  it('shows Enable button when permission is not granted', () => {
    const state = decideBannerButtons({
      permission: 'default',
      dailyReminderEnabled: false,
      needsInstall: false,
      serverBroken: false,
      pushSupported: true
    });

    assert.equal(state.showEnableButton, true, 'should show Enable reminders button');
    assert.equal(state.showTestButton, false);
    assert.equal(state.showTurnOffButton, false);
  });

  it('shows Test and Turn off when reminders are enabled and permission granted', () => {
    const state = decideBannerButtons({
      permission: 'granted',
      dailyReminderEnabled: true,
      needsInstall: false,
      serverBroken: false,
      pushSupported: true
    });

    assert.equal(state.showEnableButton, false);
    assert.equal(state.showTestButton, true, 'should show Test button');
    assert.equal(state.showTurnOffButton, true, 'should show Turn off button');
  });

  it('shows Enable button when permission granted but reminders disabled', () => {
    const state = decideBannerButtons({
      permission: 'granted',
      dailyReminderEnabled: false,
      needsInstall: false,
      serverBroken: false,
      pushSupported: true
    });

    // BUG: Current code shows Test + Turn off here because permission is granted.
    // FIX: Should show Enable button because dailyReminderEnabled is false.
    assert.equal(state.showEnableButton, true, 'MUST show Enable button when reminders are disabled');
    assert.equal(state.showTestButton, false, 'should NOT show Test when reminders are disabled');
    assert.equal(state.showTurnOffButton, false, 'should NOT show Turn off when reminders are disabled');
  });

  it('shows install prompt on iOS when not installed as PWA', () => {
    const state = decideBannerButtons({
      permission: 'default',
      dailyReminderEnabled: false,
      needsInstall: true,
      serverBroken: false,
      pushSupported: false
    });

    assert.equal(state.showInstallPrompt, true);
    assert.equal(state.showEnableButton, false);
  });

  it('shows repair button when server reports broken delivery', () => {
    const state = decideBannerButtons({
      permission: 'granted',
      dailyReminderEnabled: true,
      needsInstall: false,
      serverBroken: true,
      pushSupported: true
    });

    assert.equal(state.showRepairButton, true, 'should show repair button when server is broken');
    assert.equal(state.showTurnOffButton, true);
  });
});
