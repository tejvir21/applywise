/** AI provider abstraction (Phase 7). */

import { AppError } from '../utils/errors.js';

export type GenerationKind = 'coverLetter' | 'resumeDraft' | 'answer' | 'fitExplanation';

export interface AIGenerationRequest {
  kind: GenerationKind;
  systemPrompt: string;
  userPrompt: string;
  /** Verified facts only; providers must not invent beyond these. */
  facts: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface AIGenerationResponse {
  /** Raw model text (expected to be a JSON document for structured kinds). */
  text: string;
  model: string;
  provider: string;
}

export interface AIProvider {
  readonly name: string;
  generateContent(request: AIGenerationRequest): Promise<AIGenerationResponse>;
}

/** Upstream provider failure. Messages are generic: prompts, facts, keys,
 *  and raw model output are never exposed to clients. */
export class AIProviderError extends AppError {
  constructor(message = 'AI generation failed') {
    super('AI_PROVIDER_ERROR', message, 502);
  }
}
