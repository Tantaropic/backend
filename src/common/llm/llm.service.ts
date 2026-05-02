import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  InternalServerError,
  RateLimitError,
} from 'openai';

export interface LlmCompletionOptions {
  systemPrompt: string;
  userPrompt: string;
  /**
   * Hard cap on output tokens. Required to make cost/latency intent explicit
   * and to prevent runaway responses. Size to ~1.3–1.5× expected output length.
   */
  maxTokens: number;
  temperature?: number;
  /**
   * Returned when the LLM call fails or yields empty content.
   * If omitted, errors are re-thrown to the caller.
   */
  fallback?: string;
}

interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * Reusable wrapper around the OpenAI-compatible chat completions API.
 * Centralizes client setup, retry/backoff, error handling, logging,
 * and fallback behavior so feature modules don't duplicate OpenAI plumbing.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly client: OpenAI;
  private readonly defaultModel: string;
  private readonly retry: RetryConfig;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({
      baseURL: 'https://models.inference.ai.azure.com',
      apiKey: this.config.getOrThrow<string>('GITHUB_TOKEN'),
      // We implement our own retry loop below for visibility & Retry-After handling.
      maxRetries: 0,
    });
    this.defaultModel = this.config.get<string>('AI_MODEL') ?? 'gpt-4.1';
    this.retry = {
      maxAttempts: this.config.get<number>('LLM_MAX_ATTEMPTS') ?? 4,
      baseDelayMs: this.config.get<number>('LLM_RETRY_BASE_MS') ?? 500,
      maxDelayMs: this.config.get<number>('LLM_RETRY_MAX_MS') ?? 8_000,
    };
  }

  /**
   * Generates a single chat completion from a system + user prompt pair.
   * Returns the trimmed assistant message, or `fallback` on failure/empty output.
   * Retries transient errors (429, 5xx, network) with exponential backoff + jitter.
   *
   * `maxTokens` is intentionally required — callers must size it for their use
   * case (cost, latency, truncation risk). See callers for typical values.
   */
  async complete(options: LlmCompletionOptions): Promise<string> {
    const {
      systemPrompt,
      userPrompt,
      maxTokens,
      temperature = 0.7,
      fallback,
    } = options;

    try {
      const response: any = await this.callWithRetry(() =>
        this.client.chat.completions.create({
          model: this.defaultModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature,
        }),
      );

      if (response.choices[0]?.finish_reason === 'length') {
        this.logger.warn(
          `LLM response truncated by max_tokens cap (${String(maxTokens)})`,
        );
      }

      const content = response.choices[0]?.message?.content?.trim();
      if (content) return content;

      if (fallback !== undefined) {
        this.logger.warn('LLM returned empty content; using fallback');
        return fallback;
      }
      throw new Error('LLM returned empty content');
    } catch (error: any) {
      if (fallback !== undefined) {
        this.logger.error(`LLM completion failed: ${String(error)}`);
        return fallback;
      }
      throw error;
    }
  }

  private async callWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.retry.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        if (!this.isRetryable(error) || attempt === this.retry.maxAttempts) {
          throw error;
        }

        const delayMs = this.computeDelayMs(error, attempt);
        this.logger.warn(
          `LLM call failed (attempt ${String(attempt)}/${String(this.retry.maxAttempts)}): ${this.describeError(error)}. Retrying in ${String(delayMs)}ms`,
        );
        await this.sleep(delayMs);
      }
    }

    // Unreachable: loop either returns or throws.
    throw lastError;
  }

  private isRetryable(error: any): boolean {
    if (
      error instanceof RateLimitError ||
      error instanceof APIConnectionError ||
      error instanceof APIConnectionTimeoutError ||
      error instanceof InternalServerError
    ) {
      return true;
    }
    if (error instanceof APIError && typeof error.status === 'number') {
      return error.status >= 500 && error.status < 600;
    }
    return false;
  }

  private computeDelayMs(error: any, attempt: number): number {
    // Honor server-provided Retry-After when present (e.g., on 429).
    if (error instanceof APIError) {
      const headers = error.headers as
        | Record<string, string | undefined>
        | undefined;
      const retryAfter = this.parseRetryAfter(headers);
      if (retryAfter !== undefined) {
        return Math.min(retryAfter, this.retry.maxDelayMs);
      }
    }

    // Exponential backoff with full jitter.
    const exponential = this.retry.baseDelayMs * 2 ** (attempt - 1);
    const capped = Math.min(exponential, this.retry.maxDelayMs);
    return Math.floor(Math.random() * capped);
  }

  private parseRetryAfter(
    headers: Record<string, string | undefined> | undefined,
  ): number | undefined {
    if (!headers) return undefined;
    const raw = headers['retry-after'] ?? headers['Retry-After'];
    if (!raw) return undefined;

    const seconds = Number(raw);
    if (Number.isFinite(seconds)) return seconds * 1_000;

    const dateMs = Date.parse(raw);
    if (!Number.isNaN(dateMs)) {
      return Math.max(0, dateMs - Date.now());
    }
    return undefined;
  }

  private describeError(error: any): string {
    if (error instanceof APIError) {
      return `${error.name} ${String(error.status ?? '')} ${error.message}`.trim();
    }
    if (error instanceof Error) return `${error.name}: ${error.message}`;
    return String(error);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
