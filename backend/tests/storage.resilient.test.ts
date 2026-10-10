/** Resilient resume storage tests: Supabase primary + persistent local fallback. */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { Types } from 'mongoose';
import { Readable } from 'node:stream';
import { createApp } from '../src/app.js';
import { resetConfigCache } from '../src/config/index.js';
import { ResumeModel, ResumeAnalysisModel } from '../src/models/Resume.js';
import {
  LocalStorageProvider,
  SupabaseStorageProvider,
  providerNameOf,
  validateStorageConfig,
  resolveStorageTopology,
  saveWithFallback,
  providerNameForRecord,
  getStorageStatus,
  type StorageProvider,
  type StorageTopology,
} from '../src/storage/index.js';
import { uploadResume, downloadResume, deleteResume } from '../src/services/ResumeService.js';
import { connectToDatabase, disconnectDatabase } from '../src/config/database.js';

/** Minimal one-page PDF with selectable text. */
function buildMinimalPdf(text: string): Buffer {
  const esc = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const content = `BT /F1 12 Tf 72 720 Td (${esc}) Tj ET`;
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    out += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

const PDF_BYTES = buildMinimalPdf('Ada Lovelace ada@fictional.test TypeScript Node.js');

interface MockStore {
  provider: StorageProvider & { files: Map<string, Buffer> };
  files: Map<string, Buffer>;
  calls: { save: number; get: number; delete: number; exists: number };
}

function mockProvider(
  name: 'local' | 'supabase',
  behaviour: {
    save?: (key: string, data: Buffer) => Promise<void> | void;
    get?: (key: string) => Promise<Buffer | null> | Buffer | null;
    delete?: (key: string) => Promise<void> | void;
    exists?: (key: string) => Promise<boolean> | boolean;
    health?: { healthy: boolean; durable: boolean; reason?: string };
  } = {},
): MockStore {
  const files = new Map<string, Buffer>();
  const calls = { save: 0, get: 0, delete: 0, exists: 0 };
  const toBuffer = async (data: Buffer | Readable): Promise<Buffer> => {
    if (Buffer.isBuffer(data)) return data;
    const chunks: Buffer[] = [];
    for await (const chunk of data as unknown as AsyncIterable<Buffer | string>) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
  };
  const provider = {
    name,
    files,
    async save(key: string, data: Buffer | Readable) {
      calls.save += 1;
      if (behaviour.save) return behaviour.save(key, Buffer.isBuffer(data) ? data : await toBuffer(data));
      files.set(key, Buffer.isBuffer(data) ? data : await toBuffer(data));
    },
    async get(key: string) {
      calls.get += 1;
      if (behaviour.get) {
        const result = await behaviour.get(key);
        return result ? Readable.from(result) as unknown as NodeJS.ReadableStream : null;
      }
      const hit = files.get(key);
      return hit ? (Readable.from(hit) as unknown as NodeJS.ReadableStream) : null;
    },
    async delete(key: string) {
      calls.delete += 1;
      if (behaviour.delete) return behaviour.delete(key);
      files.delete(key);
    },
    async exists(key: string) {
      calls.exists += 1;
      if (behaviour.exists) return behaviour.exists(key);
      return files.has(key);
    },
    async getUrl() {
      throw new Error('Direct storage URLs are disabled for private resumes');
    },
    async healthCheck() {
      return behaviour.health ?? { healthy: true, durable: true };
    },
  } satisfies StorageProvider & { files: Map<string, Buffer> };
  return { provider, files, calls };
}

function topologyOf(primary: StorageProvider, fallback: StorageProvider | null = null): StorageTopology {
  const primaryName = providerNameOf(primary);
  return {
    primary,
    primaryName,
    fallback,
    fallbackName: fallback ? providerNameOf(fallback) : 'none',
    active: primary,
    activeName: primaryName,
    status: {
      active: primaryName,
      primary: primaryName,
      fallback: fallback ? providerNameOf(fallback) : 'none',
      healthy: true,
      durable: true,
      degraded: false,
    },
  };
}

describe('resilient resume storage', () => {
  let tmpDirs: string[] = [];

  beforeAll(async () => {
    await connectToDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  function makeTmp(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'applywise-storage-test-'));
    tmpDirs.push(dir);
    return dir;
  }

  beforeEach(async () => {
    await ResumeModel.deleteMany({}).exec();
    await ResumeAnalysisModel.deleteMany({}).exec();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetConfigCache();
    for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
    tmpDirs = [];
  });

  describe('startup provider selection', () => {
    it('uses Supabase when its configuration is valid', () => {
      vi.stubEnv('STORAGE_PROVIDER', 'supabase');
      vi.stubEnv('SUPABASE_URL', 'https://xyzcompany.supabase.co');
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'a'.repeat(64));
      vi.stubEnv('SUPABASE_RESUME_BUCKET', 'resumes');
      vi.stubEnv('RESUME_STORAGE_FALLBACK', 'none');
      resetConfigCache();
      const status = validateStorageConfig();
      expect(status.active).toBe('supabase');
      expect(status.primary).toBe('supabase');
      expect(status.degraded).toBe(false);
    });

    it('falls back to persistent local storage when Supabase config is missing and fallback is enabled', () => {
      const dir = makeTmp();
      vi.stubEnv('STORAGE_PROVIDER', 'supabase');
      vi.stubEnv('SUPABASE_URL', '');
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
      vi.stubEnv('RESUME_STORAGE_FALLBACK', 'local');
      vi.stubEnv('RESUME_STORAGE_PATH', dir);
      resetConfigCache();
      const status = validateStorageConfig();
      expect(status.active).toBe('local');
      expect(status.degraded).toBe(true);
      expect(status.reason).toBe('supabase_misconfigured');
    });

    it('fails clearly with missing credentials and no fallback', () => {
      vi.stubEnv('STORAGE_PROVIDER', 'supabase');
      vi.stubEnv('SUPABASE_URL', '');
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
      vi.stubEnv('RESUME_STORAGE_FALLBACK', 'none');
      resetConfigCache();
      expect(() => validateStorageConfig()).toThrow(/no durable fallback|Refusing to use ephemeral/i);
    });

    it('does not require Supabase credentials when local is deliberately selected', () => {
      const dir = makeTmp();
      vi.stubEnv('STORAGE_PROVIDER', 'local');
      vi.stubEnv('SUPABASE_URL', '');
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
      vi.stubEnv('RESUME_STORAGE_PATH', dir);
      resetConfigCache();
      const status = validateStorageConfig();
      expect(status.active).toBe('local');
    });

    it('rejects an ephemeral local path in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('STORAGE_PROVIDER', 'local');
      vi.stubEnv('RESUME_STORAGE_PATH', './storage/uploads');
      vi.stubEnv('JWT_ACCESS_SECRET', 'real-secure-access-secret-32-chars-min');
      vi.stubEnv('JWT_REFRESH_SECRET', 'real-secure-refresh-secret-32-chars-min');
      resetConfigCache();
      expect(() => validateStorageConfig()).toThrow(/absolute|persistent/i);
    });
  });

  describe('runtime failover', () => {
    it('fails over to the healthy fallback after a Supabase outage and records it', async () => {
      const userId = new Types.ObjectId();
      const primary = mockProvider('supabase', {
        save: async () => {
          throw new Error('simulated supabase outage');
        },
      });
      const fallbackDir = makeTmp();
      const fallback = new LocalStorageProvider(fallbackDir);
      const topology = topologyOf(primary.provider, fallback);

      const result = await uploadResume(userId, PDF_BYTES, 'resume.pdf', 'application/pdf', { topology });
      const doc = await ResumeModel.findById(result.resume.id).lean().exec();
      expect(doc!.storageProvider).toBe('local');
      expect(primary.calls.save).toBe(1);
      expect(fs.existsSync(path.join(fallbackDir, doc!.storageKey))).toBe(true);
    });

    it('fails the upload when both providers are unavailable, without false success', async () => {
      const userId = new Types.ObjectId();
      const primary = mockProvider('supabase', {
        save: async () => {
          throw new Error('primary down');
        },
      });
      const fallback = mockProvider('local', {
        save: async () => {
          throw new Error('fallback down');
        },
      });
      await expect(
        uploadResume(userId, PDF_BYTES, 'resume.pdf', 'application/pdf', { topology: topologyOf(primary.provider, fallback.provider) }),
      ).rejects.toThrow('primary down');
      expect(await ResumeModel.countDocuments({ userId }).exec()).toBe(0);
    });

    it('treats an ambiguous timeout as success when the object exists (no duplicate, no fallback write)', async () => {
      const primary = mockProvider('supabase');
      const fallback = mockProvider('local');
      const topology = topologyOf(primary.provider, fallback.provider);
      const key = 'aaaaaaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.pdf';
      const ambiguous = Object.assign(new Error('Supabase upload timed out after 8000ms'), {
        retryable: true,
        ambiguous: true,
      });
      // Simulate a late-arriving object: save throws, but exists finds it.
      let saved = false;
      const flaky = mockProvider('supabase', {
        save: async (k, data) => {
          primary.files.set(k, data);
          saved = true;
          throw ambiguous;
        },
        exists: async (k) => primary.files.has(k),
      });
      const flakyTopology = topologyOf(flaky.provider, fallback.provider);
      const outcome = await saveWithFallback(key, PDF_BYTES, 'application/pdf', flakyTopology);
      expect(outcome).toMatchObject({ provider: 'supabase', key });
      expect(saved).toBe(true);
      expect(fallback.calls.save).toBe(0);
      expect(topology).toBeDefined();
    });

    it('cleans up the actual (fallback) object when database persistence fails', async () => {
      const userId = new Types.ObjectId();
      const primary = mockProvider('supabase', {
        save: async () => {
          throw new Error('primary down');
        },
      });
      const fallback = mockProvider('local');
      const { ResumeRepository } = await import('../src/repositories/ResumeRepository.js');
      const failingResumes = {
        countByUserId: async () => 0,
        create: async () => {
          throw new Error('simulated database failure');
        },
        delete: async () => true,
      } as unknown as ResumeRepository;
      await expect(
        uploadResume(userId, PDF_BYTES, 'resume.pdf', 'application/pdf', {
          topology: topologyOf(primary.provider, fallback.provider),
          resumes: failingResumes,
        }),
      ).rejects.toThrow('simulated database failure');
      expect(fallback.files.size).toBe(0);
      expect(primary.files.size).toBe(0);
    });
  });

  describe('per-record provider affinity', () => {
    it('reads and deletes through the recorded provider, never silently switching', async () => {
      const userId = new Types.ObjectId();
      const supabase = mockProvider('supabase');
      const local = mockProvider('local');
      const both = topologyOf(supabase.provider, local.provider);

      const uploaded = await uploadResume(userId, PDF_BYTES, 'resume.pdf', 'application/pdf', {
        topology: topologyOf(supabase.provider, null),
      });
      expect(supabase.files.size).toBe(1);
      expect(local.files.size).toBe(0);

      const downloaded = await downloadResume(userId, uploaded.resume.id, { topology: both });
      expect(downloaded.filename).toBe('resume.pdf');
      expect(local.calls.get).toBe(0);

      await deleteResume(userId, uploaded.resume.id, { topology: both });
      expect(supabase.files.size).toBe(0);
      expect(local.calls.delete).toBe(0);
      const doc = await ResumeModel.findById(uploaded.resume.id).lean().exec();
      expect(doc!.status).toBe('deleted');
    });

    it('defaults legacy records without a provider to local (documented migration)', async () => {
      expect(providerNameForRecord({})).toBe('local');
      const userId = new Types.ObjectId();
      const local = mockProvider('local');
      const doc = await ResumeModel.create({
        userId,
        originalFilename: 'legacy.pdf',
        storedFilename: 'legacy.pdf',
        mimeType: 'application/pdf',
        fileSize: 4,
        storageKey: 'legacystoragekey/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf',
        status: 'ready',
      });
      local.files.set(doc.storageKey, PDF_BYTES);
      const downloaded = await downloadResume(userId, doc._id.toString(), {
        topology: topologyOf(local.provider, null),
      });
      expect(downloaded.filename).toBe('legacy.pdf');
    });

    it('refuses to guess on unrecognized providers instead of switching silently', () => {
      expect(() => providerNameForRecord({ storageProvider: 's3' })).toThrow(/not recognized|refusing to guess/i);
    });

    it('surfaces transient outages as 503, never a false 404', async () => {
      const userId = new Types.ObjectId();
      const flaky = mockProvider('supabase', {
        get: async () => {
          throw Object.assign(new Error('Supabase download timed out'), { retryable: true });
        },
        exists: async () => {
          throw Object.assign(new Error('Supabase exists timed out'), { retryable: true });
        },
      });
      const uploaded = await uploadResume(userId, PDF_BYTES, 'resume.pdf', 'application/pdf', {
        topology: topologyOf(mockProvider('supabase').provider, null),
      });
      // Point the record at the flaky backend.
      await ResumeModel.findByIdAndUpdate(uploaded.resume.id, { storageProvider: 'supabase' }).exec();
      const err = await downloadResume(userId, uploaded.resume.id, {
        topology: topologyOf(flaky.provider, null),
      }).catch((e: unknown) => e);
      expect(err).toMatchObject({ code: 'STORAGE_UNAVAILABLE', statusCode: 503 });
    });

    it('returns 404 only when the object is definitively missing', async () => {
      const userId = new Types.ObjectId();
      const empty = mockProvider('supabase');
      const uploaded = await uploadResume(userId, PDF_BYTES, 'resume.pdf', 'application/pdf', {
        topology: topologyOf(mockProvider('supabase').provider, null),
      });
      await ResumeModel.findByIdAndUpdate(uploaded.resume.id, { storageProvider: 'supabase' }).exec();
      await expect(
        downloadResume(userId, uploaded.resume.id, { topology: topologyOf(empty.provider, null) }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('enforces ownership at the service layer', async () => {
      const owner = new Types.ObjectId();
      const stranger = new Types.ObjectId();
      const local = mockProvider('local');
      const uploaded = await uploadResume(owner, PDF_BYTES, 'mine.pdf', 'application/pdf', {
        topology: topologyOf(local.provider, null),
      });
      await expect(
        downloadResume(stranger, uploaded.resume.id, { topology: topologyOf(local.provider, null) }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('supabase provider over mocked HTTP', () => {
    function stubEnvForSupabase() {
      vi.stubEnv('STORAGE_PROVIDER', 'supabase');
      vi.stubEnv('SUPABASE_URL', 'https://xyzcompany.supabase.co');
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'b'.repeat(64));
      vi.stubEnv('SUPABASE_RESUME_BUCKET', 'resumes');
      vi.stubEnv('SUPABASE_TIMEOUT_MS', '1000');
      vi.stubEnv('SUPABASE_MAX_RETRIES', '2');
      resetConfigCache();
    }

    it('retries transient failures within a bounded budget', async () => {
      stubEnvForSupabase();
      let attempts = 0;
      const fetchImpl = (async () => {
        attempts += 1;
        if (attempts < 3) return new Response('busy', { status: 503 });
        return new Response(JSON.stringify({ Key: 'ok' }), { status: 200 });
      }) as unknown as typeof fetch;
      const provider = new SupabaseStorageProvider(fetchImpl);
      await provider.save('aaaaaaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.pdf', PDF_BYTES, 'application/pdf');
      expect(attempts).toBe(3);
    });

    it('rejects unsafe keys and never issues public URLs', async () => {
      stubEnvForSupabase();
      const fetchImpl = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
      const provider = new SupabaseStorageProvider(fetchImpl);
      await expect(provider.save('../evil.pdf', PDF_BYTES, 'application/pdf')).rejects.toThrow('Invalid storage key');
      await expect(provider.getUrl('aaaaaaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.pdf')).rejects.toThrow(
        /disabled for private resumes/i,
      );
    });
  });

  describe('sanitized observability', () => {
    it('exposes provider selection without secrets, paths, or URLs', async () => {
      const secret = `sk-${'c'.repeat(60)}`;
      const dir = makeTmp();
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', secret);
      vi.stubEnv('RESUME_STORAGE_PATH', dir);
      resetConfigCache();
      const app = createApp();
      const res = await request(app).get('/api/health').expect(200);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(secret);
      expect(body).not.toContain(dir);
      expect(body).not.toContain('signed');
      expect(res.body.data.storage_provider).toBeDefined();
      expect(res.body.data.storage.active).toBeDefined();
      const storageKeys = Object.keys(res.body.data.storage).sort();
      expect(storageKeys).toEqual(
        expect.arrayContaining(['active', 'primary', 'fallback', 'healthy', 'durable']),
      );
    });

    it('never leaks storage keys, paths, or URLs in upload responses', async () => {
      const userId = new Types.ObjectId();
      const local = mockProvider('local');
      const result = await uploadResume(userId, PDF_BYTES, 'resume.pdf', 'application/pdf', {
        topology: topologyOf(local.provider, null),
      });
      const body = JSON.stringify(result);
      expect(body).not.toContain('storageKey');
      expect(body).not.toContain('http');
      expect(body).not.toContain(os.tmpdir());
    });

    it('reports live topology without secrets', async () => {
      const status = await getStorageStatus();
      const body = JSON.stringify(status);
      expect(body).not.toContain('SERVICE_ROLE');
      expect(status.active).toMatch(/local|supabase/);
    });
  });

  describe('live Supabase smoke test (explicit opt-in only)', () => {
    it('round-trips a file only when real credentials are configured', async () => {
      if (process.env.SUPABASE_SMOKE_TEST !== '1') return;
      const url = process.env.SUPABASE_URL ?? '';
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
      if (!url || !key || key.length < 32) return;
      const topology = await resolveStorageTopology();
      if (topology.activeName !== 'supabase') return;
      const keyName = `smoke/${'d'.repeat(16)}.pdf`;
      await topology.active.save(keyName, PDF_BYTES, 'application/pdf');
      expect(await topology.active.exists(keyName)).toBe(true);
      await topology.active.delete(keyName);
      expect(await topology.active.exists(keyName)).toBe(false);
    });
  });
});
