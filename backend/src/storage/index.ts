/** Storage package initialization. */

import { getConfig } from '../config/index.js';
import type { StorageProvider } from './StorageProvider.js';

export type { StorageProvider, StorageHealth, StorageProviderName } from './StorageProvider.js';
export { providerNameOf, assertSafeStorageKey } from './StorageProvider.js';
export { LocalStorageProvider } from './LocalStorageProvider.js';
export { SupabaseStorageProvider, isSupabaseConfigured } from './SupabaseStorageProvider.js';
export {
  validateStorageConfig,
  resolveStorageTopology,
  saveWithFallback,
  providerForRecord,
  providerNameForRecord,
  getStorageStatus,
  checkLocalDurability,
  isEphemeralLocalPath,
  isRetryableStorageError,
  isAmbiguousStorageError,
} from './resilient.js';
export type { StorageStatus, StorageTopology } from './resilient.js';

/**
 * Resolve the active storage provider after startup validation.
 *
 * - STORAGE_PROVIDER=local: local disk (durable path required in production).
 * - STORAGE_PROVIDER=supabase: Supabase when credentials verify; otherwise
 *   the explicit persistent local fallback when enabled, else a clear error.
 * Never silently falls back to ephemeral storage.
 */
export async function getStorageProvider(): Promise<StorageProvider> {
  const { resolveStorageTopology } = await import('./resilient.js');
  const topology = await resolveStorageTopology();
  return topology.active;
}

/** Re-export config type for callers that branch on provider names. */
export function getConfiguredProviderName(): string {
  return getConfig().STORAGE_PROVIDER;
}
