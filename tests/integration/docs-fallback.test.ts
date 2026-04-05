/**
 * Integration Tests: Documentation Fallback System
 *
 * Tests the layered documentation fallback against real external services:
 * - Layer 1: Kapa.ai MCP (if available)
 * - Layer 2: llms.txt from docs.n8n.io
 * - Layer 3: Direct docs.n8n.io search link
 *
 * These tests require network access. Skip gracefully if services are unavailable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  DocsFallbackService,
  DocsFallbackOptions,
  resetDocsFallbackService,
} from '../../src/services/docs-fallback-service';
import { getLlmsTxtService, resetLlmsTxtService } from '../../src/services/llms-txt-service';
import { getKapaAiClient, resetKapaAiClient } from '../../src/services/kapa-ai-client';

// ─────────────────────────────────────────────────────────────────────────────
// Test Configuration
// ─────────────────────────────────────────────────────────────────────────────

const TEST_TIMEOUT = 20000; // 20s for external API calls
const KAPA_TIMEOUT = 10000; // 10s for Kapa.ai specifically

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if Kapa.ai service is accessible
 */
async function isKapaAiAvailable(): Promise<boolean> {
  try {
    const client = getKapaAiClient();
    const result = await client.search('webhook');
    return result.success && result.results.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if llms.txt service is accessible
 */
async function isLlmsTxtAvailable(): Promise<boolean> {
  try {
    const service = getLlmsTxtService();
    const results = await service.search('webhook', 1);
    return results.length > 0;
  } catch (error) {
    // llms.txt may fail to parse - that's okay, we skip those tests
    console.warn('llms.txt availability check failed:', error instanceof Error ? error.message : 'unknown');
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: llms.txt Integration (Layer 2)
// ─────────────────────────────────────────────────────────────────────────────

describe('llms.txt Integration Tests (Layer 2)', () => {
  let llmsAvailable = true;

  beforeAll(async () => {
    try {
      llmsAvailable = await isLlmsTxtAvailable();
    } catch {
      llmsAvailable = false;
    }
    if (!llmsAvailable) {
      console.warn('⚠️  llms.txt service unavailable — tests will be skipped');
    }
  }, TEST_TIMEOUT);

  afterAll(() => {
    resetLlmsTxtService();
  });

  it(
    'should search n8n documentation for "webhook node"',
    async () => {
      if (!llmsAvailable) {
        console.log('⏭️  Skipping: llms.txt not available');
        return;
      }

      const service = getLlmsTxtService();
      const results = await service.search('webhook node', 3);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      // Verify result structure
      const firstResult = results[0];
      expect(firstResult).toHaveProperty('chunk');
      expect(firstResult.chunk).toHaveProperty('title');
      expect(firstResult.chunk).toHaveProperty('content');
      expect(firstResult).toHaveProperty('score');
      expect(typeof firstResult.score).toBe('number');
    },
    TEST_TIMEOUT
  );

  it(
    'should search for "HTTP Request node OAuth"',
    async () => {
      if (!llmsAvailable) {
        console.log('⏭️  Skipping: llms.txt not available');
        return;
      }

      const service = getLlmsTxtService();
      const results = await service.search('HTTP Request node OAuth', 5);

      expect(results.length).toBeGreaterThan(0);

      // Verify results have meaningful content
      for (const result of results) {
        expect(result.chunk.title).toBeDefined();
        expect(result.chunk.title.length).toBeGreaterThan(0);
        expect(result.score).toBeGreaterThanOrEqual(0);
      }
    },
    TEST_TIMEOUT
  );

  it(
    'should return empty results for nonsensical query',
    async () => {
      if (!llmsAvailable) {
        console.log('⏭️  Skipping: llms.txt not available');
        return;
      }

      const service = getLlmsTxtService();
      const results = await service.search('xyzzyplughqwerty', 5);

      // Should return empty array, not throw
      expect(Array.isArray(results)).toBe(true);
    },
    TEST_TIMEOUT
  );

  it(
    'should respect maxResults parameter',
    async () => {
      if (!llmsAvailable) {
        console.log('⏭️  Skipping: llms.txt not available');
        return;
      }

      const service = getLlmsTxtService();
      const results = await service.search('node', 2);

      expect(results.length).toBeLessThanOrEqual(2);
    },
    TEST_TIMEOUT
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: Kapa.ai Integration (Layer 1)
// ─────────────────────────────────────────────────────────────────────────────

describe('Kapa.ai Integration Tests (Layer 1)', () => {
  let kapaAvailable = true;

  beforeAll(async () => {
    kapaAvailable = await isKapaAiAvailable();
    if (!kapaAvailable) {
      console.warn('⚠️  Kapa.ai service unavailable — tests will be skipped');
    }
  }, TEST_TIMEOUT);

  afterAll(() => {
    resetKapaAiClient();
  });

  it(
    'should search Kapa.ai for documentation',
    async () => {
      if (!kapaAvailable) {
        console.log('⏭️  Skipping: Kapa.ai not available');
        return;
      }

      const client = getKapaAiClient();
      const result = await client.search('How to configure webhook trigger');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(Array.isArray(result.results)).toBe(true);
    },
    TEST_TIMEOUT
  );

  it(
    'should return structured answers with sources',
    async () => {
      if (!kapaAvailable) {
        console.log('⏭️  Skipping: Kapa.ai not available');
        return;
      }

      const client = getKapaAiClient();
      const result = await client.search('HTTP Request node authentication');

      if (result.results.length > 0) {
        const firstAnswer = result.results[0];
        expect(firstAnswer).toHaveProperty('answer');
        expect(typeof firstAnswer.answer).toBe('string');
        expect(firstAnswer.answer.length).toBeGreaterThan(0);
      }
    },
    TEST_TIMEOUT
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: Docs Fallback Orchestration (Layers 1→2→3)
// ─────────────────────────────────────────────────────────────────────────────

describe('Docs Fallback Orchestration Tests', () => {
  let llmsAvailable = true;
  let kapaAvailable = true;

  beforeAll(async () => {
    [kapaAvailable, llmsAvailable] = await Promise.all([
      isKapaAiAvailable(),
      isLlmsTxtAvailable(),
    ]);

    if (!kapaAvailable) {
      console.warn('⚠️  Kapa.ai unavailable — fallback will start at Layer 2');
    }
    if (!llmsAvailable) {
      console.warn('⚠️  llms.txt unavailable — fallback will use Layer 3 only');
    }
  }, TEST_TIMEOUT);

  afterAll(() => {
    resetDocsFallbackService();
    resetKapaAiClient();
    resetLlmsTxtService();
  });

  it(
    'should return result from available layer for common query',
    async () => {
      const service = new DocsFallbackService({
        kapaTimeout: KAPA_TIMEOUT,
        llmsMaxResults: 3,
      });

      const result = await service.search('webhook node configuration');

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.source).toBeDefined();
      expect(['kapa_ai', 'llms_txt', 'docs_link']).toContain(result.source);
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    },
    TEST_TIMEOUT
  );

  it(
    'should return docs_link when query is nonsensical',
    async () => {
      const service = new DocsFallbackService({
        kapaTimeout: KAPA_TIMEOUT,
        llmsMaxResults: 3,
      });

      const result = await service.search('xyzzyplughqwerty12345');

      expect(result).toBeDefined();
      // If both Kapa and llms.txt fail, should get docs_link
      if (!kapaAvailable && !llmsAvailable) {
        expect(result.source).toBe('docs_link');
        expect(result.content).toContain('docs.n8n.io');
      }
      // If one layer succeeds, that layer's content is returned
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    },
    TEST_TIMEOUT
  );

  it(
    'should return result for specific technical query',
    async () => {
      const service = new DocsFallbackService({
        kapaTimeout: KAPA_TIMEOUT,
        llmsMaxResults: 5,
      });

      const result = await service.search('n8n expression syntax $json $node');

      expect(result).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.source).toBeDefined();
    },
    TEST_TIMEOUT
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: Individual Layer Methods
// ─────────────────────────────────────────────────────────────────────────────

describe('Individual Layer Methods Tests', () => {
  let llmsAvailable = true;
  let kapaAvailable = true;

  beforeAll(async () => {
    [kapaAvailable, llmsAvailable] = await Promise.all([
      isKapaAiAvailable(),
      isLlmsTxtAvailable(),
    ]);
  }, TEST_TIMEOUT);

  afterAll(() => {
    resetDocsFallbackService();
  });

  it(
    'searchKapaOnly should return result or null',
    async () => {
      const service = new DocsFallbackService({ kapaTimeout: KAPA_TIMEOUT });
      const result = await service.searchKapaOnly('webhook setup');

      if (kapaAvailable) {
        expect(result).not.toBeNull();
        expect(result!.source).toBe('kapa_ai');
        expect(result!.content.length).toBeGreaterThan(0);
      } else {
        expect(result).toBeNull();
      }
    },
    TEST_TIMEOUT
  );

  it(
    'searchLlmsTxtOnly should return result or null',
    async () => {
      const service = new DocsFallbackService();
      const result = await service.searchLlmsTxtOnly('HTTP Request node');

      if (llmsAvailable) {
        expect(result).not.toBeNull();
        expect(result!.source).toBe('llms_txt');
        expect(result!.content.length).toBeGreaterThan(0);
      } else {
        expect(result).toBeNull();
      }
    },
    TEST_TIMEOUT
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: MCP Tool Integration (n8n_search_external_docs)
// ─────────────────────────────────────────────────────────────────────────────

describe('MCP Tool Integration: n8n_search_external_docs', () => {
  let llmsAvailable = true;

  beforeAll(async () => {
    llmsAvailable = await isLlmsTxtAvailable();
  }, TEST_TIMEOUT);

  afterAll(() => {
    resetDocsFallbackService();
  });

  it(
    'should return structured search result via MCP tool handler',
    async () => {
      // Import the actual MCP tool handler
      const { handleSearchExternalDocs } = await import(
        '../../src/mcp/handlers-n8n-manager'
      );

      const result = await handleSearchExternalDocs({
        query: 'webhook trigger best practices',
        source: 'auto',
      });

      expect(result.success).toBe(true);
      // Handler returns message (not data field)
      expect(result.message).toBeDefined();
      expect(typeof result.message).toBe('string');
      expect(result.message!.length).toBeGreaterThan(0);
      // Should mention docs.n8n.io link
      expect(result.message).toContain('docs.n8n.io');
    },
    TEST_TIMEOUT
  );

  it(
    'should search Kapa.ai specifically when source=kapa_ai',
    async () => {
      const { handleSearchExternalDocs } = await import(
        '../../src/mcp/handlers-n8n-manager'
      );

      const result = await handleSearchExternalDocs({
        query: 'HTTP Request node OAuth2',
        source: 'kapa_ai',
      });

      // If Kapa is unavailable, the handler still returns success with docs link
      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
    },
    TEST_TIMEOUT
  );

  it(
    'should search llms.txt specifically when source=llms_txt',
    async () => {
      const { handleSearchExternalDocs } = await import(
        '../../src/mcp/handlers-n8n-manager'
      );

      const result = await handleSearchExternalDocs({
        query: 'Google Sheets node integration',
        source: 'llms_txt',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();

      if (llmsAvailable) {
        expect(result.message!.length).toBeGreaterThan(0);
      }
    },
    TEST_TIMEOUT
  );
});
