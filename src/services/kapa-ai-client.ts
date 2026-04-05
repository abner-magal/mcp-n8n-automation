import { logger } from '../utils/logger';

// ========================================================================
// Kapa.ai MCP Client — Layer 1 of Documentation Fallback Strategy
// ========================================================================

/**
 * Kapa.ai MCP Client
 * 
 * Connects to the Kapa.ai MCP server (https://n8n.mcp.kapa.ai/)
 * to perform semantic search on official n8n documentation.
 * 
 * This is Layer 1 of the fallback strategy:
 * Kapa.ai → llms.txt → docs.n8n.io
 */

// ========================================================================
// Types
// ========================================================================

export interface KapaAiClientConfig {
  /** Kapa.ai MCP server URL */
  serverUrl: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Base delay for exponential backoff (ms) */
  baseDelay?: number;
}

export interface KapaAiSearchResult {
  /** Answer text from Kapa.ai */
  answer: string;
  /** Source URL if available */
  source?: string;
  /** Confidence score (0-1) if available */
  confidence?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface KapaAiSearchResponse {
  /** Whether the search was successful */
  success: boolean;
  /** Search results */
  results: KapaAiSearchResult[];
  /** Error message if failed */
  error?: string;
}

/**
 * Custom error class for Kapa.ai connection failures
 */
export class KapaAiConnectionError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'KapaAiConnectionError';
  }
}

/**
 * Custom error class for Kapa.ai authentication failures
 */
export class KapaAiAuthenticationError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'KapaAiAuthenticationError';
  }
}

/**
 * Custom error class for Kapa.ai rate limiting
 */
export class KapaAiRateLimitError extends Error {
  constructor(message: string, public readonly retryAfter?: number) {
    super(message);
    this.name = 'KapaAiRateLimitError';
  }
}

// ========================================================================
// Client Implementation
// ========================================================================

export class KapaAiClient {
  private serverUrl: string;
  private timeout: number;
  private maxRetries: number;
  private baseDelay: number;

  constructor(config?: Partial<KapaAiClientConfig>) {
    this.serverUrl =
      config?.serverUrl ??
      process.env.KAPA_AI_SERVER_URL ??
      'https://n8n.mcp.kapa.ai/';
    this.timeout = config?.timeout ?? 15000;
    this.maxRetries = config?.maxRetries ?? 3;
    this.baseDelay = config?.baseDelay ?? 1000;
  }

  /**
   * Search n8n documentation via Kapa.ai MCP server
   * 
   * Uses the Kapa.ai API endpoint to perform semantic search.
   * Kapa.ai provides answers based on official n8n documentation.
   */
  async search(query: string): Promise<KapaAiSearchResponse> {
    if (!query || query.trim().length === 0) {
      return {
        success: false,
        results: [],
        error: 'Search query cannot be empty',
      };
    }

    try {
      const answer = await this.searchWithRetry(query.trim());
      
      if (!answer) {
        return {
          success: true,
          results: [],
        };
      }

      return {
        success: true,
        results: [
          {
            answer,
            source: 'https://n8n.mcp.kapa.ai/',
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.debug('Kapa.ai search failed', {
        query: query.slice(0, 100),
        error: message,
      });

      if (error instanceof KapaAiConnectionError) {
        return {
          success: false,
          results: [],
          error: `Kapa.ai connection error: ${message}`,
        };
      }

      if (error instanceof KapaAiAuthenticationError) {
        return {
          success: false,
          results: [],
          error: `Kapa.ai authentication failed: ${message}`,
        };
      }

      if (error instanceof KapaAiRateLimitError) {
        return {
          success: false,
          results: [],
          error: `Kapa.ai rate limit exceeded: ${message}`,
        };
      }

      return {
        success: false,
        results: [],
        error: `Kapa.ai search failed: ${message}`,
      };
    }
  }

  /**
   * Search with automatic retry and exponential backoff
   */
  private async searchWithRetry(query: string, attempt: number = 0): Promise<string | null> {
    try {
      return await this.executeSearch(query);
    } catch (error) {
      if (attempt >= this.maxRetries) {
        throw error;
      }

      // Don't retry on authentication errors
      if (error instanceof KapaAiAuthenticationError) {
        throw error;
      }

      const delay = this.baseDelay * Math.pow(2, attempt);
      logger.debug(`Kapa.ai search attempt ${attempt + 1}/${this.maxRetries + 1}, retrying in ${delay}ms`, {
        query: query.slice(0, 100),
        attempt: attempt + 1,
      });

      await this.sleep(delay);
      return this.searchWithRetry(query, attempt + 1);
    }
  }

  /**
   * Execute a single search request to Kapa.ai
   * 
   * Kapa.ai uses a question-answering API pattern.
   * We send the query and receive a structured answer.
   */
  private async executeSearch(query: string): Promise<string | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      // Kapa.ai API endpoint pattern
      const response = await fetch(`${this.serverUrl}api/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          question: query,
          mode: 'cite',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.handleHttpError(response);
      }

      const data = await response.json() as Record<string, unknown>;
      return this.parseResponse(data);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new KapaAiConnectionError(
          `Request timeout after ${this.timeout}ms`,
          undefined,
          error
        );
      }

      // Re-throw custom errors without wrapping
      if (error instanceof KapaAiConnectionError ||
          error instanceof KapaAiAuthenticationError ||
          error instanceof KapaAiRateLimitError) {
        throw error;
      }

      // Network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new KapaAiConnectionError(
          'Network error — check internet connection',
          undefined,
          error
        );
      }

      throw new KapaAiConnectionError(
        `Unexpected error: ${error instanceof Error ? error.message : 'unknown'}`,
        undefined,
        error
      );
    }
  }

  /**
   * Handle HTTP error responses
   */
  private handleHttpError(response: Response): never {
    const status = response.status;
    const statusText = response.statusText;

    switch (status) {
      case 401:
      case 403:
        throw new KapaAiAuthenticationError(
          `Authentication failed (${status} ${statusText})`
        );
      case 429: {
        const retryAfter = typeof response.headers?.get === 'function'
          ? response.headers.get('Retry-After')
          : null;
        throw new KapaAiRateLimitError(
          `Rate limit exceeded (${status} ${statusText})`,
          retryAfter ? parseInt(retryAfter, 10) : undefined
        );
      }
      case 500:
      case 502:
      case 503:
      case 504:
        throw new KapaAiConnectionError(
          `Server error (${status} ${statusText})`,
          status
        );
      default:
        throw new KapaAiConnectionError(
          `HTTP error (${status} ${statusText})`,
          status
        );
    }
  }

  /**
   * Parse Kapa.ai API response
   */
  private parseResponse(data: Record<string, unknown>): string | null {
    // Kapa.ai typically returns: { answer: string, sources?: Array<{...}> }
    if (typeof data.answer === 'string' && data.answer.length > 0) {
      return data.answer;
    }

    // Alternative response formats
    if (typeof data.response === 'string' && data.response.length > 0) {
      return data.response;
    }

    if (typeof data.text === 'string' && data.text.length > 0) {
      return data.text;
    }

    // If we have sources but no direct answer
    if (Array.isArray(data.sources) && data.sources.length > 0) {
      const firstSource = data.sources[0] as Record<string, unknown> | undefined;
      if (firstSource && typeof firstSource.content === 'string') {
        return firstSource.content;
      }
      if (firstSource && typeof firstSource.text === 'string') {
        return firstSource.text;
      }
    }

    // Response format not recognized
    logger.debug('Kapa.ai response format not recognized', {
      keys: Object.keys(data),
    });

    return null;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ========================================================================
// Singleton Instance
// ========================================================================

let _kapaAiClient: KapaAiClient | null = null;

/**
 * Get or create the Kapa.ai client singleton
 */
export function getKapaAiClient(config?: Partial<KapaAiClientConfig>): KapaAiClient {
  if (!_kapaAiClient) {
    _kapaAiClient = new KapaAiClient(config);
  }
  return _kapaAiClient;
}

/**
 * Reset the Kapa.ai client singleton (useful for testing)
 */
export function resetKapaAiClient(): void {
  _kapaAiClient = null;
}
