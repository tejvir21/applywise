/**
 * Minimal resilient HTTP/JSON client for job discovery.
 *
 * It exists to keep discovery polite and correct:
 *  - bounded request timeout
 *  - bounded retries with backoff for transient (5xx / network) failures only
 *  - a global concurrency ceiling (never floods upstream)
 *  - per-host cooldown after 429 / 403 / anti-bot signals, so we do not
 *    repeatedly poll a source that is rate-limiting or blocking us
 *  - a short-TTL response cache so "load more" / re-renders reuse responses
 *    where permitted (company-board + Muse responses are public JSON)
 *
 * It deliberately does NOT attempt to bypass Cloudflare, CAPTCHAs, or any
 * anti-bot protection. A 403/429/503 from such a wall maps to a cooldown and a
 * "blocked_upstream"/"rate_limited" source state upstream.
 */

export interface HttpResult<T> {
  ok: boolean;
  status?: number;
  data?: T;
  error?: string;
  /** Bounded snippet of the RESPONSE body for non-OK requests (safe: no URL/keys). */
  responseSnippet?: string;
  /** Set when the request was skipped due to an active cooldown. */
  cooledDown?: boolean;
  /** Set when upstream explicitly rate-limited us (429). */
  rateLimited?: boolean;
  /** Set when an anti-bot/block wall was detected (403/Cloudflare/503 wall). */
  blocked?: boolean;
  retryAfterSeconds?: number;
}

interface CacheEntry {
  at: number;
  body: unknown;
}

interface HostState {
  cooldownUntil: number;
}

export interface HttpJsonClientOptions {
  timeoutMs?: number;
  maxRetries?: number;
  /** Global max in-flight requests across all hosts. */
  concurrency?: number;
  /** Cache TTL in ms; <=0 disables caching. */
  cacheTtlMs?: number;
  /** Default cooldown after 429/403 when the header/aside is absent. */
  defaultCooldownMs?: number;
  /** Cooldown applied after transient (network/5xx) failures are exhausted. */
  networkCooldownMs?: number;
}

const DEFAULT_TIMEOUT = 12_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_COOLDOWN = 60_000;

export class HttpJsonClient {
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly concurrency: number;
  private readonly cacheTtlMs: number;
  private readonly defaultCooldownMs: number;
  private readonly networkCooldownMs: number;

  private readonly cache = new Map<string, CacheEntry>();
  private readonly hostState = new Map<string, HostState>();
  private inFlight = 0;
  private waiters: Array<() => void> = [];

  constructor(opts: HttpJsonClientOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
    this.maxRetries = opts.maxRetries ?? DEFAULT_RETRIES;
    this.concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
    this.cacheTtlMs = opts.cacheTtlMs ?? 0;
    this.defaultCooldownMs = opts.defaultCooldownMs ?? DEFAULT_COOLDOWN;
    this.networkCooldownMs = opts.networkCooldownMs ?? 15_000;
  }

  /** Remaining cooldown (ms) for a URL's host, 0 if none. Test/diagnostic aid. */
  cooldownRemainingMs(url: string): number {
    const host = this.hostOf(url);
    const st = this.hostState.get(host);
    if (!st) return 0;
    return Math.max(0, st.cooldownUntil - Date.now());
  }

  /** Force a cooldown on a host (used by sources that learn async limits). */
  setCooldown(url: string, ms: number): void {
    const host = this.hostOf(url);
    this.hostState.set(host, { cooldownUntil: Date.now() + ms });
  }

  clearCaches(): void {
    this.cache.clear();
  }

  private hostOf(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }

  private async acquire(): Promise<() => void> {
    if (this.inFlight < this.concurrency) {
      this.inFlight += 1;
      return () => this.release();
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    return () => this.release();
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
    } else {
      this.inFlight = Math.max(0, this.inFlight - 1);
    }
  }

  async getJson<T>(url: string, init: RequestInit = {}): Promise<HttpResult<T>> {
    const host = this.hostOf(url);
    const cooldownRemaining = this.cooldownRemainingMs(url);
    if (cooldownRemaining > 0) {
      return {
        ok: false,
        cooledDown: true,
        error: `Host ${host} is cooling down for ${Math.ceil(cooldownRemaining / 1000)}s`,
      };
    }

    const cacheKey = `GET ${url}`;
    if (this.cacheTtlMs > 0) {
      const hit = this.cache.get(cacheKey);
      if (hit && Date.now() - hit.at <= this.cacheTtlMs) {
        return { ok: true, data: hit.body as T };
      }
    }

    const release = await this.acquire();
    try {
      const attempt = await this.fetchWithRetry<T>(url, init);
      if (attempt.ok && this.cacheTtlMs > 0 && attempt.data !== undefined) {
        this.cache.set(cacheKey, { at: Date.now(), body: attempt.data });
      }
      return attempt;
    } finally {
      release();
    }
  }

  private async fetchWithRetry<T>(url: string, init: RequestInit): Promise<HttpResult<T>> {
    let lastError = '';
    let sawStatus = false;
    for (let i = 0; i <= this.maxRetries; i++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(url, {
          ...init,
          signal: controller.signal,
          headers: { accept: 'application/json', ...(init.headers ?? {}) },
        });
        const retryAfterSeconds = parseRetryAfter(res.headers.get('retry-after'));

        if (res.status === 429) {
          this.setCooldown(url, (retryAfterSeconds ?? this.defaultCooldownMs / 1000) * 1000);
          return { ok: false, status: 429, rateLimited: true, error: 'Rate limited upstream', retryAfterSeconds };
        }
        if (res.status === 403) {
          this.setCooldown(url, this.defaultCooldownMs);
          return { ok: false, status: 403, blocked: true, error: 'Blocked upstream (403)' };
        }
        // Transient anti-bot walls sometimes answer 503; treat a 503 with a
        // server header as a block, otherwise as retryable.
        if (res.status >= 500) {
          if (res.status === 503 && isCloudflare(res)) {
            this.setCooldown(url, this.defaultCooldownMs);
            return { ok: false, status: 503, blocked: true, error: 'Blocked upstream (503)' };
          }
          sawStatus = true;
          lastError = `HTTP ${res.status}`;
          await backoff(i);
          continue;
        }
        if (!res.ok) {
          // Capture a short, safe snippet of the response body so sources like
          // Adzuna can surface WHY a request was rejected (e.g. a 400 body).
          // This is the provider's response only — never the request URL, so
          // credentials in the query string cannot leak.
          const raw = await res.text().catch(() => '');
          const snippet = typeof raw === 'string' ? raw.slice(0, 300) : '';
          return {
            ok: false,
            status: res.status,
            error: `HTTP ${res.status}`,
            responseSnippet: snippet,
          };
        }
        const data = (await res.json()) as T;
        return { ok: true, status: res.status, data };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        await backoff(i);
      } finally {
        clearTimeout(timer);
      }
    }
    // Exhausted retries on a transient failure (network error or 5xx). Apply a
    // short cooldown so we do not repeatedly hammer an unavailable upstream
    // (e.g. an egress-blocked host) on back-to-back searches.
    this.setCooldown(url, this.networkCooldownMs);
    void sawStatus;
    return { ok: false, error: lastError || 'Request failed' };
  }
}

function isCloudflare(res: Response): boolean {
  const server = res.headers.get('server') ?? '';
  return server.toLowerCase().includes('cloudflare');
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return secs;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, Math.round((date - Date.now()) / 1000));
  return undefined;
}

function backoff(attempt: number): Promise<void> {
  const ms = Math.min(2000, 150 * 2 ** attempt);
  return new Promise((r) => setTimeout(r, ms));
}
