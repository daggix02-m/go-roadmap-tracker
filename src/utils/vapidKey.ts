/**
 * vapidKey — validation and diagnostics for VAPID public keys.
 *
 * A valid VAPID public key is a base64url-encoded string of exactly
 * 65 bytes (the uncompressed EC public key point). Invalid keys cause
 * PushManager.subscribe() to throw "AbortError: Registration failed -
 * push service error" with no useful detail.
 */

export interface VapidKeyValidation {
  valid: boolean;
  reason?: string;
}

/**
 * Validate a VAPID public key for use with PushManager.subscribe().
 *
 * A valid VAPID public key is:
 * - A non-empty string
 * - Base64url-encoded (A-Z, a-z, 0-9, -, _, with optional = padding)
 * - Decodes to exactly 65 bytes (uncompressed EC public key)
 */
export function validateVapidKey(key: unknown): VapidKeyValidation {
  if (typeof key !== 'string') {
    return { valid: false, reason: 'VAPID key is not a string (server may not have VAPID_PUBLIC_KEY set)' };
  }

  if (key.length === 0) {
    return { valid: false, reason: 'VAPID key is empty (server may not have VAPID_PUBLIC_KEY set)' };
  }

  // Base64url characters: A-Z, a-z, 0-9, -, _
  // Also allow = padding (standard base64)
  if (!/^[A-Za-z0-9_-]+=*$/.test(key)) {
    return { valid: false, reason: 'VAPID key contains invalid characters — regenerate with: npx web-push generate-vapid-keys' };
  }

  // Decode and check length
  try {
    const stripped = key.replace(/=/g, '');
    const base64 = stripped.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(padded);

    if (decoded.length !== 65) {
      return {
        valid: false,
        reason: `VAPID key decodes to ${decoded.length} bytes, expected 65 — regenerate with: npx web-push generate-vapid-keys`
      };
    }
  } catch {
    return {
      valid: false,
      reason: 'VAPID key is not valid base64 — regenerate with: npx web-push generate-vapid-keys'
    };
  }

  return { valid: true };
}
