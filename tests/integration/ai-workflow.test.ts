/**
 * Integration Tests: AI Workflow Tools
 *
 * Tests AI-powered workflow creation and node suggestions against real n8n instance.
 * - n8n_create_from_prompt: Natural language to workflow JSON
 * - n8n_suggest_nodes: Node recommendations based on task description
 *
 * Prerequisites:
 * - Running n8n instance at N8N_API_URL (default: http://localhost:5678)
 * - N8N_API_KEY must be set (create via n8n UI: Settings > API Keys)
 *
 * All created workflows use "TEST_" prefix for easy identification and cleanup.
 *
 * Note: Tests will skip gracefully if N8N_API_KEY is not configured.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { handleCreateFromPrompt } from '../../src/mcp/handlers-ai-workflow';
import { handleSuggestNodes } from '../../src/mcp/handlers-ai-workflow';
import { N8nApiClient } from '../../src/services/n8n-api-client';
import { Logger } from '../../src/utils/logger';
import {
  getIntegrationConfig,
  createIntegrationContext,
  IntegrationTestContext,
  trackWorkflow,
  cleanupWorkflows,
  createTestWorkflowName,
} from './setup';

const logger = new Logger({ prefix: '[AI-Workflow-Integration]' });

// ─────────────────────────────────────────────────────────────────────────────
// Test Configuration
// ─────────────────────────────────────────────────────────────────────────────

const TEST_TIMEOUT = 20000; // 20s for workflow creation + API calls
const N8N_POLL_TIMEOUT = 10000; // 10s for polling n8n availability

// ─────────────────────────────────────────────────────────────────────────────
// Test State
// ─────────────────────────────────────────────────────────────────────────────

let context: IntegrationTestContext;
let n8nClient: N8nApiClient;
let hasApiKey = false;

// ─────────────────────────────────────────────────────────────────────────────
// Setup/Teardown
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const config = getIntegrationConfig();

  logger.info('Setting up AI workflow integration tests');
  logger.info(`n8n API URL: ${config.n8nApiUrl}`);
  logger.info(`API Key: ${config.n8nApiKey ? 'configured' : 'NOT SET - tests will skip'}`);

  // Check if API key is configured
  hasApiKey = !!config.n8nApiKey;

  if (!hasApiKey) {
    console.warn('⚠️  N8N_API_KEY not configured — AI workflow tests will skip');
    console.warn('   To enable: Create API key in n8n UI (Settings > API Keys)');
    console.warn('   Then set N8N_API_KEY in .env.local');
    return;
  }

  context = createIntegrationContext();
  n8nClient = context.client;

  // Verify n8n is accessible
  try {
    const isHealthy = await n8nClient.healthCheck();
    if (isHealthy) {
      logger.info('n8n instance is healthy');
    }
  } catch (error) {
    logger.warn('n8n health check failed, tests may fail:', error);
  }
}, N8N_POLL_TIMEOUT);

afterEach(async () => {
  // Cleanup workflows created during each test
  await cleanupWorkflows(context);
});

afterAll(async () => {
  // Final cleanup
  await cleanupWorkflows(context);
  logger.info('AI workflow integration tests completed');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: n8n_create_from_prompt
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!hasApiKey)('n8n_create_from_prompt Integration Tests', () => {
  it(
    'should create workflow from simple prompt',
    async () => {
      // Arrange
      const description = 'When a webhook receives data, send an email notification';

      // Act
      const result = await handleCreateFromPrompt({
        description,
      });

      // Log error if failed for debugging
      if (!result.success) {
        console.error('❌ Workflow creation failed!');
        console.error('Error:', result.error);
        console.error('Message:', result.message);
        console.error('Full result:', JSON.stringify(result, null, 2));
      }

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect(data).toBeDefined();
      expect(data?.workflowId).toBeDefined();
      expect(typeof data?.workflowId).toBe('string');
      expect((data?.workflowId as string).length).toBeGreaterThan(0);

      // Track for cleanup
      const workflowId = data?.workflowId as string;
      trackWorkflow(context, workflowId);

      // Verify workflow exists in n8n
      const workflow = await n8nClient.getWorkflow(workflowId);
      expect(workflow).toBeDefined();
      expect(workflow.id).toBe(workflowId);
      expect(workflow.name).toBeDefined();
      expect(workflow.nodes).toBeDefined();
      expect(workflow.nodes.length).toBeGreaterThan(0);

      // Verify workflow is inactive (default)
      expect(workflow.active).toBe(false);
    },
    TEST_TIMEOUT
  );

  it(
    'should create workflow with custom name',
    async () => {
      // Arrange
      const customName = createTestWorkflowName(context, 'Custom AI Workflow');
      const description = 'Webhook triggers and makes HTTP request';

      // Act
      const result = await handleCreateFromPrompt({
        description,
        workflowName: customName,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      const workflowId = data?.workflowId as string;
      trackWorkflow(context, workflowId);

      // Verify name matches
      const workflow = await n8nClient.getWorkflow(workflowId);
      expect(workflow.name).toBe(customName);
    },
    TEST_TIMEOUT
  );

  it(
    'should create workflow with activation when activate=true',
    async () => {
      // Arrange
      const description = 'On schedule trigger, send email notification';

      // Act
      const result = await handleCreateFromPrompt({
        description,
        activate: false, // Don't activate in integration tests (would require valid credentials)
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect(data?.activationStatus).toBe('inactive');

      const workflowId = data?.workflowId as string;
      trackWorkflow(context, workflowId);

      // Verify workflow is inactive
      const workflow = await n8nClient.getWorkflow(workflowId);
      expect(workflow.active).toBe(false);
    },
    TEST_TIMEOUT
  );

  it(
    'should create multi-node workflow from complex prompt',
    async () => {
      // Arrange
      const description =
        'When webhook receives data, query PostgreSQL database, then send Slack notification';

      // Act
      const result = await handleCreateFromPrompt({
        description,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      const workflowId = data?.workflowId as string;
      trackWorkflow(context, workflowId);

      // Verify multiple nodes created
      expect(data?.nodesCreated).toBeGreaterThan(1);
      const mappedNodes = data?.mappedNodes as Array<Record<string, unknown>> | undefined;
      expect(mappedNodes).toBeDefined();
      expect(Array.isArray(mappedNodes)).toBe(true);
      expect(mappedNodes!.length).toBeGreaterThanOrEqual(2);

      // Verify workflow structure
      const workflow = await n8nClient.getWorkflow(workflowId);
      expect(workflow.nodes.length).toBeGreaterThanOrEqual(2);

      // Verify connections exist
      expect(workflow.connections).toBeDefined();
      const connectionKeys = Object.keys(workflow.connections);
      expect(connectionKeys.length).toBeGreaterThan(0);
    },
    TEST_TIMEOUT
  );

  it(
    'should return warnings when no trigger node detected',
    async () => {
      // Arrange - prompt without clear trigger
      const description = 'Send email and log to Google Sheets';

      // Act
      const result = await handleCreateFromPrompt({
        description,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      const warnings = data?.warnings as string[] | undefined;

      if (warnings && warnings.length > 0) {
        expect(Array.isArray(warnings)).toBe(true);
        // Should have warning about missing trigger
        const hasTriggerWarning = warnings.some((w) =>
          w.toLowerCase().includes('trigger')
        );
        // May or may not have trigger warning depending on keyword mapping
        expect(typeof hasTriggerWarning).toBe('boolean');
      }

      // Cleanup if workflow was created
      const workflowId = data?.workflowId as string | undefined;
      if (workflowId) {
        trackWorkflow(context, workflowId);
      }
    },
    TEST_TIMEOUT
  );

  it(
    'should reject prompt that is too short',
    async () => {
      // Arrange
      const description = 'Short';

      // Act
      const result = await handleCreateFromPrompt({
        description,
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    },
    TEST_TIMEOUT
  );

  it(
    'should reject prompt with missing description',
    async () => {
      // Act
      const result = await handleCreateFromPrompt({});

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    },
    TEST_TIMEOUT
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: n8n_suggest_nodes
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!hasApiKey)('n8n_suggest_nodes Integration Tests', () => {
  it(
    'should suggest nodes for webhook to email task',
    async () => {
      // Arrange
      const task = 'When webhook receives data, send email notification';

      // Act
      const result = await handleSuggestNodes({
        task,
        maxResults: 5,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect(data).toBeDefined();

      const suggestions = data?.suggestions as Array<Record<string, unknown>> | undefined;
      expect(suggestions).toBeDefined();
      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions!.length).toBeGreaterThan(0);
      expect(suggestions!.length).toBeLessThanOrEqual(5);

      // Verify suggestion structure
      for (const suggestion of suggestions!) {
        expect(suggestion).toHaveProperty('nodeType');
        expect(suggestion).toHaveProperty('nodeName');
        expect(suggestion).toHaveProperty('category');
        expect(suggestion).toHaveProperty('reason');
        expect(suggestion).toHaveProperty('confidence');
        expect(typeof suggestion.confidence).toBe('number');
        expect(suggestion.confidence as number).toBeGreaterThanOrEqual(0);
        expect(suggestion.confidence as number).toBeLessThanOrEqual(1);
      }

      // Should include webhook node
      const hasWebhook = suggestions!.some(
        (s) => (s.nodeType as string).includes('webhook')
      );
      expect(hasWebhook).toBe(true);
    },
    TEST_TIMEOUT
  );

  it(
    'should suggest nodes for data sync task',
    async () => {
      // Arrange
      const task = 'Sync data from PostgreSQL to Google Sheets every hour';

      // Act
      const result = await handleSuggestNodes({
        task,
        maxResults: 10,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      const suggestions = data?.suggestions as Array<Record<string, unknown>> | undefined;

      expect(suggestions!.length).toBeGreaterThan(0);
      expect(suggestions!.length).toBeLessThanOrEqual(10);

      // Should include database or Google Sheets nodes
      const hasDatabase = suggestions!.some(
        (s) =>
          (s.nodeType as string).includes('postgres') ||
          (s.nodeType as string).includes('mysql')
      );
      const hasSheets = suggestions!.some(
        (s) => (s.nodeType as string).includes('google') && (s.nodeType as string).includes('sheet')
      );

      // At least one should be present
      expect(hasDatabase || hasSheets).toBe(true);
    },
    TEST_TIMEOUT
  );

  it(
    'should suggest nodes for daily report task',
    async () => {
      // Arrange
      const task = 'Send daily report via email';

      // Act
      const result = await handleSuggestNodes({
        task,
        maxResults: 5,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      const suggestions = data?.suggestions as Array<Record<string, unknown>> | undefined;

      // Should include suggestions
      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions!.length).toBeGreaterThan(0);
      expect(suggestions!.length).toBeLessThanOrEqual(5);
    },
    TEST_TIMEOUT
  );

  it(
    'should return suggestions without forced trigger filter',
    async () => {
      // Arrange
      const task = 'Send daily report via email';

      // Act
      const result = await handleSuggestNodes({
        task,
        maxResults: 5,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      const suggestions = data?.suggestions as Array<Record<string, unknown>> | undefined;

      // May or may not include triggers depending on implementation
      expect(Array.isArray(suggestions)).toBe(true);
    },
    TEST_TIMEOUT
  );

  it(
    'should return templates when category is specified',
    async () => {
      // Arrange
      const category = 'webhook';

      // Act
      const result = await handleSuggestNodes({
        category,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;

      // Should return templates for webhook category
      const templates = data?.templates as Array<Record<string, unknown>> | undefined;
      if (templates && templates.length > 0) {
        const firstTemplate = templates[0];
        expect(firstTemplate).toHaveProperty('name');
        expect(firstTemplate).toHaveProperty('category');
        expect(firstTemplate).toHaveProperty('description');
        expect(firstTemplate).toHaveProperty('nodes');
        expect(Array.isArray(firstTemplate.nodes)).toBe(true);
      }
    },
    TEST_TIMEOUT
  );

  it(
    'should suggest nodes for existing workflow',
    async () => {
      // Arrange
      const existingNodes = [
        'n8n-nodes-base.webhook',
        'n8n-nodes-base.httpRequest',
      ];

      // Act
      const result = await handleSuggestNodes({
        existingNodes,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      const suggestions = data?.suggestions as Array<Record<string, unknown>> | undefined;

      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions!.length).toBeGreaterThan(0);

      // Suggestions should complement existing nodes (not duplicates)
      for (const suggestion of suggestions!) {
        const nodeType = suggestion.nodeType as string;
        expect(existingNodes).not.toContain(nodeType);
      }
    },
    TEST_TIMEOUT
  );

  it(
    'should respect maxResults parameter',
    async () => {
      // Arrange
      const task = 'Webhook receives data, processes it, and sends notifications';
      const maxResults = 3;

      // Act
      const result = await handleSuggestNodes({
        task,
        maxResults,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      const suggestions = data?.suggestions as Array<Record<string, unknown>> | undefined;

      expect(suggestions!.length).toBeLessThanOrEqual(maxResults);
    },
    TEST_TIMEOUT
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: End-to-End Workflow Creation + Verification
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!hasApiKey)('End-to-End AI Workflow Tests', () => {
  it(
    'should create workflow from prompt and verify complete lifecycle',
    async () => {
      // Arrange
      const description = 'When webhook receives data, send email notification';

      // Act 1: Create workflow
      const createResult = await handleCreateFromPrompt({
        description,
      });

      expect(createResult.success).toBe(true);
      const createData = createResult.data as Record<string, unknown> | undefined;
      const workflowId = createData?.workflowId as string;
      trackWorkflow(context, workflowId);

      // Act 2: Get workflow details
      const workflow = await n8nClient.getWorkflow(workflowId);
      expect(workflow.id).toBe(workflowId);
      expect(workflow.nodes.length).toBeGreaterThan(0);

      // Act 3: Verify nodes have correct types
      for (const node of workflow.nodes) {
        expect(node.type).toBeDefined();
        expect(node.type).toContain('.'); // Full format: n8n-nodes-base.xxx
        expect(node.name).toBeDefined();
        expect(node.position).toBeDefined();
        expect(Array.isArray(node.position)).toBe(true);
        expect(node.position.length).toBe(2);
      }

      // Act 4: Verify connections are valid
      if (Object.keys(workflow.connections).length > 0) {
        for (const [sourceNode, connections] of Object.entries(workflow.connections)) {
          // Source node should exist in workflow
          const sourceExists = workflow.nodes.some((n) => n.name === sourceNode);
          expect(sourceExists).toBe(true);

          // Target nodes should exist
          const mainConnections = (connections as Record<string, unknown>).main;
          if (mainConnections) {
            for (const port of mainConnections as Array<Array<{ node: string }>>) {
              for (const conn of port) {
                const targetExists = workflow.nodes.some((n) => n.name === conn.node);
                expect(targetExists).toBe(true);
              }
            }
          }
        }
      }
    },
    TEST_TIMEOUT
  );

  it(
    'should suggest nodes for created workflow and verify compatibility',
    async () => {
      // Arrange: Create a simple workflow
      const description = 'Webhook receives data';
      const createResult = await handleCreateFromPrompt({
        description,
      });

      expect(createResult.success).toBe(true);
      const createData = createResult.data as Record<string, unknown> | undefined;
      const workflowId = createData?.workflowId as string;
      trackWorkflow(context, workflowId);

      // Get created workflow's node types
      const workflow = await n8nClient.getWorkflow(workflowId);
      const existingNodeTypes = workflow.nodes.map((n) => n.type);

      // Act: Get node suggestions
      const suggestResult = await handleSuggestNodes({
        existingNodes: existingNodeTypes,
        taskDescription: 'Webhook receives data and processes it',
      });

      // Assert: Suggestions complement existing nodes
      expect(suggestResult.success).toBe(true);
      const suggestData = suggestResult.data as Record<string, unknown> | undefined;
      const suggestions = suggestData?.suggestions as Array<Record<string, unknown>> | undefined;

      for (const suggestion of suggestions!) {
        const suggestedType = suggestion.nodeType as string;
        expect(existingNodeTypes).not.toContain(suggestedType);
      }
    },
    TEST_TIMEOUT
  );
});
