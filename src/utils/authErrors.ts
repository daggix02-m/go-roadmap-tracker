/**
 * Translate raw Convex/@convex-dev/auth error strings into user-friendly
 * copy.
 *
 * The auth backend reports failures as bare error codes (e.g. the Password
 * provider throws `new Error("InvalidAccountId")` from `retrieveAccount`).
 * Leaking those to the UI is ugly and confusing, so map the known codes here
 * and keep app-thrown messages (validation copy) untouched.
 */
export function authErrorMessage(msg: string): string {
  const lower = msg.toLowerCase();

  // `retrieveAccount` returns this when no authAccounts row matches the
  // given email for the password provider (wrong email, deleted account, or
  // the email was changed away via "Change email").
  if (lower.includes('invalidaccountid')) {
    return 'No account found with this email.';
  }

  // Brute-force protection configured in convex/auth.ts (10/hour/account).
  if (lower.includes('toomanyfailedattempts')) {
    return 'Too many failed attempts. Please try again in about an hour.';
  }

  // Wrong password (Password provider throws `InvalidSecret`; sign-in also
  // surfaces "Invalid credentials").
  if (
    lower.includes('invalidsecret') ||
    lower.includes('invalid credentials') ||
    lower.includes('invalid password')
  ) {
    return 'Invalid email or password.';
  }

  // Stored token the backend can't verify — usually an expired or
  // invalidated session, not a real action failure.
  if (
    lower.includes('not authenticated') ||
    lower.includes('failed to authenticate') ||
    lower.includes('no auth provider found')
  ) {
    return 'Session expired — please sign in again.';
  }

  return msg;
}