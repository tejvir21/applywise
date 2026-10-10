/** Supabase Storage provider for resume files (private bucket, server-side only). */

import { Readable } from 'stream';
import type { StorageHealth, StorageProvider, StorageProviderName } from './StorageProvider.js';
import { assertSafeStorageKey } from './StorageProvider.js';
import { getConfig } from '../config/index.js';

/**
 * Uses the Supabase Storage REST API directly (no extra dependency).
 * The service-role key stays server-side: it is only sent as an
 * Authorization header from this backend process, never logged, never
 * returned to clients, and never embedded in URLs. The bucket must stay
 * private: this provider never uses /object/public/ and never mints signed
 * or public URLs. Downloads stream through the authenticated API route.
 */

const BUCKET_RE = /^[a-z0-9][a-z0-9-_]{0,62}$/;

export function isSupabaseConfigured(): boolean {
  const config = getConfig();
  return Boolean(
    config.SUPABASE_URL &&
      config.SUPABASE_SERVICE_ROLE_KEY &&
      config.SUPABASE_SERVICE_ROLE_KEY.length >= 32 &&
      !config.SUPABASE_SERVICE_ROLE_KEY.includes('change-me'),
  );
}

export function assertSupabaseConfigured(): { url: string; bucket: string } {
  const config = getConfig();
  const url = (config.SUPABASE_URL ?? '').trim();
  const key = (config.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  const bucket = (config.SUPABASE_RESUME_BUCKET ?? '').trim();
  if (!url) throw new Error('Supabase is not configured: SUPABASE_URL is missing');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Supabase is not configured: SUPABASE_URL is not a valid URL');
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
    throw new Error('Supabase is not configured: SUPABASE_URL must use https');
  }
  if (!key || key.length < 32 || key.includes('change-me')) {
    throw new Error('Supabase is not configured: SUPABASE_SERVICE_ROLE_KEY is missing or invalid');
  }
  if (!bucket || !BUCKET_RE.test(bucket)) {
    throw new Error('Supabase is not configured: SUPABASE_RESUME_BUCKET is missing or invalid');
  }
  return { url: url.replace(/\/+$/, ''), bucket };
}

function transientError(message: string, opts: { ambiguous?: boolean; status?: number } = {}): Error & { retryable: boolean; ambiguous?: boolean; status?: number } {
  const err = new Error(message) as Error & { retryable: boolean; ambiguous?: boolean; status?: number };
  err.retryable = true;
  if (opts.ambiguous) err.ambiguous = true;
  if (opts.status !== undefined) err.status = opts.status;
  return err;
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SupabaseStorageProvider implements StorageProvider {
  readonly name: StorageProviderName = 'supabase';
  private url: string;
  private bucket: string;
  private timeoutMs: number;
  private maxRetries: number;
  private fetchImpl: typeof fetch;

  constructor(fetchImpl?: typeof fetch) {
    const config = getConfig();
    const { url, bucket } = assertSupabaseConfigured();
    this.url = url;
    this.bucket = bucket;
    this.timeoutMs = config.SUPABASE_TIMEOUT_MS;
    this.maxRetries = config.SUPABASE_MAX_RETRIES;
    this.fetchImpl = fetchImpl ?? fetch;
  }

  /** Service-role key is read fresh per request so tests can stub env safely. */
  private serviceKey(): string {
    return (getConfig().SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  }

  private objectUrl(key: string): string {
    assertSafeStorageKey(key);
    const encoded = key.split('/').map(encodeURIComponent).join('/');
    return `${this.url}/storage/v1/object/${encodeURIComponent(this.bucket)}/${encoded}`;
  }

  private async request(path: string, init: RequestInit, attemptLabel: string): Promise<Response> {
    const key = this.serviceKey();
    let lastError: unknown = null;
    const attempts = this.maxRetries + 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(path, {
          ...init,
          signal: controller.signal,
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            ...(init.headers as Record<string, string> | undefined),
          },
        });
        clearTimeout(timer);
        if (isTransientStatus(res.status) && attempt < attempts) {
          await res.arrayBuffer().catch(() => undefined);
          lastError = transientError(`Supabase ${attemptLabel} transient status ${res.status}`, { status: res.status });
          await sleep(100 * attempt);
          continue;
        }
        return res;
      } catch (err) {
        clearTimeout(timer);
        const aborted = err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'));
        const network = err instanceof TypeError || (err instanceof Error && /fetch|network|ECONN|socket/i.test(err.message));
        if ((aborted || network) && attempt < attempts) {
          lastError = transientError(`Supabase ${attemptLabel} ${aborted ? 'timed out' : 'network error'} (attempt ${attempt}/${attempts})`, {
            ambiguous: attemptLabel === 'upload',
          });
          await sleep(100 * attempt);
          continue;
        }
        if (aborted) {
          throw transientError(`Supabase ${attemptLabel} timed out after ${this.timeoutMs}ms`, { ambiguous: attemptLabel === 'upload' });
        }
        throw err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`Supabase ${attemptLabel} failed`);
  }

  async save(key: string, data: Buffer | Readable, contentType: string): Promise<void> {
    assertSafeStorageKey(key);
    const buffer = Buffer.isBuffer(data) ? data : await streamToBuffer(data as NodeJS.ReadableStream);
    const res = await this.request(
      this.objectUrl(key),
      {
        method: 'POST',
        headers: {
          'Content-Type': contentType || 'application/octet-stream',
          'x-upsert': 'false',
        },
        body: buffer as unknown as Uint8Array,
      },
      'upload',
    );
    if (res.ok) {
      await res.arrayBuffer().catch(() => undefined);
      return;
    }
    if (res.status === 404) {
      throw new Error('Supabase bucket not found; check SUPABASE_RESUME_BUCKET and that the bucket exists and is private');
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error('Supabase upload unauthorized; check SUPABASE_SERVICE_ROLE_KEY (server-side only)');
    }
    if (res.status === 409) {
      // x-upsert=false conflict: object already exists. Do not overwrite or
      // duplicate; the caller treats the existing object as the stored file.
      await res.arrayBuffer().catch(() => undefined);
      return;
    }
    if (isTransientStatus(res.status)) {
      throw transientError(`Supabase upload transient status ${res.status}`, { ambiguous: true, status: res.status });
    }
    throw new Error(`Supabase upload failed with status ${res.status}`);
  }

  async get(key: string): Promise<NodeJS.ReadableStream | null> {
    const res = await this.request(this.objectUrl(key), { method: 'GET' }, 'download');
    if (res.status === 404) {
      await res.arrayBuffer().catch(() => undefined);
      return null;
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error('Supabase download unauthorized; check SUPABASE_SERVICE_ROLE_KEY (server-side only)');
    }
    if (!res.ok) {
      if (isTransientStatus(res.status)) {
        throw transientError(`Supabase download transient status ${res.status}`, { status: res.status });
      }
      throw new Error(`Supabase download failed with status ${res.status}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return Readable.from(buffer) as unknown as NodeJS.ReadableStream;
  }

  async delete(key: string): Promise<void> {
    const res = await this.request(this.objectUrl(key), { method: 'DELETE' }, 'delete');
    if (res.ok || res.status === 404) {
      await res.arrayBuffer().catch(() => undefined);
      return;
    }
    if (isTransientStatus(res.status)) {
      throw transientError(`Supabase delete transient status ${res.status}`, { status: res.status });
    }
    throw new Error(`Supabase delete failed with status ${res.status}`);
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.request(
      this.objectUrl(key),
      { method: 'GET', headers: { Range: 'bytes=0-0' } },
      'exists',
    );
    if (res.status === 404 || res.status === 416) {
      await res.arrayBuffer().catch(() => undefined);
      return false;
    }
    if (res.ok || res.status === 206) {
      await res.arrayBuffer().catch(() => undefined);
      return true;
    }
    if (isTransientStatus(res.status)) {
      throw transientError(`Supabase exists-check transient status ${res.status}`, { status: res.status });
    }
    throw new Error(`Supabase exists-check failed with status ${res.status}`);
  }

  async getUrl(_key: string): Promise<string> {
    // The bucket is private. Never expose public or signed Supabase URLs.
    throw new Error('Direct storage URLs are disabled for private resumes');
  }

  async healthCheck(): Promise<StorageHealth> {
    try {
      const res = await this.request(
        `${this.url}/storage/v1/bucket/${encodeURIComponent(this.bucket)}`,
        { method: 'GET' },
        'health',
      );
      if (res.ok) {
        await res.arrayBuffer().catch(() => undefined);
        return { healthy: true, durable: true };
      }
      if (res.status === 404) {
        return { healthy: false, durable: true, reason: 'bucket_missing' };
      }
      if (res.status === 401 || res.status === 403) {
        return { healthy: false, durable: true, reason: 'unauthorized' };
      }
      return { healthy: false, durable: true, reason: 'unavailable' };
    } catch (err) {
      if (err instanceof Error && (err as { retryable?: boolean }).retryable) {
        return { healthy: false, durable: true, reason: 'unavailable' };
      }
      return { healthy: false, durable: true, reason: 'misconfigured' };
    }
  }
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
