/**
 * Tests for AI Workflow Handlers (handleCreateFromPrompt, handleSuggestNodes).
 *
 * Tests cover:
 * - Input validation (Zod errors)
 * - Successful workflow creation flow
 * - Node suggestion flows (category, existingNodes, taskDescription)
 * - Error handling (API failures, no nodes matched, missing config)
 * - Warnings generation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleCreateFromPrompt, handleSuggestNodes } from '../../../src/mcp/handlers-ai-workflow';

// Mock dependencies
const mockMapKeywordsToNodes = vi.fn();
const mockGenerateFromNodes = vi.fn();
const mockGetTemplates = vi.fn();
const mockAnalyzeAndSuggest = vi.fn();
const mockSuggestFromTask = vi.fn();
const mockCreateWorkflowFn = vi.fn();
const mockActivateWorkflowFn = vi.fn();

vi.mock('../../../src/services/keyword-mapper', () => ({
  getKeywordMapper: vi.fn(() => ({
    mapKeywordsToNodes: mockMapKeywordsToNodes,
  })),
}));

vi.mock('../../../src/services/workflow-spec-generator', () => ({
  getWorkflowSpecGenerator: vi.fn(() => ({
    generateFromNodes: mockGenerateFromNodes,
  })),
}));

vi.mock('../../../src/services/node-suggester', () => ({
  getNodeSuggester: vi.fn(() => ({
    getTemplates: mockGetTemplates,
    analyzeAndSuggest: mockAnalyzeAndSuggest,
    suggestFromTask: mockSuggestFromTask,
  })),
}));

vi.mock('../../../src/config/n8n-api', () => ({
  getN8nApiConfig: vi.fn(),
  getN8nApiConfigFromContext: vi.fn(),
}));

vi.mock('../../../src/services/n8n-api-client', () => ({
  N8nApiClient: vi.fn().mockImplementation(() => ({
    createWorkflow: vi.fn(),
    activateWorkflow: vi.fn(),
  })),
}));

vi.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import mocked modules
import { getKeywordMapper } from '../../../src/services/keyword-mapper';
import { getWorkflowSpecGenerator } from '../../../src/services/workflow-spec-generator';
import { getNodeSuggester } from '../../../src/services/node-suggester';
import { getN8nApiConfig, getN8nApiConfigFromContext } from '../../../src/config/n8n-api';
import { N8nApiClient } from '../../../src/services/n8n-api-client';

// Stable mock instances
const mockMapperInstance = { mapKeywordsToNodes: mockMapKeywordsToNodes };
const mockSpecGeneratorInstance = { generateFromNodes: mockGenerateFromNodes };
const mockSuggesterInstance = { getTemplates: mockGetTemplates, analyzeAndSuggest: mockAnalyzeAndSuggest, suggestFromTask: mockSuggestFromTask };

const mockMapper = getKeywordMapper as ReturnType<typeof vi.fn>;
const mockSpecGenerator = getWorkflowSpecGenerator as ReturnType<typeof vi.fn>;
const mockSuggester = getNodeSuggester as ReturnType<typeof vi.fn>;
const mockGetConfig = getN8nApiConfig as ReturnType<typeof vi.fn>;
const mockGetConfigFromContext = getN8nApiConfigFromContext as ReturnType<typeof vi.fn>;
const MockN8nApiClient = N8nApiClient as ReturnType<typeof vi.fn>;

describe('handlers-ai-workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfig.mockReturnValue({
      baseUrl: 'http://localhost:5678/api/v1',
      apiKey: 'test-api-key',
    });
    mockGetConfigFromContext.mockReturnValue(null);
    mockMapper.mockReturnValue(mockMapperInstance);
    mockSpecGenerator.mockReturnValue(mockSpecGeneratorInstance);
    mockSuggester.mockReturnValue(mockSuggesterInstance);
    MockN8nApiClient.mockImplementation(() => ({
      createWorkflow: mockCreateWorkflowFn,
      activateWorkflow: mockActivateWorkflowFn,
    }));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('handleCreateFromPrompt', () => {
    it('should return validation error when description is missing', async () => {
      const result = await handleCreateFromPrompt({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
    });

    it('should return validation error when description is too short', async () => {
      const result = await handleCreateFromPrompt({ description: 'short' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
    });

    it('should return error when no nodes match the description', async () => {
      mockMapperInstance.mapKeywordsToNodes.mockReturnValue([]);

      const result = await handleCreateFromPrompt({
        description: 'some unknown description',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No nodes matched');
    });

    it('should create workflow successfully with valid description', async () => {
      const mappedNodes = [
        {
          nodeType: 'n8n-nodes-base.webhook',
          nodeName: 'Webhook',
          category: 'trigger',
          confidence: 0.9,
        },
        {
          nodeType: 'n8n-nodes-base.httpRequest',
          nodeName: 'HTTP Request',
          category: 'action',
          confidence: 0.8,
        },
      ];

      mockMapperInstance.mapKeywordsToNodes.mockReturnValue(mappedNodes);
      mockSpecGeneratorInstance.generateFromNodes.mockReturnValue({
        name: 'Test Workflow',
        nodes: [
          { id: '1', name: 'Webhook', type: 'n8n-nodes-base.webhook', position: [0, 0] },
          { id: '2', name: 'HTTP Request', type: 'n8n-nodes-base.httpRequest', position: [300, 0] },
        ],
        connections: { '1': { main: [[{ node: '2', type: 'main', index: 0 }]] } },
        settings: {},
      });

      const mockCreateWorkflow = vi.fn().mockResolvedValue({ id: 'wf-123' });
      MockN8nApiClient.mockImplementation(() => ({
        createWorkflow: mockCreateWorkflow,
        activateWorkflow: vi.fn().mockResolvedValue(undefined),
      }));

      const result = await handleCreateFromPrompt({
        description: 'When webhook receives data, make HTTP request',
        workflowName: 'My Workflow',
      });

      expect(result.success).toBe(true);
      expect(result.data.success).toBe(true);
      expect(result.data.workflowName).toBe('Test Workflow');
      expect(result.data.nodesCreated).toBe(2);
      expect(result.data.activationStatus).toBe('inactive');
      expect(result.data.mappedNodes).toHaveLength(2);
    });

    it('should activate workflow when activate is true', async () => {
      const mappedNodes = [
        {
          nodeType: 'n8n-nodes-base.webhook',
          nodeName: 'Webhook',
          category: 'trigger',
          confidence: 0.9,
        },
      ];

      mockMapperInstance.mapKeywordsToNodes.mockReturnValue(mappedNodes);
      mockSpecGeneratorInstance.generateFromNodes.mockReturnValue({
        name: 'Test Workflow',
        nodes: [{ id: '1', name: 'Webhook', type: 'n8n-nodes-base.webhook', position: [0, 0] }],
        connections: {},
        settings: {},
      });

      const mockActivateWorkflow = vi.fn().mockResolvedValue(undefined);
      MockN8nApiClient.mockImplementation(() => ({
        createWorkflow: vi.fn().mockResolvedValue({ id: 'wf-456' }),
        activateWorkflow: mockActivateWorkflow,
      }));

      const result = await handleCreateFromPrompt({
        description: 'webhook trigger',
        activate: true,
      });

      expect(result.data.activationStatus).toBe('active');
      expect(mockActivateWorkflow).toHaveBeenCalledWith('wf-456');
    });

    it('should add warning when no trigger node is detected', async () => {
      const mappedNodes = [
        {
          nodeType: 'n8n-nodes-base.httpRequest',
          nodeName: 'HTTP Request',
          category: 'action',
          confidence: 0.8,
        },
      ];

      mockMapperInstance.mapKeywordsToNodes.mockReturnValue(mappedNodes);
      mockSpecGeneratorInstance.generateFromNodes.mockReturnValue({
        name: 'No Trigger Workflow',
        nodes: [{ id: '1', name: 'HTTP Request', type: 'n8n-nodes-base.httpRequest', position: [0, 0] }],
        connections: {},
        settings: {},
      });
      MockN8nApiClient.mockImplementation(() => ({
        createWorkflow: vi.fn().mockResolvedValue({ id: 'wf-789' }),
        activateWorkflow: vi.fn().mockResolvedValue(undefined),
      }));

      const result = await handleCreateFromPrompt({
        description: 'make an HTTP request to an external API endpoint',
      });

      expect(result.data.warnings.length).toBeGreaterThan(0);
      expect(result.data.warnings[0]).toContain('No trigger');
    });

    it('should add warning for low confidence mappings', async () => {
      const mappedNodes = [
        {
          nodeType: 'n8n-nodes-base.webhook',
          nodeName: 'Webhook',
          category: 'trigger',
          confidence: 0.2,
        },
      ];

      mockMapperInstance.mapKeywordsToNodes.mockReturnValue(mappedNodes);
      mockSpecGeneratorInstance.generateFromNodes.mockReturnValue({
        name: 'Low Confidence Workflow',
        nodes: [{ id: '1', name: 'Webhook', type: 'n8n-nodes-base.webhook', position: [0, 0] }],
        connections: {},
        settings: {},
      });
      MockN8nApiClient.mockImplementation(() => ({
        createWorkflow: vi.fn().mockResolvedValue({ id: 'wf-low' }),
        activateWorkflow: vi.fn().mockResolvedValue(undefined),
      }));

      const result = await handleCreateFromPrompt({
        description: 'webhook trigger endpoint',
      });

      expect(result.data.warnings.length).toBeGreaterThan(0);
      expect(result.data.warnings[0]).toContain('Low confidence');
    });

    it('should handle n8n API returning empty response', async () => {
      const mappedNodes = [
        {
          nodeType: 'n8n-nodes-base.webhook',
          nodeName: 'Webhook',
          category: 'trigger',
          confidence: 0.9,
        },
      ];

      mockMapperInstance.mapKeywordsToNodes.mockReturnValue(mappedNodes);
      mockSpecGeneratorInstance.generateFromNodes.mockReturnValue({
        name: 'Test',
        nodes: [{ id: '1', name: 'Webhook', type: 'n8n-nodes-base.webhook', position: [0, 0] }],
        connections: {},
        settings: {},
      });
      MockN8nApiClient.mockImplementation(() => ({
        createWorkflow: vi.fn().mockResolvedValue({}),
        activateWorkflow: vi.fn().mockResolvedValue(undefined),
      }));

      const result = await handleCreateFromPrompt({
        description: 'webhook trigger endpoint',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty response');
    });

    it('should handle API not configured', async () => {
      mockGetConfig.mockReturnValue(null);

      const result = await handleCreateFromPrompt({
        description: 'webhook trigger and email notification',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Workflow creation failed');
    });

    it('should handle activation failure gracefully', async () => {
      const mappedNodes = [
        {
          nodeType: 'n8n-nodes-base.webhook',
          nodeName: 'Webhook',
          category: 'trigger',
          confidence: 0.9,
        },
      ];

      mockMapperInstance.mapKeywordsToNodes.mockReturnValue(mappedNodes);
      mockSpecGeneratorInstance.generateFromNodes.mockReturnValue({
        name: 'Activation Fail',
        nodes: [{ id: '1', name: 'Webhook', type: 'n8n-nodes-base.webhook', position: [0, 0] }],
        connections: {},
        settings: {},
      });
      MockN8nApiClient.mockImplementation(() => ({
        createWorkflow: vi.fn().mockResolvedValue({ id: 'wf-act' }),
        activateWorkflow: vi.fn().mockRejectedValue(new Error('Activation failed')),
      }));

      const result = await handleCreateFromPrompt({
        description: 'webhook trigger endpoint',
        activate: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.activationStatus).toBe('inactive');
    });
  });

  describe('handleSuggestNodes', () => {
    it('should return templates when category is provided', async () => {
      const templates = [
        {
          name: 'Webhook Template',
          category: 'webhook',
          description: 'Basic webhook workflow',
          nodes: [
            { type: 'n8n-nodes-base.webhook', name: 'Webhook', position: [0, 0] },
          ],
        },
      ];
      mockSuggesterInstance.getTemplates.mockReturnValue(templates);

      const result = await handleSuggestNodes({ category: 'webhook' });

      expect(result.success).toBe(true);
      expect(result.data.templates).toHaveLength(1);
      expect(result.data.templates![0].name).toBe('Webhook Template');
    });

    it('should return error for unknown category', async () => {
      mockSuggesterInstance.getTemplates.mockReturnValue([]);

      const result = await handleSuggestNodes({ category: 'webhook' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No templates found');
    });

    it('should suggest complementary nodes for existingNodes', async () => {
      const suggestions = [
        {
          nodeType: 'n8n-nodes-base.slack',
          nodeName: 'Slack',
          category: 'action',
          reason: 'Complements webhook for notifications',
          confidence: 0.85,
          useCase: 'Send notifications',
        },
      ];
      mockSuggesterInstance.analyzeAndSuggest.mockReturnValue(suggestions);

      const result = await handleSuggestNodes({
        existingNodes: ['n8n-nodes-base.webhook'],
      });

      expect(result.success).toBe(true);
      expect(result.data.suggestions).toHaveLength(1);
    });

    it('should suggest nodes from task description', async () => {
      const suggestions = [
        {
          nodeType: 'n8n-nodes-base.gmail',
          nodeName: 'Gmail',
          category: 'action',
          reason: 'Send email notifications',
          confidence: 0.9,
          useCase: 'Email',
        },
      ];
      mockSuggesterInstance.suggestFromTask.mockReturnValue(suggestions);

      const result = await handleSuggestNodes({
        taskDescription: 'send email when webhook receives data',
      });

      expect(result.success).toBe(true);
      expect(result.data.suggestions).toHaveLength(1);
    });

    it('should return error when no input provided', async () => {
      const result = await handleSuggestNodes({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('must be provided');
    });

    it('should respect maxResults limit', async () => {
      const suggestions = Array.from({ length: 10 }, (_, i) => ({
        nodeType: `n8n-nodes-base.node${i}`,
        nodeName: `Node ${i}`,
        category: 'action',
        reason: `Reason ${i}`,
        confidence: 0.9,
        useCase: `Use case ${i}`,
      }));
      mockSuggesterInstance.analyzeAndSuggest.mockReturnValue(suggestions);

      const result = await handleSuggestNodes({
        existingNodes: ['n8n-nodes-base.webhook'],
        maxResults: 3,
      });

      expect(result.data.suggestions).toHaveLength(3);
    });

    it('should return validation error for invalid category', async () => {
      const result = await handleSuggestNodes({ category: 'invalid-category' });

      expect(result.success).toBe(false);
    });

    it('should return empty suggestions when suggester returns empty', async () => {
      mockSuggesterInstance.analyzeAndSuggest.mockReturnValue([]);

      const result = await handleSuggestNodes({
        existingNodes: ['n8n-nodes-base.webhook'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No additional node suggestions');
    });

    it('should return empty suggestions for task with no matches', async () => {
      mockSuggesterInstance.suggestFromTask.mockReturnValue([]);

      const result = await handleSuggestNodes({
        taskDescription: 'unknown task xyz',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No node suggestions');
    });
  });
});
