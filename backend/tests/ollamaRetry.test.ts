/** OllamaProvider retry tests (Phase 8.3.16).
 *
 * Verifies bounded retry behavior for transient provider failures.
 */

import { describe, it, expect } from 'vitest';
import { OllamaProvider } from '../src/ai/OllamaProvider.js';
import { AIProviderError } from '../src/ai/AIProvider.js';

describe('OllamaProvider retry behavior', () => {
  it('succeeds on first attempt when no failure', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ response: '{"answer":"test"}' }),
    } as Response);

    const provider = new OllamaProvider('http://localhost:11434', 'test-model', 5000, mockFetch as any);
    const result = await provider.generateContent({
      kind: 'answer',
      systemPrompt: 'test',
      userPrompt: 'test',
      facts: {},
    });
    expect(result.text).toBe('{"answer":"test"}');
  });

  it('retries on transient 5xx and succeeds', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: false, status: 503, json: async () => ({}) } as Response;
      }
      return { ok: true, json: async () => ({ response: '{"answer":"test"}' }) } as Response;
    };

    const provider = new OllamaProvider('http://localhost:11434', 'test-model', 5000, mockFetch as any);
    const result = await provider.generateContent({
      kind: 'answer',
      systemPrompt: 'test',
      userPrompt: 'test',
      facts: {},
    });
    expect(result.text).toBe('{"answer":"test"}');
    expect(callCount).toBe(2);
  });

  it('does not retry on 4xx', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return { ok: false, status: 400, json: async () => ({}) } as Response;
    };

    const provider = new OllamaProvider('http://localhost:11434', 'test-model', 5000, mockFetch as any);
    await expect(provider.generateContent({
      kind: 'answer',
      systemPrompt: 'test',
      userPrompt: 'test',
      facts: {},
    })).rejects.toThrow(AIProviderError);
    expect(callCount).toBe(1);
  });

  it('retries on transport failure', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('network error');
      }
      return { ok: true, json: async () => ({ response: '{"answer":"test"}' }) } as Response;
    };

    const provider = new OllamaProvider('http://localhost:11434', 'test-model', 5000, mockFetch as any);
    const result = await provider.generateContent({
      kind: 'answer',
      systemPrompt: 'test',
      userPrompt: 'test',
      facts: {},
    });
    expect(result.text).toBe('{"answer":"test"}');
    expect(callCount).toBe(2);
  });

  it('throws after 3 consecutive transient failures', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return { ok: false, status: 503, json: async () => ({}) } as Response;
    };

    const provider = new OllamaProvider('http://localhost:11434', 'test-model', 5000, mockFetch as any);
    await expect(provider.generateContent({
      kind: 'answer',
      systemPrompt: 'test',
      userPrompt: 'test',
      facts: {},
    })).rejects.toThrow(AIProviderError);
    expect(callCount).toBe(3);
  });

  it('does not retry on malformed output', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return { ok: true, json: async () => ({ response: '' }) } as Response;
    };

    const provider = new OllamaProvider('http://localhost:11434', 'test-model', 5000, mockFetch as any);
    await expect(provider.generateContent({
      kind: 'answer',
      systemPrompt: 'test',
      userPrompt: 'test',
      facts: {},
    })).rejects.toThrow(AIProviderError);
    expect(callCount).toBe(1);
  });
});
