import { logger } from '../utils/logger';

// ========================================================================
// llms.txt Service — Layer 2 of Documentation Fallback Strategy
// ========================================================================

/**
 * llms.txt Service
 *
 * Fetches, parses, caches, and searches the llms.txt file from docs.n8n.io.
 * This is Layer 2 of the documentation fallback strategy:
 * Kapa.ai (Layer 1) → llms.txt (Layer 2) → docs.n8n.io (Layer 3)
 *
 * The llms.txt file contains a machine-readable index of all n8n documentation
 * pages, optimized for LLM consumption.
 */

// ========================================================================
// Types
// ========================================================================

/**
 * A single chunk of documentation parsed from llms.txt
 */
export interface LlmsTxtChunk {
  /** Section title or heading */
  title: string;
  /** Content text below the heading */
  content: string;
  /** Parent section name (e.g., "Nodes", "API", "Hosting") */
  section?: string;
  /** URL to the full documentation page */
  url?: string;
}

/**
 * Cache structure with TTL validation
 */
interface LlmsTxtCache {
  chunks: LlmsTxtChunk[];
  fetchedAt: number;
}

/**
 * Search result with relevance score
 */
export interface LlmsTxtSearchResult {
  chunk: LlmsTxtChunk;
  score: number;
}

// ========================================================================
// Custom Error Classes
// ========================================================================

/**
 * Error thrown when llms.txt fetch fails
 */
export class LlmsTxtFetchError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'LlmsTxtFetchError';
  }
}

/**
 * Error thrown when llms.txt parse fails
 */
export class LlmsTxtParseError extends Error {
  constructor(
    message: string,
    public readonly originalContent?: string
  ) {
    super(message);
    this.name = 'LlmsTxtParseError';
  }
}

// ========================================================================
// Constants
// ========================================================================

const LLMS_TXT_URL = 'https://docs.n8n.io/llms.txt';
const CACHE_TTL_MS = 3_600_000; // 1 hour
const FETCH_TIMEOUT_MS = 15_000;
const MAX_CHUNK_LENGTH = 4000;

// ========================================================================
// Service Class
// ========================================================================

export class LlmsTxtService {
  private cache: LlmsTxtCache | null = null;
  private retryDelay: number;

  constructor(options?: { retryDelay?: number }) {
    this.retryDelay = options?.retryDelay ?? 1000;
  }

  /**
   * Fetch llms.txt from docs.n8n.io with caching
   *
   * @returns Parsed documentation chunks
   * @throws LlmsTxtFetchError on network or HTTP errors
   * @throws LlmsTxtParseError on invalid content
   */
  async fetchAndParse(): Promise<LlmsTxtChunk[]> {
    // Return cached data if still valid
    if (this.cache && this.isCacheValid()) {
      logger.debug('llms.txt cache hit', {
        chunksCount: this.cache.chunks.length,
        age: Math.round((Date.now() - this.cache.fetchedAt) / 1000),
      });
      return this.cache.chunks;
    }

    logger.info('Fetching llms.txt from docs.n8n.io');

    const content = await this.fetchWithRetry();
    const chunks = this.parseLlmsTxt(content);

    // Update cache
    this.cache = {
      chunks,
      fetchedAt: Date.now(),
    };

    logger.info('llms.txt fetched and parsed', { chunksCount: chunks.length });

    return chunks;
  }

  /**
   * Search llms.txt documentation by keyword relevance
   *
   * @param query - Search query (e.g., "HTTP Request node OAuth2")
   * @param maxResults - Maximum number of results to return (default: 5)
   * @returns Ranked results by relevance score
   */
  async search(query: string, maxResults: number = 5): Promise<LlmsTxtSearchResult[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const chunks = await this.fetchAndParse();
    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2);

    if (queryWords.length === 0) {
      return [];
    }

    // Score each chunk by keyword matches
    const scoredResults: LlmsTxtSearchResult[] = chunks
      .map((chunk) => {
        const score = this.calculateRelevance(chunk, queryWords);
        return { chunk, score };
      })
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    logger.debug('llms.txt search completed', {
      query,
      queryWords: queryWords.length,
      totalChunks: chunks.length,
      matchedChunks: scoredResults.length,
      topScore: scoredResults[0]?.score ?? 0,
    });

    return scoredResults;
  }

  /**
   * Clear the in-memory cache
   */
  clearCache(): void {
    this.cache = null;
    logger.debug('llms.txt cache cleared');
  }

  /**
   * Check if cached data is still within TTL
   */
  private isCacheValid(): boolean {
    if (!this.cache) return false;
    const age = Date.now() - this.cache.fetchedAt;
    return age < CACHE_TTL_MS;
  }

  /**
   * Fetch llms.txt with retry and exponential backoff
   */
  private async fetchWithRetry(
    maxRetries: number = 3,
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.fetchOnce();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxRetries) {
          break;
        }

        // Don't retry on client errors (4xx)
        if (lastError instanceof LlmsTxtFetchError && lastError.statusCode !== undefined && lastError.statusCode >= 400 && lastError.statusCode < 500) {
          throw lastError;
        }

        const delay = this.retryDelay * Math.pow(2, attempt);
        logger.debug(`llms.txt fetch attempt ${attempt + 1}/${maxRetries + 1}, retrying in ${delay}ms`, {
          error: lastError.message,
        });

        await this.sleep(delay);
      }
    }

    throw new LlmsTxtFetchError(
      `Failed to fetch llms.txt after ${maxRetries + 1} attempts: ${lastError?.message ?? 'Unknown error'}`,
      undefined,
      lastError
    );
  }

  /**
   * Execute a single fetch request
   */
  private async fetchOnce(): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(LLMS_TXT_URL, {
        method: 'GET',
        headers: {
          Accept: 'text/plain',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new LlmsTxtFetchError(
          `HTTP ${response.status} ${response.statusText}`,
          response.status
        );
      }

      const content = await response.text();

      if (!content || content.trim().length === 0) {
        throw new LlmsTxtParseError('llms.txt returned empty content');
      }

      return content;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new LlmsTxtFetchError(
          `Request timeout after ${FETCH_TIMEOUT_MS}ms`,
          undefined,
          error
        );
      }

      if (error instanceof LlmsTxtFetchError || error instanceof LlmsTxtParseError) {
        throw error;
      }

      throw new LlmsTxtFetchError(
        `Network error: ${error instanceof Error ? error.message : 'unknown'}`,
        undefined,
        error
      );
    }
  }

  /**
   * Parse llms.txt content into searchable chunks
   *
   * Expected format:
   * # Section Title
   * - [Page Title](url) - Description
   * - [Page Title](url) - Description
   *
   * ## Subsection
   * - [Page Title](url) - Description
   */
  private parseLlmsTxt(content: string): LlmsTxtChunk[] {
    const lines = content.split('\n');
    const chunks: LlmsTxtChunk[] = [];

    let currentSection = '';
    let currentTitle = '';
    let currentContent: string[] = [];
    let currentUrl: string | undefined;

    const flushChunk = () => {
      if (currentTitle && currentContent.length > 0) {
        chunks.push({
          title: currentTitle,
          content: currentContent.join('\n').trim().slice(0, MAX_CHUNK_LENGTH),
          section: currentSection || undefined,
          url: currentUrl,
        });
      }
      currentTitle = '';
      currentContent = [];
      currentUrl = undefined;
    };

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines
      if (trimmed.length === 0) continue;

      // Section heading: # Section or ## Subsection
      if (trimmed.startsWith('#')) {
        flushChunk();
        currentSection = trimmed.replace(/^#+\s*/, '');
        continue;
      }

      // List item: - [Title](url) - Description
      if (trimmed.startsWith('- ')) {
        const match = trimmed.match(/^- \[([^\]]+)\]\(([^)]+)\)\s*[-–—]?\s*(.*)?$/);

        if (match) {
          flushChunk();
          currentTitle = match[1]!;
          currentUrl = match[2]!;
          const description = match[3] ?? '';

          if (description) {
            currentContent.push(description);
          }
        } else {
          // Fallback for non-standard list items
          if (!currentTitle) {
            currentTitle = trimmed.slice(2);
          } else {
            currentContent.push(trimmed);
          }
        }
        continue;
      }

      // Continuation of previous content
      if (currentTitle) {
        currentContent.push(trimmed);
      }
    }

    // Flush last chunk
    flushChunk();

    if (chunks.length === 0) {
      throw new LlmsTxtParseError(
        'Failed to parse llms.txt: no valid chunks found',
        content.slice(0, 500)
      );
    }

    return chunks;
  }

  /**
   * Calculate relevance score for a chunk based on keyword matches
   *
   * Scoring:
   * - Title match: 10 points per word
   * - Section match: 5 points per word
   * - Content match: 1 point per word
   */
  private calculateRelevance(chunk: LlmsTxtChunk, queryWords: string[]): number {
    const titleLower = chunk.title.toLowerCase();
    const sectionLower = (chunk.section ?? '').toLowerCase();
    const contentLower = chunk.content.toLowerCase();

    let score = 0;

    for (const word of queryWords) {
      // Title matches (highest weight)
      if (titleLower.includes(word)) {
        score += 10;
      }

      // Section matches (medium weight)
      if (sectionLower.includes(word)) {
        score += 5;
      }

      // Content matches (lower weight)
      if (contentLower.includes(word)) {
        score += 1;
      }
    }

    // Bonus for exact phrase match in title
    if (titleLower.includes(queryWords.join(' '))) {
      score += 20;
    }

    return score;
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

let _llmsTxtService: LlmsTxtService | null = null;

/**
 * Get or create the llms.txt service singleton
 */
export function getLlmsTxtService(): LlmsTxtService {
  if (!_llmsTxtService) {
    _llmsTxtService = new LlmsTxtService();
  }
  return _llmsTxtService;
}

/**
 * Reset the llms.txt service singleton (useful for testing)
 */
export function resetLlmsTxtService(): void {
  _llmsTxtService = null;
}
