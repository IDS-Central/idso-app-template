// SECRETS: Google Secret Manager client with in-memory caching.
//
// In production (Cloud Run), secrets are fetched from Google Secret Manager.
// In local development (NODE_ENV=development), secrets fall back to process.env
// so you can use a .env file without needing Secret Manager access.
//
// Cache TTL is 5 minutes — secrets are re-fetched after expiry to pick up rotations.

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const PROJECT_ID = process.env.GCP_PROJECT_ID || 'central-workspace';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const IS_DEV = process.env.NODE_ENV === 'development';

interface CacheEntry {
  value: string;
  expiresAt: number;
}

// In-memory cache keyed by secret name
const cache = new Map<string, CacheEntry>();

// Lazy-initialized client — only created when first needed
let _client: SecretManagerServiceClient | null = null;

function getClient(): SecretManagerServiceClient {
  if (!_client) {
    _client = new SecretManagerServiceClient();
  }
  return _client;
}

/**
 * Retrieve a secret value by name.
 *
 * Checks the in-memory cache first (TTL: 5 min). On miss, fetches from
 * Secret Manager in production or falls back to process.env in development.
 *
 * @param secretName - The secret name in Secret Manager (e.g., "my-app-db-url")
 * @param envFallback - Optional env var name to check in dev mode (defaults to secretName uppercased with hyphens replaced by underscores)
 */
export async function getSecret(secretName: string, envFallback?: string): Promise<string> {
  // Check cache first
  const cached = cache.get(secretName);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  // In development, fall back to environment variables
  if (IS_DEV) {
    const envKey = envFallback || secretName.toUpperCase().replace(/-/g, '_');
    const value = process.env[envKey];
    if (value) {
      cache.set(secretName, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return value;
    }
    throw new Error(
      `Secret "${secretName}" not found. In development, set the ${envKey} environment variable in your .env file.`
    );
  }

  // Production: fetch from Secret Manager
  const client = getClient();
  const name = `projects/${PROJECT_ID}/secrets/${secretName}/versions/latest`;

  const [version] = await client.accessSecretVersion({ name });
  const value = version.payload?.data?.toString();

  if (!value) {
    throw new Error(`Secret "${secretName}" exists but has no data.`);
  }

  cache.set(secretName, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/**
 * Clear the secrets cache. Useful for testing or forcing a refresh.
 */
export function clearSecretsCache(): void {
  cache.clear();
}
