/** Local filesystem storage provider for resume files. */

import { createReadStream, createWriteStream, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname, resolve, sep } from 'path';
import { StorageProvider } from './StorageProvider.js';
import { getConfig } from '../config/index.js';

export class LocalStorageProvider implements StorageProvider {
  private basePath: string;

  constructor(basePath?: string) {
    const config = getConfig();
    this.basePath = resolve(basePath || config.RESUME_STORAGE_PATH);
    
    // Ensure base directory exists
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  async save(key: string, data: Buffer | NodeJS.ReadableStream, contentType: string): Promise<void> {
    const filePath = this.getFilePath(key);
    
    // Ensure directory exists
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      const writeStream = createWriteStream(filePath);
      
      if (Buffer.isBuffer(data)) {
        writeStream.write(data);
        writeStream.end();
      } else {
        data.pipe(writeStream);
      }
      
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
  }

  async get(key: string): Promise<NodeJS.ReadableStream | null> {
    const filePath = this.getFilePath(key);
    
    if (!existsSync(filePath)) {
      return null;
    }
    
    return createReadStream(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key);
    return existsSync(filePath);
  }

  async getUrl(key: string): Promise<string> {
    // For local storage, return a route that will stream the file
    const config = await import('../config/index.js');
    return `${config.getConfig().CLIENT_URL}/api/resumes/download/${key}`;
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