// SESSION: Cookie-based session management using AES-256-GCM encryption.
//
// Two decryption paths exist:
//   - Node.js crypto: used by route handlers (getSession, setSession, buildSessionCookie)
//   - Web Crypto API: used by middleware (getSessionFromRequest) because
//     Next.js middleware runs in the Edge Runtime which lacks Node.js crypto.
//
// Cookie format: base64(iv + authTag + ciphertext)
// Cookie name: idso_session
// Default session lifetime: 8 hours (configurable via SESSION_LIFETIME_HOURS)

import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

interface SessionData {
  email: string;
  name: string | null;
  picture: string | null;
  hd: string | null;
  loggedInAt: number;
}

const SESSION_COOKIE_NAME = 'idso_session';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

// --- Node.js crypto helpers (for route handlers) ---

function getSecretKey(): Buffer {
  const secret = process.env.SECRET_KEY;
  if (!secret) {
    throw new Error(
      'FATAL: SECRET_KEY environment variable is required. ' +
      'Generate one with: python3 -c "import secrets; print(secrets.token_hex(32))"'
    );
  }
  // Derive a 32-byte key from the secret using SHA-256
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(data: string): string {
  const key = getSecretKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64(iv + tag + encrypted)
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(encoded: string): string {
  const key = getSecretKey();
  const buffer = Buffer.from(encoded, 'base64');
  const iv = buffer.subarray(0, IV_LENGTH);
  const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

// --- Web Crypto API helpers (for Edge Runtime / middleware) ---

async function getSecretKeyWebCrypto(): Promise<CryptoKey> {
  const secret = process.env.SECRET_KEY;
  if (!secret) {
    throw new Error('FATAL: SECRET_KEY environment variable is required.');
  }
  // Derive the same 32-byte key via SHA-256, matching the Node.js path
  const encoded = new TextEncoder().encode(secret);
  const hash = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return globalThis.crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
}

async function decryptWebCrypto(encoded: string): Promise<string> {
  const key = await getSecretKeyWebCrypto();
  // Decode base64 to Uint8Array
  const binaryStr = atob(encoded);
  const buffer = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    buffer[i] = binaryStr.charCodeAt(i);
  }
  const iv = buffer.slice(0, IV_LENGTH);
  const tag = buffer.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buffer.slice(IV_LENGTH + TAG_LENGTH);
  // Web Crypto expects ciphertext + tag concatenated
  const ciphertextWithTag = new Uint8Array(encrypted.length + TAG_LENGTH);
  ciphertextWithTag.set(encrypted);
  ciphertextWithTag.set(tag, encrypted.length);
  const decrypted = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: TAG_LENGTH * 8 },
    key,
    ciphertextWithTag
  );
  return new TextDecoder().decode(decrypted);
}

// --- Shared helpers ---

function getSessionLifetimeMs(): number {
  const hours = parseInt(process.env.SESSION_LIFETIME_HOURS || '8', 10);
  return hours * 60 * 60 * 1000;
}

/**
 * Set the session cookie via the Next.js cookies() API.
 * Use in route handlers where cookies() is available.
 */
export async function setSession(data: SessionData): Promise<void> {
  const cookieStore = await cookies();
  const encrypted = encrypt(JSON.stringify(data));
  const lifetimeMs = getSessionLifetimeMs();

  cookieStore.set(SESSION_COOKIE_NAME, encrypted, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: Math.floor(lifetimeMs / 1000),
    path: '/',
  });
}

/**
 * Build session cookie parameters for setting on a NextResponse directly.
 * Use when returning a NextResponse (e.g., redirect) so the cookie
 * is attached to that response instead of the implicit cookies() store.
 */
export function buildSessionCookie(data: SessionData): {
  name: string;
  value: string;
  options: { httpOnly: boolean; secure: boolean; sameSite: 'lax'; maxAge: number; path: string };
} {
  const encrypted = encrypt(JSON.stringify(data));
  const lifetimeMs = getSessionLifetimeMs();
  return {
    name: SESSION_COOKIE_NAME,
    value: encrypted,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: Math.floor(lifetimeMs / 1000),
      path: '/',
    },
  };
}

/**
 * Read the current session from cookies (Node.js context).
 * Returns null if no session exists, is expired, or is corrupted.
 */
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (!cookie?.value) return null;

  try {
    const data = JSON.parse(decrypt(cookie.value)) as SessionData;
    const lifetimeMs = getSessionLifetimeMs();
    if (Date.now() - data.loggedInAt > lifetimeMs) {
      await clearSession();
      return null;
    }
    return data;
  } catch {
    // Invalid or tampered cookie
    return null;
  }
}

/**
 * Clear the session by deleting the cookie.
 */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Read session from a NextRequest (for use in middleware).
 * Uses Web Crypto API since middleware runs in the Edge Runtime.
 */
export async function getSessionFromRequest(request: NextRequest): Promise<SessionData | null> {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (!cookie?.value) return null;

  try {
    const decrypted = await decryptWebCrypto(cookie.value);
    const data = JSON.parse(decrypted) as SessionData;
    const lifetimeMs = getSessionLifetimeMs();
    if (Date.now() - data.loggedInAt > lifetimeMs) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}
