/**
 * Standalone AES-256-GCM encryption/decryption using a key derived
 * from the document link password via HKDF-SHA256.
 *
 * Used to encrypt customer access logs (ip_address, user_agent) in the
 * public context where the master key is NOT available.
 *
 * To decrypt: extract the raw password from the encrypted_url
 * (which is encrypted with the master key) and use it here.
 */
import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HKDF_SALT = 'holz-erp-link-access-log'; // static salt for HKDF context binding
const HKDF_INFO = 'access-log-encryption';

export interface LinkEncryptedPayload {
  v: 1;
  iv: string;   // base64
  tag: string;  // base64
  data: string; // base64
}

/**
 * Derive a 32-byte AES key from the raw link password using HKDF-SHA256.
 */
export function deriveKeyFromPassword(rawPassword: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', rawPassword, HKDF_SALT, HKDF_INFO, 32)
  );
}

/**
 * Encrypt a plaintext string using a key derived from the link password.
 */
export function linkEncrypt(plaintext: string, rawPassword: string): string {
  const key = deriveKeyFromPassword(rawPassword);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload: LinkEncryptedPayload = {
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  };

  return JSON.stringify(payload);
}

/**
 * Decrypt a link-encrypted payload using a key derived from the link password.
 * Returns null if decryption fails (wrong password, tampered data).
 */
export function linkDecrypt(encryptedJson: string, rawPassword: string): string | null {
  try {
    const key = deriveKeyFromPassword(rawPassword);
    const payload: LinkEncryptedPayload = JSON.parse(encryptedJson);

    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const ciphertext = Buffer.from(payload.data, 'base64');

    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Extract the raw password from a decrypted document link URL.
 * URL format: https://domain/public/offer/<token>?pw=<rawPassword>
 */
export function extractPasswordFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('pw');
  } catch {
    // Fallback: regex extraction for non-standard URLs
    const match = url.match(/[?&]pw=([a-f0-9]+)/i);
    return match ? match[1] : null;
  }
}
