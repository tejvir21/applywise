/** Storage package initialization. */

import { getConfig } from '../config/index.js';
import { InternalError } from '../utils/errors.js';

export type { StorageProvider } from './StorageProvider.js';
export { LocalStorageProvider } from './LocalStorageProvider.js';

/**
 * Resolve the configured storage provider. Only `local` is implemented:
 * files persist under RESUME_STORAGE_PATH, which production deployments
 * must back with durable storage (mounted volume). Anything else fails
 * clearly instead of pretending persistence is durable.
 */
export async function getStorageProvider() {
  const config = getConfig();
  if (config.STORAGE_PROVIDER === 'local') {
    const { LocalStorageProvider } = await import('./LocalStorageProvider.js');
    return new LocalStorageProvider();
  }
  throw new InternalError(
    `Storage provider "${config.STORAGE_PROVIDER}" is not implemented; configure STORAGE_PROVIDER=local with a durable RESUME_STORAGE_PATH`,
  );
}