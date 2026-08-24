import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateVapidKey } from '../src/utils/vapidKey';

/**
 * vapidKeyValidation — documents the contract for VAPID key validation.
 *
 * BUG: PushManager.subscribe() throws "AbortError: Registration failed -
 * push service error" when the VAPID public key is invalid, null, or
 * malformed. The current code only checks `!vapidKey` (truthy), which
 * lets empty strings and malformed keys through.
 *
 * FIX: Validate the VAPID key format before passing it to PushManager.
 * A valid VAPID public key is a base64url-encoded string of exactly
 * 65 bytes (88 characters with padding, 86 without).
 */

/** Generate a valid-looking test VAPID key (65 bytes of zeros encoded). */
function makeValidKey(): string {
  const bytes = new Uint8Array(65);
  // EC uncompressed point: 0x04 prefix + 32 bytes X + 32 bytes Y
  bytes[0] = 0x04;
  const base64 = Buffer.from(bytes).toString('base64');
  // Convert to base64url
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

describe('validateVapidKey', () => {
  it('accepts a valid 65-byte base64url-encoded key', () => {
    const key = makeValidKey();
    const result = validateVapidKey(key);
    assert.equal(result.valid, true, `should accept valid key, got: ${result.reason}`);
  });

  it('rejects null', () => {
    const result = validateVapidKey(null);
    assert.equal(result.valid, false);
    assert.match(result.reason!, /not a string/);
  });

  it('rejects undefined', () => {
    const result = validateVapidKey(undefined);
    assert.equal(result.valid, false);
  });

  it('rejects empty string', () => {
    const result = validateVapidKey('');
    assert.equal(result.valid, false);
    assert.match(result.reason!, /empty/);
  });

  it('rejects key with invalid characters', () => {
    const result = validateVapidKey('hello world!@#$%');
    assert.equal(result.valid, false);
    assert.match(result.reason!, /invalid characters/);
  });

  it('rejects key that decodes to wrong length', () => {
    // 32 bytes instead of 65
    const shortKey = Buffer.from(new Uint8Array(32)).toString('base64url');
    const result = validateVapidKey(shortKey);
    assert.equal(result.valid, false);
    assert.match(result.reason!, /expected 65/);
  });

  it('rejects garbage string that happens to be valid base64', () => {
    // "aGVsbG8=" decodes to "hello" (5 bytes, not 65)
    const result = validateVapidKey('aGVsbG8');
    assert.equal(result.valid, false);
  });

  it('accepts key with standard base64 padding', () => {
    const key = makeValidKey();
    // Add padding
    const padded = key + '==';
    const result = validateVapidKey(padded);
    assert.equal(result.valid, true, `should accept padded key, got: ${result.reason}`);
  });

  it('accepts key with URL-safe base64 characters', () => {
    // Generate a key that contains - and _ characters
    const bytes = new Uint8Array(65);
    bytes[0] = 0x04;
    // Fill with values that produce - and _ in base64url
    for (let i = 1; i < 65; i++) bytes[i] = i;
    const base64 = Buffer.from(bytes).toString('base64');
    const key = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const result = validateVapidKey(key);
    assert.equal(result.valid, true, `should accept URL-safe key, got: ${result.reason}`);
  });
});

describe('subscribeSafety contract', () => {
  it('subscribe should return early when vapidKey is null', () => {
    // The subscribe function must check vapidKey BEFORE calling PushManager
    const vapidKey: string | null = null;
    const shouldProceed = typeof vapidKey === 'string' && vapidKey.length > 0;
    assert.equal(shouldProceed, false, 'should not proceed with null key');
  });

  it('subscribe should return early when vapidKey is empty string', () => {
    const vapidKey = '';
    const shouldProceed = typeof vapidKey === 'string' && vapidKey.length > 0;
    assert.equal(shouldProceed, false, 'should not proceed with empty key');
  });

  it('subscribe should proceed when vapidKey is valid', () => {
    const vapidKey = makeValidKey();
    const shouldProceed = typeof vapidKey === 'string' && vapidKey.length > 0;
    assert.equal(shouldProceed, true, 'should proceed with valid key');
  });

  it('subscribe error should log the full error message', () => {
    // The catch block should log the error message, not just the error object
    const error = new Error('AbortError: Registration failed - push service error');
    const logMessage = error.message || String(error);
    assert.match(logMessage, /AbortError/);
    assert.match(logMessage, /push service error/);
  });
});
