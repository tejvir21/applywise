/** Storage provider abstraction for resume files. */

import { Readable } from 'stream';

export type StorageProviderName = 'local' | 'supabase';

export interface StorageHealth {
  healthy: boolean;
  /** True only when the provider is backed by durable storage. */
  durable: boolean;
  /** Machine-readable reason; never contains secrets, URLs, or paths. */
  reason?: string;
}

export interface StorageProvider {
  /**
   * Provider identifier. Optional for backward compatibility with test
   * doubles; helpers default a missing name to 'local'.
   */
  readonly name?: StorageProviderName;
  save(key: string, data: Buffer | Readable, contentType: string): Promise<void>;
  get(key: string): Promise<Readable | NodeJS.ReadableStream | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /**
   * Direct URLs are disabled for private resumes. Implementations must NOT
   * return permanent public URLs, signed URLs, or filesystem paths. The
   * authenticated download route streams bytes instead.
   */
  getUrl(key: string): Promise<string>;
  healthCheck?(): Promise<StorageHealth>;
}

/** Best-effort provider name for current and legacy test doubles. */
export function providerNameOf(provider: StorageProvider | undefined): StorageProviderName {
  if (provider?.name === 'supabase' || provider?.name === 'local') return provider.name;
  return 'local';
}

/**
 * Server-controlled storage keys only. Allowed shape:
 * `<userId>/<opaque><.pdf|.docx>`. Rejects traversal, absolute paths,
 * separators beyond the single prefix slash, and bucket/object injection.
 */
const SAFE_KEY_RE = /^[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,128}\.(pdf|docx)$/;

export function assertSafeStorageKey(key: string): void {
  if (typeof key !== 'string' || key.length === 0 || key.length > 256) {
    throw new Error('Invalid storage key');
  }
  if (
    key.includes('..') ||
    key.includes('\\') ||
    key.startsWith('/') ||
    key.includes(':') ||
    key.includes('\0')
  ) {
    throw new Error('Invalid storage key');
  }
  if (!SAFE_KEY_RE.test(key)) {
    throw new Error('Invalid storage key');
  }
}
