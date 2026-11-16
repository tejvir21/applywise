/**
 * Ollama provider (local models). Optional: the core app works without any
 * model running. Requires Ollama installed locally (`https://ollama.com`)
 * with a pulled chat model (see OLLAMA_MODEL, default `llama3.1:8b`, ~5GB
 * disk / ~8GB RAM). No API keys are involved; requests never leave the host
 * running Ollama. Timeouts, transport failures, and malformed model output
 * surface as AIProviderError with generic messages (no prompts, facts, keys,
 * or raw output leak to clients or logs beyond lengths).
 *
 * Bounded retry: transient transport failures and 5xx responses are retried
 * up to 3 times with a small backoff. Malformed output and 4xx responses are
 * not retried. Draft state is never modified when all retries are exhausted.
 */

import { AIProviderError, type AIGenerationRequest, type AIGenerationResponse, type AIProvider } from './AIProvider.js';

type FetchFn = typeof fetch;

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 300;

function isRetryableError(err: unknown): boolean {
  if (err instanceof AIProviderError) {
    return err.retryable;
  }
  return true; // transport failures are retryable
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly timeoutMs: number,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async generateContent(request: AIGenerationRequest): Promise<AIGenerationResponse> {
    const prompt = `${request.systemPrompt}\n\n${request.userPrompt}`;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await sleep(RETRY_BACKOFF_MS * attempt);
      }
      try {
        return await this.generateOnce(prompt, request);
      } catch (err) {
        lastError = err;
        if (!isRetryableError(err)) {
          throw err;
        }
        // Continue to next retry attempt
      }
    }

    throw lastError instanceof AIProviderError
      ? lastError
      : new AIProviderError('AI provider unavailable after retries');
  }

  private async generateOnce(
    prompt: string,
    request: AIGenerationRequest,
  ): Promise<AIGenerationResponse> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt, stream: false, format: 'json' }),
        signal: request.signal ?? AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new AIProviderError('AI provider unavailable or timed out');
    }

    if (!response.ok) {
      throw new AIProviderError('AI provider request failed', response.status);
    }

    let envelope: unknown;
    try {
      envelope = await response.json();
    } catch {
      throw new AIProviderError('AI provider returned malformed output', 502, false);
    }
    const text = extractText(envelope);
    if (!text) {
      throw new AIProviderError('AI provider returned malformed output', 502, false);
    }
    return { text, model: this.model, provider: 'ollama' };
  }
}

/** Pull the generated text out of an Ollama /api/generate envelope. */
export function extractText(envelope: unknown): string | null {
  if (typeof envelope !== 'object' || envelope === null) return null;
  const response = (envelope as { response?: unknown }).response;
  if (typeof response !== 'string' || !response.trim()) return null;
  // Tolerate ```json fences around the payload.
  const fenced = response.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : response).trim() || null;
}
