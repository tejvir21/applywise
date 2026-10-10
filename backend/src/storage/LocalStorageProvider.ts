/** Local filesystem storage provider for resume files. */

import { createReadStream, createWriteStream, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname, resolve, sep } from 'path';
import type { StorageHealth, StorageProvider, StorageProviderName } from './StorageProvider.js';
import { assertSafeStorageKey } from './StorageProvider.js';
import { getConfig } from '../config/index.js';

export class LocalStorageProvider implements StorageProvider {
  readonly name: StorageProviderName = 'local';
  private basePath: string;

  constructor(basePath?: string) {
    const config = getConfig();
    this.basePath = resolve(basePath || config.RESUME_STORAGE_PATH);

    // Ensure base directory exists
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  get root(): string {
    return this.basePath;
  }

  async save(key: string, data: Buffer | NodeJS.ReadableStream, contentType: string): Promise<void> {
    assertSafeStorageKey(key);
    void contentType;
    const filePath = this.getFilePath(key);

    // Ensure directory exists
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    return new Promise((resolvePromise, reject) => {
      const writeStream = createWriteStream(filePath);

      if (Buffer.isBuffer(data)) {
        writeStream.write(data);
        writeStream.end();
      } else {
        data.pipe(writeStream);
      }

      writeStream.on('finish', () => resolvePromise());
      writeStream.on('error', reject);
    });
  }

  async get(key: string): Promise<NodeJS.ReadableStream | null> {
    assertSafeStorageKey(key);
    const filePath = this.getFilePath(key);

    if (!existsSync(filePath)) {
      return null;
    }

    return createReadStream(filePath);
  }

  async delete(key: string): Promise<void> {
    assertSafeStorageKey(key);
    const filePath = this.getFilePath(key);

    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  async exists(key: string): Promise<boolean> {
    assertSafeStorageKey(key);
    const filePath = this.getFilePath(key);
    return existsSync(filePath);
  }

  async getUrl(_key: string): Promise<string> {
    // Private resumes have no direct URLs. Files stream through the
    // authenticated GET /api/resumes/:id/download route instead.
    throw new Error('Direct storage URLs are disabled for private resumes');
  }

  async healthCheck(): Promise<StorageHealth> {
    try {
      if (!existsSync(this.basePath)) {
        mkdirSync(this.basePath, { recursive: true });
      }
      const { checkLocalDurability } = await import('./resilient.js');
      const durable = checkLocalDurability(this.basePath);
      return durable.ok
        ? { healthy: true, durable: true }
        : { healthy: true, durable: false, reason: 'ephemeral_path' };
    } catch {
      return { healthy: false, durable: false, reason: 'unavailable' };
    }
  }

  private getFilePath(key: string): string {
    // Neutralize traversal without mangling legitimate names (dots and
    // extensions are preserved): drop drive letters, split on separators,
    // discard empty / '.' / '..' segments, then verify containment.
    const segments = key
      .replace(/^[a-zA-Z]:/, '')
      .split(/[\\/]+/)
      .filter((part) => part.length > 0 && part !== '.' && part !== '..');
    const filePath = join(this.basePath, ...segments);
    const resolvedBase = resolve(this.basePath) + sep;
    const resolved = resolve(filePath);
    if (resolved !== resolve(this.basePath) && !resolved.startsWith(resolvedBase)) {
      throw new Error('Invalid storage key');
    }
    return resolved;
  }
}
