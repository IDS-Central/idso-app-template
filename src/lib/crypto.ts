// CRYPTO: AES-256-GCM field-level encryption for sensitive data.
//
// Use this for encrypting individual database fields that contain PII or secrets
// (e.g., SSNs, credentials, API keys stored in the database).
//
// The encryption key is read from the ENCRYPTION_KEY environment variable.
// In production, this should be populated from Secret Manager.
//
// Encrypted values are stored as a single string: "iv:authTag:ciphertext" (all hex-encoded).
// This makes them safe to store in any text/varchar column.
//
// Usage:
//   import { encryptField, decryptField } from '@/lib/crypto';
//   const encrypted = encryptField('sensitive-data');
//   const original = decryptField(encrypted);

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'FATAL: ENCRYPTION_KEY environment variable is required. ' +
      'Generate one with: python3 -c "import secrets; print(secrets.token_hex(32))"'
    );
  }
  // If the key is a hex string (64 chars = 32 bytes), decode it directly.
  // Otherwise, derive a 32-byte key via SHA-256.
  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    return Buffer.from(key, 'hex');
  }
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt a plaintext string for storage in a database field.
 * Returns a string in the format "iv:authTag:ciphertext" (hex-encoded).
 */
export function encryptField(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a field value that was encrypted with encryptField().
 * Expects input in the format "iv:authTag:ciphertext" (hex-encoded).
 */
export function decryptField(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted field format. Expected "iv:authTag:ciphertext".');
  }

  const [ivHex, tagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
  }
  if (authTag.length !== TAG_LENGTH) {
    throw new Error(`Invalid auth tag length: expected ${TAG_LENGTH}, got ${authTag.length}`);
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}
