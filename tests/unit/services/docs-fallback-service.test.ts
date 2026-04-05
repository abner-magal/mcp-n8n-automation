import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DocsFallbackService,
  DocsSearchResult,
  DocsFallbackError,
  getDocsFallbackService,
  resetDocsFallbackService,
} from '../../../src/services/docs-fallback-service';
import {
  KapaAiClient,
  KapaAiSearchResponse,
  resetKapaAiClient,
} from '../../../src/services/kapa-ai-client';
import {
  LlmsTxtService,
  LlmsTxtSearchResult,
  resetLlmsTxtService,
} from '../../../src/services/llms-txt-service';

// ========================================================================
// Mock Setup
// ========================================================================

describe('DocsFallbackService', () => {
  let kapaClient: KapaAiClient;
  let llmsService: LlmsTxtService;
  let orchestrator: DocsFallbackService;

  beforeEach(() => {
    vi.useFakeTimers();
    resetKapaAiClient();
    resetLlmsTxtService();
    resetDocsFallbackService();

    kapaClient = new KapaAiClient({
      serverUrl: 'https://n8n.mcp.kapa.ai/',
      timeout: 5000,
      maxRetries: 1,
      baseDelay: 50,
    });

    llmsService = new LlmsTxtService({ retryDelay: 50 });

    orchestrator = new DocsFallbackService(
      { kapaTimeout: 5000, llmsMaxResults: 3 },
      { kapaClient, llmsService }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ========================================================================
  // Layer 1 Success Tests
  // ========================================================================

  describe('search — Layer 1 (Kapa.ai) success', () => {
    it('should return Kapa.ai results when Layer 1 succeeds', async () => {
      vi.spyOn(kapaClient, 'search').mockResolvedValue({
        success: true,
        results: [
          {
            answer: 'To configure OAuth2, go to the Authentication tab.',
            source: 'https://docs.n8n.io/integrations/builtin/credentials/http-request/',
            confidence: 0.92,
          },
        ],
      });

      const result = await orchestrator.search('HTTP Request node OAuth2');

      expect(result.source).toBe('kapa_ai');
      expect(result.content).toContain('OAuth2');
      expect(result.confidence).toBe(0.92);
      expect(result.url).toBe('https://docs.n8n.io/integrations/builtin/credentials/http-request/');
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('should include source URL when available', async () => {
      vi.spyOn(kapaClient, 'search').mockResolvedValue({
        success: true,
        results: [
          {
            answer: 'Webhooks are configured in the Workflow Settings.',
            source: 'https://docs.n8n.io/integrations/builtin/nodes/n8n-nodes-base.webhook/',
          },
        ],
      });

      const result = await orchestrator.search('webhook configuration');

      expect(result.source).toBe('kapa_ai');
      expect(result.content).toContain('https://docs.n8n.io/integrations/builtin/nodes/n8n-nodes-base.webhook/');
    });

    it('should handle Kapa.ai results without confidence score', async () => {
      vi.spyOn(kapaClient, 'search').mockResolvedValue({
        success: true,
        results: [
          {
            answer: 'Use the Set node to modify data in your workflow.',
          },
        ],
      });

      const result = await orchestrator.search('how to modify data');

      expect(result.source).toBe('kapa_ai');
      expect(result.confidence).toBeUndefined();
    });
  });

  // ========================================================================
  // Layer 1 Fail → Layer 2 Success Tests
  // ========================================================================

  describe('search — Layer 1 fails, Layer 2 succeeds', () => {
    it('should fall back to llms.txt when Kapa.ai fails with error', async () => {
      vi.spyOn(kapaClient, 'search').mockRejectedValue(new Error('Network error'));

      vi.spyOn(llmsService, 'search').mockResolvedValue([
        {
          chunk: {
            title: 'HTTP Request Node',
            content: 'The HTTP Request node makes API calls to external services.',
            section: 'Nodes',
            url: 'https://docs.n8n.io/integrations/builtin/nodes/n8n-nodes-base.httprequest/',
          },
          score: 15,
        },
      ]);

      const result = await orchestrator.search('HTTP Request node');

      expect(result.source).toBe('llms_txt');
      expect(result.content).toContain('HTTP Request Node');
      expect(result.content).toContain('Relevance: 15');
      expect(result.url).toBe('https://docs.n8n.io/integrations/builtin/nodes/n8n-nodes-base.httprequest/');
    });

    it('should fall back to llms.txt when Kapa.ai returns empty results', async () => {
      vi.spyOn(kapaClient, 'search').mockResolvedValue({
        success: true,
        results: [],
      });

      vi.spyOn(llmsService, 'search').mockResolvedValue([
        {
          chunk: {
            title: 'Webhook Trigger',
            content: 'The Webhook node triggers workflow execution.',
            url: 'https://docs.n8n.io/integrations/builtin/nodes/n8n-nodes-base.webhook/',
          },
          score: 10,
        },
      ]);

      const result = await orchestrator.search('webhook trigger');

      expect(result.source).toBe('llms_txt');
      expect(result.content).toContain('Webhook Trigger');
    });

    it('should fall back to llms.txt when Kapa.ai returns empty answer', async () => {
      vi.spyOn(kapaClient, 'search').mockResolvedValue({
        success: true,
        results: [
          {
            answer: '',
            source: 'https://n8n.mcp.kapa.ai/',
          },
        ],
      });

      vi.spyOn(llmsService, 'search').mockResolvedValue([
        {
          chunk: {
            title: 'Schedule Trigger',
            content: 'The Schedule node runs workflows on a schedule.',
            url: 'https://docs.n8n.io/integrations/builtin/nodes/n8n-nodes-base.scheduletrigger/',
          },
          score: 8,
        },
      ]);

      const result = await orchestrator.search('schedule trigger');

      expect(result.source).toBe('llms_txt');
    });
  });

  // ========================================================================
  // Layer 1 & 2 Fail → Layer 3 Tests
  // ========================================================================

  describe('search — Layer 1 & 2 fail, returns docs link', () => {
    it('should return docs.n8n.io search link when both layers fail', async () => {
      vi.spyOn(kapaClient, 'search').mockRejectedValue(new Error('Connection refused'));
      vi.spyOn(llmsService, 'search').mockRejectedValue(new Error('Fetch failed'));

      const result = await orchestrator.search('obscure n8n feature xyz');

      expect(result.source).toBe('docs_link');
      expect(result.content).toContain('https://docs.n8n.io/search/?q=');
      expect(result.content).toContain('obscure');
      expect(result.url).toContain('docs.n8n.io');
    });

    it('should return docs link when Kapa returns empty and llms returns empty', async () => {
      vi.spyOn(kapaClient, 'search').mockResolvedValue({
        success: true,
        results: [],
      });
      vi.spyOn(llmsService, 'search').mockResolvedValue([]);

      const result = await orchestrator.search('nonexistent feature');

      expect(result.source).toBe('docs_link');
      expect(result.content).toContain('No results found');
      expect(result.content).toContain('docs.n8n.io/search/');
    });

    it('should properly encode special characters in docs URL', async () => {
      vi.spyOn(kapaClient, 'search').mockRejectedValue(new Error('timeout'));
      vi.spyOn(llmsService, 'search').mockRejectedValue(new Error('timeout'));

      const result = await orchestrator.search('how to use <webhook> & "credentials"');

      expect(result.url).toContain('how%20to%20use');
      expect(result.url).toContain('%3Cwebhook%3E');
    });
  });

  // ========================================================================
  // Direct Source Selection Tests
  // ========================================================================

  describe('searchKapaOnly', () => {
    it('should return result when Kapa.ai succeeds', async () => {
      vi.spyOn(kapaClient, 'search').mockResolvedValue({
        success: true,
        results: [
          {
            answer: 'Direct Kapa result.',
            confidence: 0.85,
          },
        ],
      });

      const result = await orchestrator.searchKapaOnly('test query');

      expect(result).not.toBeNull();
      expect(result!.source).toBe('kapa_ai');
      expect(result!.content).toContain('Direct Kapa result.');
    });

    it('should return null when Kapa.ai fails', async () => {
      vi.spyOn(kapaClient, 'search').mockRejectedValue(new Error('timeout'));

      const result = await orchestrator.searchKapaOnly('test query');

      expect(result).toBeNull();
    });

    it('should return null when Kapa.ai returns empty results', async () => {
      vi.spyOn(kapaClient, 'search').mockResolvedValue({
        success: true,
        results: [],
      });

      const result = await orchestrator.searchKapaOnly('test query');

      expect(result).toBeNull();
    });
  });

  describe('searchLlmsTxtOnly', () => {
    it('should return result when llms.txt succeeds', async () => {
      vi.spyOn(llmsService, 'search').mockResolvedValue([
        {
          chunk: {
            title: 'Credentials Management',
            content: 'Manage your credentials in the Credentials panel.',
            url: 'https://docs.n8n.io/credentials/',
          },
          score: 12,
        },
      ]);

      const result = await orchestrator.searchLlmsTxtOnly('credentials');

      expect(result).not.toBeNull();
      expect(result!.source).toBe('llms_txt');
      expect(result!.content).toContain('Credentials Management');
    });

    it('should return null when llms.txt fails', async () => {
      vi.spyOn(llmsService, 'search').mockRejectedValue(new Error('network error'));

      const result = await orchestrator.searchLlmsTxtOnly('credentials');

      expect(result).toBeNull();
    });

    it('should return null when llms.txt returns empty results', async () => {
      vi.spyOn(llmsService, 'search').mockResolvedValue([]);

      const result = await orchestrator.searchLlmsTxtOnly('credentials');

      expect(result).toBeNull();
    });
  });

  // ========================================================================
  // Logging and Observability Tests
  // ========================================================================

  describe('timing and observability', () => {
    it('should report elapsedMs for Layer 1 success', async () => {
      vi.spyOn(kapaClient, 'search').mockResolvedValue({
        success: true,
        results: [{ answer: 'Fast answer.' }],
      });

      const result = await orchestrator.search('query');

      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('should report elapsedMs for Layer 2 success', async () => {
      vi.spyOn(kapaClient, 'search').mockRejectedValue(new Error('fail'));
      vi.spyOn(llmsService, 'search').mockResolvedValue([
        { chunk: { title: 'Result', content: 'Content' }, score: 5 },
      ]);

      const result = await orchestrator.search('query');

      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('should report elapsedMs for Layer 3 fallback', async () => {
      vi.spyOn(kapaClient, 'search').mockRejectedValue(new Error('fail'));
      vi.spyOn(llmsService, 'search').mockRejectedValue(new Error('fail'));

      const result = await orchestrator.search('query');

      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ========================================================================
  // Singleton Tests
  // ========================================================================

  describe('singleton', () => {
    it('should return the same instance on repeated calls', () => {
      const instance1 = getDocsFallbackService();
      const instance2 = getDocsFallbackService();

      expect(instance1).toBe(instance2);
    });

    it('should return new instance after reset', () => {
      const instance1 = getDocsFallbackService();
      resetDocsFallbackService();
      const instance2 = getDocsFallbackService();

      expect(instance1).not.toBe(instance2);
    });
  });

  // ========================================================================
  // Constructor and Configuration Tests
  // ========================================================================

  describe('constructor', () => {
    it('should use default values when no options provided', () => {
      const service = new DocsFallbackService();
      expect(service).toBeDefined();
    });

    it('should accept custom options', () => {
      const service = new DocsFallbackService({
        kapaTimeout: 30000,
        llmsMaxResults: 10,
      });
      expect(service).toBeDefined();
    });

    it('should accept injected dependencies', () => {
      const mockKapa = new KapaAiClient();
      const mockLlms = new LlmsTxtService();

      const service = new DocsFallbackService({}, { kapaClient: mockKapa, llmsService: mockLlms });
      expect(service).toBeDefined();
    });
  });

  // ========================================================================
  // Edge Cases
  // ========================================================================

  describe('edge cases', () => {
    it('should handle Kapa.ai returning multiple results but uses first', async () => {
      vi.spyOn(kapaClient, 'search').mockResolvedValue({
        success: true,
        results: [
          { answer: 'First answer.', confidence: 0.9 },
          { answer: 'Second answer.', confidence: 0.7 },
        ],
      });

      const result = await orchestrator.search('query');

      expect(result.source).toBe('kapa_ai');
      expect(result.content).toContain('First answer.');
    });

    it('should handle llms.txt results with section information', async () => {
      vi.spyOn(kapaClient, 'search').mockRejectedValue(new Error('fail'));
      vi.spyOn(llmsService, 'search').mockResolvedValue([
        {
          chunk: {
            title: 'HTTP Node',
            content: 'Makes HTTP requests.',
            section: 'Built-in Nodes',
            url: 'https://docs.n8n.io/nodes/http/',
          },
          score: 20,
        },
      ]);

      const result = await orchestrator.search('http node');

      expect(result.content).toContain('Built-in Nodes');
      expect(result.content).toContain('Relevance: 20');
    });

    it('should handle llms.txt results without URL', async () => {
      vi.spyOn(kapaClient, 'search').mockRejectedValue(new Error('fail'));
      vi.spyOn(llmsService, 'search').mockResolvedValue([
        {
          chunk: {
            title: 'No URL Node',
            content: 'Some content without a URL.',
          },
          score: 5,
        },
      ]);

      const result = await orchestrator.search('no url');

      expect(result.source).toBe('llms_txt');
      expect(result.content).toContain('No URL Node');
    });

    it('should truncate llms.txt content over 500 characters', async () => {
      vi.spyOn(kapaClient, 'search').mockRejectedValue(new Error('fail'));
      const longContent = 'x'.repeat(600);
      vi.spyOn(llmsService, 'search').mockResolvedValue([
        {
          chunk: {
            title: 'Long Content',
            content: longContent,
            url: 'https://docs.n8n.io/long/',
          },
          score: 3,
        },
      ]);

      const result = await orchestrator.search('long content');

      expect(result.content).toContain('...');
      expect(result.content.length).toBeLessThan(600 + 100); // content + formatting overhead
    });
  });
});
