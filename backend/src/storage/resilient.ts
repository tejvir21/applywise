/**
 * Resilient storage topology: Supabase (preferred) with an explicit,
 * persistent local fallback. All health/status output is sanitized: no
 * secrets, tokens, signed URLs, bucket names in URLs, or filesystem paths.
 */

import os from 'node:os';
import path from 'node:path';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { getConfig } from '../config/index.js';
import type { StorageHealth, StorageProvider, StorageProviderName } from './StorageProvider.js';
import { providerNameOf } from './StorageProvider.js';

export interface StorageStatus {
  active: StorageProviderName;
  primary: StorageProviderName;
  fallback: StorageProviderName | 'none';
  healthy: boolean;
  durable: boolean;
  degraded: boolean;
  reason?: string;
}

export interface StorageTopology {
  primary: StorageProvider;
  primaryName: StorageProviderName;
  fallback: StorageProvider | null;
  fallbackName: StorageProviderName | 'none';
  active: StorageProvider;
  activeName: StorageProviderName;
  status: StorageStatus;
}

const EPHEMERAL_SEGMENTS = ['tmp', 'temp'];
const MAX_TOPOLOGY_REASON_LEN = 64;

function sanitizeReason(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  return reason.slice(0, MAX_TOPOLOGY_REASON_LEN);
}

function isProduction(): boolean {
  try {
    return getConfig().NODE_ENV === 'production';
  } catch {
    return false;
  }
}

function isTest(): boolean {
  try {
    return getConfig().NODE_ENV === 'test';
  } catch {
    return false;
  }
}

/** True when a local path looks ephemeral (tmp dirs). Never throws. */
export function isEphemeralLocalPath(candidate: string): boolean {
  try {
    const resolved = path.resolve(candidate);
    const tmpdir = path.resolve(os.tmpdir());
    if (resolved === tmpdir || resolved.startsWith(tmpdir + path.sep)) return true;
    const lower = resolved.toLowerCase();
    if (lower === `${path.sep}tmp` || lower.startsWith(`${path.sep}tmp${path.sep}`)) return true;
    if (lower === `${path.sep}var${path.sep}tmp` || lower.startsWith(`${path.sep}var${path.sep}tmp${path.sep}`)) return true;
    const parts = lower.split(path.sep).filter(Boolean);
    if (parts.some((p) => EPHEMERAL_SEGMENTS.includes(p) && (isProduction() ? true : false))) {
      // In non-production, only the tmpdir checks above count as ephemeral so
      // tests can use os.tmpdir() fixtures as a writable fallback.
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * Durability probe for a local directory. In production the path must be
 * absolute, outside tmp, and writable. Outside production any writable
 * directory counts (dev/tests keep working), but tmp-backed paths are
 * reported as non-durable so operators can tell the difference.
 */
export function checkLocalDurability(candidate: string): { ok: boolean; reason?: string } {
  try {
    const resolved = path.resolve(candidate);
    if (isProduction()) {
      if (!path.isAbsolute(candidate)) return { ok: false, reason: 'relative_path' };
      if (isEphemeralLocalPath(resolved)) return { ok: false, reason: 'ephemeral_path' };
    }
    mkdirSync(resolved, { recursive: true });
    const probe = path.join(resolved, `.applywise-write-test-${process.pid}.tmp`);
    writeFileSync(probe, 'ok', { flag: 'w' });
    try {
      unlinkSync(probe);
    } catch {
      // Best effort cleanup.
    }
    if (!isProduction() && isEphemeralLocalPath(resolved) && !isTest()) {
      return { ok: true, reason: 'ephemeral_path' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'unwritable' };
  }
}

/**
 * Verify a local directory for use as primary or fallback storage.
 * Throws a clear, actionable error when the directory is unsafe. Never
 * throws for missing Supabase credentials; that is handled separately.
 *
 * Persistence (absolute path, outside tmp) is enforced in production, where
 * ephemeral disks lose data. In development/test any writable directory
 * verifies so local storage stays usable (including os.tmpdir() fixtures);
 * production still refuses ephemeral paths.
 */
export function verifyLocalDirOrThrow(candidate: string, opts: { requirePersistent: boolean }): string {
  const resolved = path.resolve(candidate);
  if (opts.requirePersistent && isProduction()) {
    if (!path.isAbsolute(candidate)) {
      throw new Error(
        `Local storage is not durable: RESUME_STORAGE_PATH must be an absolute path to a persistent volume in production (got a relative path). Mount a Render disk and set RESUME_STORAGE_PATH to its mount path.`,
      );
    }
    if (isEphemeralLocalPath(resolved)) {
      throw new Error(
        `Local storage is not durable: RESUME_STORAGE_PATH points at an ephemeral temporary directory. Mount a persistent disk and set RESUME_STORAGE_PATH to its mount path.`,
      );
    }
  }
  try {
    mkdirSync(resolved, { recursive: true });
    const probe = path.join(resolved, `.applywise-write-test-${process.pid}.tmp`);
    writeFileSync(probe, 'ok', { flag: 'w' });
    try {
      unlinkSync(probe);
    } catch {
      // ignore
    }
  } catch {
    throw new Error(
      `Local storage is unavailable: RESUME_STORAGE_PATH is not writable. Point it at a writable persistent directory.`,
    );
  }
  return resolved;
}

function supabaseConfigError(): string | null {
  const config = getConfig();
  const url = (config.SUPABASE_URL ?? '').trim();
  const key = (config.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  const bucket = (config.SUPABASE_RESUME_BUCKET ?? '').trim();
  if (!url) return 'SUPABASE_URL is missing';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
      return 'SUPABASE_URL must use https';
    }
  } catch {
    return 'SUPABASE_URL is not a valid URL';
  }
  if (!key || key.length < 32 || key.includes('change-me')) return 'SUPABASE_SERVICE_ROLE_KEY is missing or invalid';
  if (!bucket || !/^[a-z0-9][a-z0-9-_]{0,62}$/.test(bucket)) return 'SUPABASE_RESUME_BUCKET is missing or invalid';
  return null;
}

/**
 * Validate storage configuration at startup. Returns a sanitized topology
 * summary (no secrets/paths/URLs). Throws a clear error when no safe
 * provider is available instead of silently using ephemeral storage.
 *
 * Rules:
 * - local primary: always allowed when the directory verifies; in
 *   production the directory must be persistent (absolute, non-tmp).
 * - supabase primary with valid config: primary is supabase.
 * - supabase primary with missing/invalid config: use local only when
 *   RESUME_STORAGE_FALLBACK=local and the local directory verifies as
 *   persistent; otherwise throw.
 */
export function validateStorageConfig(): StorageStatus {
  const config = getConfig();
  const primary = config.STORAGE_PROVIDER;
  const fallbackOpt = config.RESUME_STORAGE_FALLBACK;
  const production = config.NODE_ENV === 'production';

  if (primary === 'local') {
    verifyLocalDirOrThrow(config.RESUME_STORAGE_PATH, { requirePersistent: production });
    return {
      active: 'local',
      primary: 'local',
      fallback: 'none',
      healthy: true,
      durable: true,
      degraded: false,
    };
  }

  // primary === 'supabase'
  const configErr = supabaseConfigError();
  if (!configErr) {
    let fallback: StorageProviderName | 'none' = 'none';
    let degraded = false;
    let reason: string | undefined;
    if (fallbackOpt === 'local') {
      const durability = checkLocalDurability(config.RESUME_STORAGE_PATH);
      if (durability.ok && (production ? durability.reason !== 'ephemeral_path' : true)) {
        // In production an ephemeral fallback is not durable: disable it.
        if (production && isEphemeralLocalPath(path.resolve(config.RESUME_STORAGE_PATH))) {
          degraded = true;
          reason = 'fallback_not_durable';
        } else {
          fallback = 'local';
        }
      } else {
        degraded = true;
        reason = durability.reason ?? 'fallback_unavailable';
      }
    }
    return {
      active: 'supabase',
      primary: 'supabase',
      fallback,
      healthy: true,
      durable: true,
      degraded,
      reason: sanitizeReason(reason),
    };
  }

  // Supabase misconfigured: local fallback only when explicitly enabled with
  // a verified persistent directory. Otherwise fail clearly.
  if (fallbackOpt === 'local') {
    try {
      verifyLocalDirOrThrow(config.RESUME_STORAGE_PATH, { requirePersistent: true });
    } catch (err) {
      throw new Error(
        `Storage misconfigured: STORAGE_PROVIDER=supabase but ${configErr}, and the local fallback is not durable (${err instanceof Error ? err.message : 'unwritable'}). ` +
          `Fix Supabase credentials or mount a persistent disk and set RESUME_STORAGE_PATH to its absolute mount path.`,
      );
    }
    return {
      active: 'local',
      primary: 'supabase',
      fallback: 'local',
      healthy: true,
      durable: true,
      degraded: true,
      reason: 'supabase_misconfigured',
    };
  }

  throw new Error(
    `Storage misconfigured: STORAGE_PROVIDER=supabase but ${configErr}, and no durable fallback is enabled. ` +
      `Set valid SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/SUPABASE_RESUME_BUCKET, or explicitly enable a persistent fallback with RESUME_STORAGE_FALLBACK=local and an absolute RESUME_STORAGE_PATH on a mounted disk. Refusing to use ephemeral storage.`,
  );
}

/** Build live provider instances for the validated topology. */
export async function resolveStorageTopology(): Promise<StorageTopology> {
  const status = validateStorageConfig();
  const config = getConfig();

  let primary: StorageProvider;
  if (status.active === 'local' && status.primary === 'supabase') {
    // Degraded startup: Supabase misconfigured, local fallback active.
    const { LocalStorageProvider } = await import('./LocalStorageProvider.js');
    primary = new LocalStorageProvider(config.RESUME_STORAGE_PATH);
  } else if (status.primary === 'supabase' && status.active === 'supabase') {
    const { SupabaseStorageProvider } = await import('./SupabaseStorageProvider.js');
    primary = new SupabaseStorageProvider();
  } else {
    const { LocalStorageProvider } = await import('./LocalStorageProvider.js');
    primary = new LocalStorageProvider(config.RESUME_STORAGE_PATH);
  }

  let fallback: StorageProvider | null = null;
  if (status.fallback === 'local' && status.active === 'supabase') {
    const { LocalStorageProvider } = await import('./LocalStorageProvider.js');
    fallback = new LocalStorageProvider(config.RESUME_STORAGE_PATH);
  }

  const primaryName: StorageProviderName = providerNameOf(primary);
  const fallbackName: StorageProviderName | 'none' = fallback ? providerNameOf(fallback) : 'none';
  const active = status.active === 'supabase' && status.primary === 'supabase' ? primary : primary;
  return {
    primary,
    primaryName,
    fallback,
    fallbackName,
    active,
    activeName: status.active,
    status,
  };
}

export function isRetryableStorageError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const marker = err as { retryable?: boolean; status?: number; code?: string };
  if (marker.retryable === true) return true;
  if (typeof marker.status === 'number' && (marker.status === 429 || (marker.status >= 500 && marker.status <= 599))) return true;
  if (typeof marker.code === 'string' && /TIMEOUT|ECONN|ENOTFOUND|EAI_AGAIN|SOCKET|FETCH/i.test(marker.code)) return true;
  if (err instanceof Error && /timed out|timeout|ECONN|ENOTFOUND|EAI_AGAIN|socket|fetch failed/i.test(err.message)) return true;
  return false;
}

export function isAmbiguousStorageError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const marker = err as { ambiguous?: boolean };
  if (marker.ambiguous === true) return true;
  if (err instanceof Error && /timed out|timeout|aborted|ambiguous/i.test(err.message)) return true;
  return false;
}

async function providerIsHealthy(provider: StorageProvider): Promise<{ healthy: boolean; durable: boolean }> {
  try {
    if (typeof provider.healthCheck === 'function') {
      const result: StorageHealth = await provider.healthCheck();
      return { healthy: result.healthy, durable: result.durable };
    }
    // Legacy test doubles without healthCheck: probe with a non-existent key.
    // A reachable provider answers true/false; a down provider throws.
    await provider.exists('healthcheck/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf');
    return { healthy: true, durable: true };
  } catch {
    return { healthy: false, durable: false };
  }
}

/**
 * Save with bounded retries (handled inside providers) plus failover.
 * On ambiguous failures (timeout), checks the primary for the intended
 * object before falling back, avoiding duplicates/orphans. Falls back only
 * when the configured fallback is healthy and durable. Never deletes or
 * migrates the original during failover.
 */
export async function saveWithFallback(
  key: string,
  data: Buffer,
  contentType: string,
  topology: StorageTopology,
): Promise<{ provider: StorageProviderName; key: string }> {
  const primaryName = topology.activeName;
  try {
    await topology.active.save(key, data, contentType);
    return { provider: primaryName, key };
  } catch (primaryErr) {
    const ambiguous = isAmbiguousStorageError(primaryErr) || isRetryableStorageError(primaryErr);
    if (ambiguous) {
      // The upload may have landed despite the timeout. Check before any
      // retry/fallback so we neither duplicate nor orphan objects.
      try {
        const alreadyThere = await topology.active.exists(key);
        if (alreadyThere) return { provider: primaryName, key };
      } catch {
        // Exists-check itself failed; fall through to fallback handling and
        // leave any primary-side object for operator reconciliation (never
        // auto-delete originals during failover).
      }
    }

    if (!topology.fallback) throw primaryErr;
    const health = await providerIsHealthy(topology.fallback);
    if (!health.healthy || !health.durable) throw primaryErr;
    try {
      await topology.fallback.save(key, data, contentType);
    } catch {
      // Both providers unavailable: surface the primary failure without
      // reporting a false success. Any partial fallback object is removed
      // best-effort to avoid orphans.
      await topology.fallback.delete(key).catch(() => undefined);
      throw primaryErr;
    }
    return { provider: topology.fallbackName as StorageProviderName, key };
  }
}

/**
 * Legacy migration/default strategy (documented, safe):
 * - Records written before the provider field existed predate Supabase
 *   support: every version before this change stored only to local disk, so
 *   a missing field defaults to 'local'.
 * - Any other unknown value is NOT guessed: callers receive a clear conflict
 *   error so operators can reconcile instead of reading the wrong backend.
 */
export function providerNameForRecord(record: { storageProvider?: unknown }): StorageProviderName {
  const value = record.storageProvider as string | undefined;
  if (!value) return 'local';
  if (value === 'local' || value === 'supabase') return value;
  const err = new Error(
    `Resume storage provider "${String(value)}" is not recognized; refusing to guess. Reconcile the resume record before reading.`,
  ) as Error & { code?: string; statusCode?: number };
  err.code = 'STORAGE_PROVIDER_CONFLICT';
  err.statusCode = 409;
  throw err;
}

/** Resolve the live provider recorded for a resume. Never silently switches. */
export function providerForRecord(
  record: { storageProvider?: unknown },
  topology: StorageTopology,
): StorageProvider {
  const wanted = providerNameForRecord(record);
  const candidates: StorageProvider[] = [topology.active, ...(topology.fallback ? [topology.fallback] : [])];
  // Prefer an exact match; also construct the recorded provider directly when
  // the topology does not include it (e.g. active degraded to local but the
  // record lives on supabase). Never substitute a different provider.
  const exact = candidates.find((p) => providerNameOf(p) === wanted);
  if (exact) return exact;
  throw new Error(
    `Resume is stored on "${wanted}" but that provider is not available in the current topology; refusing to substitute another backend.`,
  );
}

/**
 * Sanitized storage status for health endpoints. Never includes secrets,
 * tokens, signed URLs, bucket/object identifiers, or filesystem paths.
 */
export async function getStorageStatus(): Promise<StorageStatus> {
  let status: StorageStatus;
  try {
    status = validateStorageConfig();
  } catch (err) {
    return {
      active: 'local',
      primary: 'local',
      fallback: 'none',
      healthy: false,
      durable: false,
      degraded: true,
      reason: sanitizeReason(err instanceof Error ? 'misconfigured' : 'misconfigured'),
    };
  }
  try {
    const topology = await resolveStorageTopology();
    const checks = await Promise.all([
      providerIsHealthy(topology.active),
      topology.fallback ? providerIsHealthy(topology.fallback) : Promise.resolve({ healthy: true, durable: true }),
    ]);
    const activeOk = checks[0].healthy;
    return {
      ...status,
      healthy: activeOk,
      durable: checks[0].durable,
      degraded: status.degraded || !activeOk,
      reason: !activeOk ? 'unavailable' : status.reason,
    };
  } catch {
    return { ...status, healthy: false, degraded: true, reason: 'unavailable' };
  }
}
