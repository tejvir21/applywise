/** Storage provider abstraction for resume files. */

import { Readable } from 'stream';

export interface StorageProvider {
  save(key: string, data: Buffer | Readable, contentType: string): Promise<void>;
  get(key: string): Promise<Readable | NodeJS.ReadableStream | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getUrl(key: string): Promise<string>;
}