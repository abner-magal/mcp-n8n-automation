/**
 * Tests for n8n_create_from_prompt MCP tool handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCreateFromPrompt } from '../../../src/mcp/handlers-ai-workflow';
import { resetKeywordMapper } from '../../../src/services/keyword-mapper';
import { resetWorkflowSpecGenerator } from '../../../src/services/workflow-spec-generator';
import type { McpToolResponse } from '../../../src/types/n8n-api';
import { N8nApiClient } from '../../../src/services/n8n-api-client';
import * as n8nApiConfigModule from '../../../src/config/n8n-api';

// ---------------------------------------------------------------------------
// Mock state
// ---------------------------------------------------------------------------

const mockCreateWorkflow = vi.fn();
const mockActivateWorkflow = vi.fn();
const mockApiConfig = {
  baseUrl: 'http://localhost:5678',
  apiKey: 'test-api-key',
  timeout: 30000,
  maxRetries: 3,
};

vi.mock('../../../src/services/n8n-api-client', () => ({
  N8nApiClient: vi.fn(),
}));

vi.mock('../../../src/config/n8n-api', () => ({
  getN8nApiConfig: vi.fn(),
  getN8nApiConfigFromContext: vi.fn(),
  isN8nApiConfigured: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetSingletons(): void {
  resetKeywordMapper();
  resetWorkflowSpecGenerator();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleCreateFromPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSingletons();

    // Setup API config mocks
    vi.spyOn(n8nApiConfigModule, 'getN8nApiConfig').mockReturnValue(mockApiConfig);
    vi.spyOn(n8nApiConfigModule, 'getN8nApiConfigFromContext').mockReturnValue(mockApiConfig);

    // Setup API client mocks
    vi.mocked(N8nApiClient).mockImplementation(
      () =>
        ({
          createWorkflow: mockCreateWorkflow,
          activateWorkflow: mockActivateWorkflow,
        }) as unknown as N8nApiClient
    );

    mockCreateWorkflow.mockResolvedValue({
      id: 'wf-123',
      name: 'Auto-generated Workflow',
      active: false,
      nodes: [],
      connections: {},
    });
    mockActivateWorkflow.mockResolvedValue(undefined);
  });

  // --- 1. Successful workflow creation from prompt ---
  describe('successful workflow creation', () => {
    it('should create a workflow from a valid description', async () => {
      const result = await handleCreateFromPrompt({
        description:
          'When a webhook receives data, send an email notification and log it to Google Sheets',
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect(data).toBeDefined();
      expect(data?.workflowId).toBe('wf-123');
      expect((data?.nodesCreated as number)).toBeGreaterThan(0);
      expect(result.message).toContain('created');
    });

    it('should call n8n API with correct workflow structure', async () => {
      await handleCreateFromPrompt({
        description: 'On schedule trigger, make an HTTP request',
      });

      expect(mockCreateWorkflow).toHaveBeenCalledTimes(1);
      const callArg = mockCreateWorkflow.mock.calls[0][0];
      expect(callArg).toHaveProperty('name');
      expect(callArg).toHaveProperty('nodes');
      expect(callArg).toHaveProperty('connections');
      expect(Array.isArray(callArg.nodes)).toBe(true);
      expect(callArg.nodes.length).toBeGreaterThan(0);
    });

    it('should return mapped nodes with correct structure', async () => {
      const result = await handleCreateFromPrompt({
        description: 'Webhook triggers and sends to Slack',
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect(data).toBeDefined();
      const mappedNodes = data?.mappedNodes as Array<Record<string, unknown>> | undefined;
      expect(mappedNodes).toBeDefined();
      expect(Array.isArray(mappedNodes)).toBe(true);
      expect(mappedNodes!.length).toBeGreaterThan(0);

      for (const node of mappedNodes!) {
        expect(node).toHaveProperty('nodeType');
        expect(node).toHaveProperty('nodeName');
        expect(node).toHaveProperty('category');
        expect(node).toHaveProperty('confidence');
        expect(typeof node.confidence).toBe('number');
        expect(node.confidence as number).toBeGreaterThanOrEqual(0);
        expect(node.confidence as number).toBeLessThanOrEqual(1);
      }
    });
  });

  // --- 2. Keyword mapping accuracy ---
  describe('keyword mapping accuracy', () => {
    it('should map "webhook" keyword to webhook node type', async () => {
      const result = await handleCreateFromPrompt({
        description: 'Webhook receives data',
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      const mappedNodes = data?.mappedNodes as Array<Record<string, unknown>> | undefined;
      const hasWebhook = mappedNodes!.some(
        (n) => (n.nodeType as string).includes('webhook')
      );
      expect(hasWebhook).toBe(true);
    });

    it('should map "slack" keyword to Slack node type', async () => {
      const result = await handleCreateFromPrompt({
        description: 'Send a message to Slack',
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      const mappedNodes = data?.mappedNodes as Array<Record<string, unknown>> | undefined;
      const hasSlack = mappedNodes!.some(
        (n) => (n.nodeType as string).includes('slack')
      );
      expect(hasSlack).toBe(true);
    });

    it('should map multiple keywords across categories', async () => {
      const result = await handleCreateFromPrompt({
        description:
          'On webhook trigger, query postgres database, then send email',
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      const mappedNodes = data?.mappedNodes as Array<Record<string, unknown>> | undefined;
      const categories = new Set(mappedNodes!.map((n) => n.category as string));
      expect(categories.size).toBeGreaterThanOrEqual(2);
    });
  });

  // --- 3. Workflow name auto-generation ---
  describe('workflow name auto-generation', () => {
    it('should auto-generate workflow name when not provided', async () => {
      const result = await handleCreateFromPrompt({
        description: 'Webhook receives data and sends to Slack',
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect(data?.workflowName).toBeDefined();
      expect(typeof data?.workflowName).toBe('string');
      expect((data?.workflowName as string).length).toBeGreaterThan(0);
    });

    it('should use provided workflowName when specified', async () => {
      const customName = 'My Custom Workflow';
      const result = await handleCreateFromPrompt({
        description: 'Webhook and HTTP request',
        workflowName: customName,
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect(data?.workflowName).toBe(customName);
    });

    it('should pass custom name to n8n API', async () => {
      await handleCreateFromPrompt({
        description: 'Webhook and HTTP request',
        workflowName: 'Custom API Workflow',
      });

      const callArg = mockCreateWorkflow.mock.calls[0][0];
      expect(callArg.name).toBe('Custom API Workflow');
    });
  });

  // --- 4. Activation flow ---
  describe('activation flow', () => {
    it('should NOT activate workflow when activate is false (default)', async () => {
      await handleCreateFromPrompt({
        description: 'Webhook receives data',
      });

      expect(mockActivateWorkflow).not.toHaveBeenCalled();
      const result = await handleCreateFromPrompt({
        description: 'Webhook receives data',
      });
      const data = result.data as Record<string, unknown> | undefined;
      expect(data?.activationStatus).toBe('inactive');
    });

    it('should activate workflow when activate is true', async () => {
      const result = await handleCreateFromPrompt({
        description: 'Webhook receives data',
        activate: true,
      });

      expect(mockActivateWorkflow).toHaveBeenCalledTimes(1);
      expect(mockActivateWorkflow).toHaveBeenCalledWith('wf-123');
      const data = result.data as Record<string, unknown> | undefined;
      expect(data?.activationStatus).toBe('active');
    });

    it('should still succeed if activation fails after creation', async () => {
      mockActivateWorkflow.mockRejectedValue(new Error('Activation timeout'));

      const result = await handleCreateFromPrompt({
        description: 'Webhook receives data',
        activate: true,
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect(data?.workflowId).toBe('wf-123');
      expect(data?.activationStatus).toBe('inactive');
    });
  });

  // --- 5. Error handling ---
  describe('error handling', () => {
    it('should return error for description too short (< 10 chars)', async () => {
      const result = await handleCreateFromPrompt({
        description: 'Short',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error when input is missing description', async () => {
      const result = await handleCreateFromPrompt({});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error when n8n API fails', async () => {
      mockCreateWorkflow.mockRejectedValue(
        new Error('n8n API: Connection refused')
      );

      const result = await handleCreateFromPrompt({
        description: 'Webhook receives data',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Workflow creation failed');
    });

    it('should return error when n8n API returns empty response', async () => {
      mockCreateWorkflow.mockResolvedValue({});

      const result = await handleCreateFromPrompt({
        description: 'Webhook receives data',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty response');
    });
  });

  // --- 6. Warnings generation ---
  describe('warnings generation', () => {
    it('should warn when no trigger node is detected', async () => {
      const result = await handleCreateFromPrompt({
        description: 'Send email and log to Google Sheets',
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      const warnings = data?.warnings as string[] | undefined;
      expect(warnings).toBeDefined();
      const hasTriggerWarning = warnings!.some((w) =>
        w.toLowerCase().includes('trigger')
      );
      expect(hasTriggerWarning).toBe(true);
    });

    it('should return warnings as an array', async () => {
      const result = await handleCreateFromPrompt({
        description: 'Webhook triggers, makes HTTP request, sends to Slack',
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      const warnings = data?.warnings as string[] | undefined;
      expect(Array.isArray(warnings)).toBe(true);
    });

    it('should include mapped nodes even when warnings exist', async () => {
      const result = await handleCreateFromPrompt({
        description: 'Send email and log to Google Sheets',
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect(data?.mappedNodes).toBeDefined();
      expect(Array.isArray(data?.mappedNodes)).toBe(true);
      expect((data?.nodesCreated as number)).toBeGreaterThan(0);
    });
  });
});
