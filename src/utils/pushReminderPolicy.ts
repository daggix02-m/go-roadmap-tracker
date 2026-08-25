/**
 * pushReminderPolicy — pure decision logic for the push-reminder feature.
 *
 * Extracted from the React components so the behavior can be unit-tested
 * without a browser. The components (NotificationBanner, usePushSubscription)
 * call these functions; the tests here are the specification.
 */

export interface BannerButtonState {
  /** Signed out — prompt to sign in (reminders require a server session). */
  showSignInButton: boolean;
  showEnableButton: boolean;
  showTestButton: boolean;
  showTurnOffButton: boolean;
  showRepairButton: boolean;
  showInstallPrompt: boolean;
}

/**
 * Decide which buttons the reminder banner shows for the current state.
 *
 * Priority: iOS install prompt > sign-in gate > permission > enabled state.
 *
 * The sign-in gate exists because reminders are stored server-side and
 * delivered by the Convex cron — calling `reminders:subscribe` without a
 * session throws "Not authenticated". Gating the button (rather than showing
 * an Enable button that always fails) prevents that broken path.
 */
export function decideBannerButtons(options: {
  permission: NotificationPermission;
  dailyReminderEnabled: boolean;
  needsInstall: boolean;
  serverBroken: boolean;
  pushSupported: boolean;
  isAuthenticated: boolean;
  authLoading: boolean;
}): BannerButtonState {
  if (options.needsInstall) {
    return {
      showSignInButton: false,
      showEnableButton: false,
      showTestButton: false,
      showTurnOffButton: false,
      showRepairButton: false,
      showInstallPrompt: true
    };
  }

  // While auth is still booting we don't know the session state — show
  // nothing actionable to avoid flashing the sign-in CTA at signed-in users.
  if (options.authLoading) {
    return {
      showSignInButton: false,
      showEnableButton: false,
      showTestButton: false,
      showTurnOffButton: false,
      showRepairButton: false,
      showInstallPrompt: false
    };
  }

  // Signed out → sign in first. Takes priority over enabled state because
  // turning off (unsubscribe) is also a server mutation.
  if (!options.isAuthenticated) {
    return {
      showSignInButton: true,
      showEnableButton: false,
      showTestButton: false,
      showTurnOffButton: false,
      showRepairButton: false,
      showInstallPrompt: false
    };
  }

  if (options.permission !== 'granted') {
    return {
      showSignInButton: false,
      showEnableButton: true,
      showTestButton: false,
      showTurnOffButton: false,
      showRepairButton: false,
      showInstallPrompt: false
    };
  }

  if (options.dailyReminderEnabled) {
    return {
      showSignInButton: false,
      showEnableButton: false,
      showTestButton: true,
      showTurnOffButton: true,
      showRepairButton: options.serverBroken,
      showInstallPrompt: false
    };
  }

  return {
    showSignInButton: false,
    showEnableButton: true,
    showTestButton: false,
    showTurnOffButton: false,
    showRepairButton: false,
    showInstallPrompt: false
  };
}

export type SubscribeErrorType = 'none' | 'auth' | 'other';

export interface SubscribeOutcome {
  /** Whether the local UI should report the device as subscribed. */
  subscribed: boolean;
  /** Whether to unsubscribe the just-created browser subscription. */
  rollbackBrowser: boolean;
  /** Failure classification when the server mutation fails. */
  errorType: SubscribeErrorType;
}

/**
 * Decide what happened after `PushManager.subscribe()` succeeded and the
 * server-side `reminders:subscribe` mutation ran.
 *
 * If the mutation fails, the browser subscription is real but the server has
 * no record of it. Leaving it behind drifts browser and server state: on the
 * next page load `getSubscription()` returns it and the UI flips to
 * "enabled" with no server-side schedule. Roll it back instead.
 */
export function decideSubscribeOutcome(options: {
  browserSubscriptionCreated: boolean;
  serverMutationOk: boolean;
  authError: boolean;
}): SubscribeOutcome {
  if (options.serverMutationOk) {
    return { subscribed: true, rollbackBrowser: false, errorType: 'none' };
  }

  return {
    subscribed: false,
    rollbackBrowser: options.browserSubscriptionCreated,
    errorType: options.authError ? 'auth' : 'other'
  };
}
