/** AI provider wiring. */

import { getConfig } from '../config/index.js';
import { ValidationError } from '../utils/errors.js';
import type { AIProvider } from './AIProvider.js';
import { MockAIProvider } from './MockAIProvider.js';
import { OllamaProvider } from './OllamaProvider.js';

export * from './AIProvider.js';

/** Resolve the configured provider. `mock` needs nothing running; `ollama`
 *  needs a local Ollama server with the configured model pulled. `openai` is
 *  a config placeholder with no implementation: selecting it is rejected. */
export function getAIProvider(): AIProvider {
  const config = getConfig();
  switch (config.AI_PROVIDER) {
    case 'mock':
      return new MockAIProvider();
    case 'ollama':
      return new OllamaProvider(config.OLLAMA_BASE_URL, config.OLLAMA_MODEL, config.AI_TIMEOUT_MS);
    case 'openai':
      throw new ValidationError('AI provider "openai" is not implemented; use "mock" or "ollama"', {
        provider: config.AI_PROVIDER,
      });
    default:
      throw new ValidationError('Unknown AI provider', { provider: config.AI_PROVIDER });
  }
}
