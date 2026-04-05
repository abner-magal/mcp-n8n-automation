import { getKapaAiClient, KapaAiClient } from './kapa-ai-client';
import { getLlmsTxtService, LlmsTxtService, LlmsTxtSearchResult } from './llms-txt-service';
import { logger } from '../utils/logger';

// ========================================================================
// Docs Fallback Orchestrator — Layer 1 → Layer 2 → Layer 3
// ========================================================================

/**
 * Documentation source used by the fallback orchestrator.
 * - `kapa_ai`: Kapa.ai MCP semantic search (Layer 1)
 * - `llms_txt`: llms.txt keyword search (Layer 2)
 * - `docs_link`: Direct link to docs.n8n.io (Layer 3)
 */
export type DocsSource = 'kapa_ai' | 'llms_txt' | 'docs_link';

/**
 * Result returned by the docs fallback orchestrator.
 */
export interface DocsSearchResult {
  /** Search result content (markdown-formatted answer or ranked results) */
  content: string;
  /** Which documentation layer provided the result */
  source: DocsSource;
  /** Confidence/relevance score (0-1), when applicable */
  confidence?: number;
  /** URL to source documentation, when applicable */
  url?: string;
  /** Time taken to obtain the result in milliseconds */
  elapsedMs: number;
}

/**
 * Options that control orchestrator behavior.
 */
export interface DocsFallbackOptions {
  /** Maximum time for Kapa.ai search (ms). Default: 15000 */
  kapaTimeout?: number;
  /** Maximum number of llms.txt results. Default: 5 */
  llmsMaxResults?: number;
}

/**
 * Internal result used during layer evaluation.
 */
interface LayerResult {
  content: string;
  source: DocsSource;
  confidence?: number;
  url?: string;
}

// ========================================================================
// Custom Error Classes
// ========================================================================

/**
 * Thrown when all documentation layers fail and no docs link can be generated.
 * Extremely unlikely — only happens if encodeURIComponent or URL construction fails.
 */
export class DocsFallbackError extends Error {
  constructor(
    message: string,
    public readonly attemptedLayers: DocsSource[],
    public readonly lastError?: Error
  ) {
    super(message);
    this.name = 'DocsFallbackError';
  }
}

// ========================================================================
// Service Class
// ========================================================================

export class DocsFallbackService {
  private kapaClient: KapaAiClient;
  private llmsService: LlmsTxtService;
  private kapaTimeout: number;
  private llmsMaxResults: number;

  constructor(options?: DocsFallbackOptions, deps?: { kapaClient?: KapaAiClient; llmsService?: LlmsTxtService }) {
    this.kapaClient = deps?.kapaClient ?? getKapaAiClient();
    this.llmsService = deps?.llmsService ?? getLlmsTxtService();
    this.kapaTimeout = options?.kapaTimeout ?? 15000;
    this.llmsMaxResults = options?.llmsMaxResults ?? 5;
  }

  /**
   * Search n8n documentation using the layered fallback strategy.
   *
   * Order:
   * 1. Kapa.ai MCP (semantic search on official docs)
   * 2. llms.txt (keyword search on docs.n8n.io/llms.txt)
   * 3. Direct link to docs.n8n.io search
   *
   * The orchestrator tries Layer 1 first. If it fails (network error,
   * timeout, empty results), it falls back to Layer 2. If Layer 2 also
   * fails, it returns Layer 3 (a docs.n8n.io search link).
   *
   * @param query - The search query
   * @returns DocsSearchResult with content, source metadata, and timing
   */
  async search(query: string): Promise<DocsSearchResult> {
    const startTime = Date.now();
    const attempted: DocsSource[] = [];

    // Layer 1: Kapa.ai
    attempted.push('kapa_ai');
    const kapaResult = await this.tryKapaAi(query);
    if (kapaResult) {
      const elapsed = Date.now() - startTime;
      logger.info('Docs fallback: Layer 1 (Kapa.ai) succeeded', { query: query.slice(0, 100), elapsedMs: elapsed });
      return {
        content: kapaResult.content,
        source: 'kapa_ai',
        confidence: kapaResult.confidence,
        url: kapaResult.url ?? undefined,
        elapsedMs: elapsed,
      };
    }

    // Layer 2: llms.txt
    attempted.push('llms_txt');
    const llmsResult = await this.tryLlmsTxt(query);
    if (llmsResult) {
      const elapsed = Date.now() - startTime;
      logger.info('Docs fallback: Layer 2 (llms.txt) succeeded', { query: query.slice(0, 100), elapsedMs: elapsed });
      return {
        content: llmsResult.content,
        source: 'llms_txt',
        url: llmsResult.url ?? undefined,
        elapsedMs: elapsed,
      };
    }

    // Layer 3: Direct docs link
    const elapsed = Date.now() - startTime;
    logger.info('Docs fallback: Layers 1-2 failed, returning Layer 3 (docs link)', {
      query: query.slice(0, 100),
      elapsedMs: elapsed,
    });

    const searchUrl = `https://docs.n8n.io/search/?q=${encodeURIComponent(query)}`;
    return {
      content: `No results found in Kapa.ai or llms.txt.\n\nSearch n8n documentation directly: ${searchUrl}`,
      source: 'docs_link',
      url: searchUrl,
      elapsedMs: elapsed,
    };
  }

  /**
   * Search using Kapa.ai only (no fallback).
   *
   * @param query - The search query
   * @returns DocsSearchResult or null if Kapa.ai fails
   */
  async searchKapaOnly(query: string): Promise<DocsSearchResult | null> {
    const startTime = Date.now();
    const result = await this.tryKapaAi(query);
    if (!result) return null;

    return {
      content: result.content,
      source: 'kapa_ai',
      confidence: result.confidence,
      url: result.url ?? undefined,
      elapsedMs: Date.now() - startTime,
    };
  }

  /**
   * Search using llms.txt only (no fallback).
   *
   * @param query - The search query
   * @returns DocsSearchResult or null if llms.txt fails
   */
  async searchLlmsTxtOnly(query: string): Promise<DocsSearchResult | null> {
    const startTime = Date.now();
    const result = await this.tryLlmsTxt(query);
    if (!result) return null;

    return {
      content: result.content,
      source: 'llms_txt',
      url: result.url ?? undefined,
      elapsedMs: Date.now() - startTime,
    };
  }

  // ========================================================================
  // Private Layer Implementations
  // ========================================================================

  /**
   * Try Layer 1: Kapa.ai semantic search.
   * Returns null on any failure (network, timeout, empty results).
   */
  private async tryKapaAi(query: string): Promise<LayerResult | null> {
    try {
      const response = await this.kapaClient.search(query);

      if (!response.success || response.results.length === 0) {
        return null;
      }

      const firstResult = response.results[0];
      if (!firstResult.answer || firstResult.answer.trim().length === 0) {
        return null;
      }

      let content = firstResult.answer;
      if (firstResult.source) {
        content += `\n\n**Source:** ${firstResult.source}`;
      }
      if (firstResult.confidence !== undefined) {
        content += `\n**Confidence:** ${Math.round(firstResult.confidence * 100)}%`;
      }

      return {
        content,
        source: 'kapa_ai',
        confidence: firstResult.confidence,
        url: firstResult.source ?? undefined,
      };
    } catch (error) {
      logger.warn('Docs fallback: Kapa.ai layer failed — degrading to next layer', {
        query: query.slice(0, 100),
        error: error instanceof Error ? error.message : 'unknown',
        layer: 'kapa_ai',
      });
      return null;
    }
  }

  /**
   * Try Layer 2: llms.txt keyword search.
   * Returns null on any failure (network, parse, empty results).
   */
  private async tryLlmsTxt(query: string): Promise<LayerResult | null> {
    try {
      const results = await this.llmsService.search(query, this.llmsMaxResults);

      if (results.length === 0) {
        return null;
      }

      const formattedResults = results.map((result: LlmsTxtSearchResult, index: number) => {
        const { chunk, score } = result;
        let output = `**${index + 1}. ${chunk.title}**`;

        if (chunk.section) {
          output += ` (Section: ${chunk.section})`;
        }

        output += ` — Relevance: ${score}\n`;

        if (chunk.url) {
          output += `🔗 ${chunk.url}\n`;
        }

        if (chunk.content) {
          const preview = chunk.content.length > 500
            ? chunk.content.slice(0, 500) + '...'
            : chunk.content;
          output += `${preview}`;
        }

        return output;
      });

      const content = formattedResults.join('\n\n---\n\n');

      return {
        content,
        source: 'llms_txt',
        url: results[0]?.chunk.url,
      };
    } catch (error) {
      logger.warn('Docs fallback: llms.txt layer failed — degrading to next layer', {
        query: query.slice(0, 100),
        error: error instanceof Error ? error.message : 'unknown',
        layer: 'llms_txt',
      });
      return null;
    }
  }
}

// ========================================================================
// Singleton Instance
// ========================================================================

let _docsFallbackService: DocsFallbackService | null = null;

/**
 * Get or create the docs fallback service singleton.
 */
export function getDocsFallbackService(options?: DocsFallbackOptions): DocsFallbackService {
  if (!_docsFallbackService) {
    _docsFallbackService = new DocsFallbackService(options);
  }
  return _docsFallbackService;
}

/**
 * Reset the docs fallback service singleton (useful for testing).
 */
export function resetDocsFallbackService(): void {
  _docsFallbackService = null;
}
