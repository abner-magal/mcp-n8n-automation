import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  KapaAiClient,
  KapaAiConnectionError,
  KapaAiAuthenticationError,
  KapaAiRateLimitError,
  getKapaAiClient,
  resetKapaAiClient,
} from '../../../src/services/kapa-ai-client';

// ========================================================================
// Mock Setup
// ========================================================================

const mockFetch = vi.fn();

describe('KapaAiClient', () => {
  let client: KapaAiClient;

  beforeEach(() => {
    mockFetch.mockReset();
    resetKapaAiClient();
    vi.stubGlobal('fetch', mockFetch);
    client = new KapaAiClient({
      serverUrl: 'https://n8n.mcp.kapa.ai/',
      timeout: 5000,
      maxRetries: 2,
      baseDelay: 100,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ========================================================================
  // Constructor Tests
  // ========================================================================

  describe('constructor', () => {
    it('should use default values when no config provided', () => {
      const defaultClient = new KapaAiClient();
      expect(defaultClient).toBeDefined();
    });

    it('should use custom config when provided', () => {
      const customClient = new KapaAiClient({
        serverUrl: 'https://custom.example.com/',
        timeout: 10000,
        maxRetries: 5,
      });
      expect(customClient).toBeDefined();
    });
  });

  // ========================================================================
  // Search Success Cases
  // ========================================================================

  describe('search', () => {
    it('should return successful response with answer', async () => {
      const mockResponse = {
        answer: 'To configure OAuth2 in HTTP Request node, go to Authentication tab and select OAuth2.',
        sources: [{ url: 'https://docs.n8n.io/integrations/builtin/credentials/http-request/' }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.search('HTTP Request node OAuth2');

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].answer).toContain('OAuth2');
      expect(result.results[0].source).toBe('https://n8n.mcp.kapa.ai/');
    });

    it('should handle response with "response" field instead of "answer"', async () => {
      const mockResponse = {
        response: 'Use the Slack node to send messages to channels.',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.search('Slack node send message');

      expect(result.success).toBe(true);
      expect(result.results[0].answer).toContain('Slack');
    });

    it('should handle response with "text" field', async () => {
      const mockResponse = {
        text: 'Webhook nodes can receive POST requests.',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.search('webhook POST');

      expect(result.success).toBe(true);
      expect(result.results[0].answer).toContain('Webhook');
    });

    it('should return empty results when no answer found', async () => {
      const mockResponse = {
        unknown_field: 'no recognizable data',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.search('test query');

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
    });
  });

  // ========================================================================
  // Search Error Cases
  // ========================================================================

  describe('search errors', () => {
    it('should return error for empty query', async () => {
      const result = await client.search('');

      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    it('should handle connection error', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      const result = await client.search('test query');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Kapa.ai connection error');
    });

    it('should handle timeout', async () => {
      const fastClient = new KapaAiClient({
        timeout: 10,
        maxRetries: 0,
      });

      mockFetch.mockImplementationOnce(
        () => new Promise((_, reject) => setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 50))
      );

      const result = await fastClient.search('test query');

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should handle authentication error (401)', async () => {
      const errorResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: { get: vi.fn().mockReturnValue(null) },
      };

      mockFetch.mockResolvedValue(errorResponse);

      const result = await client.search('test query');

      expect(result.success).toBe(false);
      expect(result.error).toContain('authentication failed');
    });

    it('should handle rate limit error (429)', async () => {
      const errorResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: { get: vi.fn().mockReturnValue('60') },
      };

      mockFetch.mockResolvedValue(errorResponse);

      const result = await client.search('test query');

      expect(result.success).toBe(false);
      expect(result.error).toContain('rate limit');
    });

    it('should handle server error (500)', async () => {
      const errorResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: { get: vi.fn().mockReturnValue(null) },
      };

      mockFetch.mockResolvedValue(errorResponse);

      const result = await client.search('test query');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Server error');
    });
  });

  // ========================================================================
  // Retry Logic Tests
  // ========================================================================

  describe('retry logic', () => {
    it('should retry on transient errors and succeed', async () => {
      const noRetryClient = new KapaAiClient({
        maxRetries: 2,
        baseDelay: 10,
      });

      mockFetch
        .mockRejectedValueOnce(new TypeError('network error'))
        .mockRejectedValueOnce(new TypeError('network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ answer: 'Success after retry' }),
        });

      const result = await noRetryClient.search('test query');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on authentication errors', async () => {
      const authErrorClient = new KapaAiClient({
        maxRetries: 3,
        baseDelay: 10,
      });

      const errorResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: { get: vi.fn().mockReturnValue(null) },
      };

      mockFetch.mockResolvedValue(errorResponse);

      await authErrorClient.search('test query');

      // Should only be called once since auth errors aren't retried
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should exhaust retries and return error', async () => {
      const quickRetryClient = new KapaAiClient({
        maxRetries: 1,
        baseDelay: 10,
      });

      mockFetch
        .mockRejectedValueOnce(new TypeError('network error'))
        .mockRejectedValueOnce(new TypeError('network error'));

      const result = await quickRetryClient.search('test query');

      expect(result.success).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ========================================================================
  // Singleton Tests
  // ========================================================================

  describe('getKapaAiClient', () => {
    it('should return same instance on multiple calls', () => {
      const client1 = getKapaAiClient();
      const client2 = getKapaAiClient();

      expect(client1).toBe(client2);
    });

    it('should reset singleton when resetKapaAiClient is called', () => {
      const client1 = getKapaAiClient();
      resetKapaAiClient();
      const client2 = getKapaAiClient();

      expect(client1).not.toBe(client2);
    });
  });

  // ========================================================================
  // Edge Cases
  // ========================================================================

  describe('edge cases', () => {
    it('should handle response with sources array but no answer', async () => {
      const mockResponse = {
        sources: [
          { content: 'First source content' },
          { text: 'Second source text' },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.search('test query');

      expect(result.success).toBe(true);
      expect(result.results[0].answer).toBe('First source content');
    });

    it('should handle response with unknown format gracefully', async () => {
      const mockResponse = {
        data: { nested: 'value' },
        metadata: { some: 'info' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.search('test query');

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
    });

    it('should trim whitespace from query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ answer: 'Trimmed query result' }),
      });

      const result = await client.search('  test query  ');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('test query'),
        })
      );
    });
  });
});
