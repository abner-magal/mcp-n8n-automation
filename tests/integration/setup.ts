/**
 * Integration Test Setup and Helpers
 *
 * Configuration and utilities for integration tests requiring real n8n instance.
 * Reads credentials from .env.local or environment variables.
 */

import { beforeAll, afterAll, afterEach } from 'vitest';
import { N8nApiClient } from '../../src/services/n8n-api-client';
import { Logger } from '../../src/utils/logger';

const logger = new Logger({ prefix: '[IntegrationSetup]' });

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface IntegrationTestConfig {
  n8nApiUrl: string;
  n8nApiKey: string;
  skipIfNoAuth: boolean;
  cleanupEnabled: boolean;
  testPrefix: string;
}

/**
 * Load integration test configuration from environment
 */
export function getIntegrationConfig(): IntegrationTestConfig {
  const n8nApiUrl = process.env.N8N_API_URL || 'http://localhost:5678';
  const n8nApiKey = process.env.N8N_API_KEY || '';
  const skipIfNoAuth = process.env.SKIP_IF_NO_AUTH !== 'false';
  const cleanupEnabled = process.env.DISABLE_CLEANUP !== 'true';
  const testPrefix = process.env.TEST_PREFIX || 'TEST';

  return {
    n8nApiUrl,
    n8nApiKey,
    skipIfNoAuth,
    cleanupEnabled,
    testPrefix,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Context
// ─────────────────────────────────────────────────────────────────────────────

export interface IntegrationTestContext {
  client: N8nApiClient;
  createdWorkflowIds: string[];
  config: IntegrationTestConfig;
}

/**
 * Create a test context with API client and cleanup tracking
 */
export function createIntegrationContext(): IntegrationTestContext {
  const config = getIntegrationConfig();
  const client = new N8nApiClient({
    baseUrl: config.n8nApiUrl,
    apiKey: config.n8nApiKey,
    timeout: 15000,
    maxRetries: 2,
  });

  return {
    client,
    createdWorkflowIds: [],
    config,
  };
}

/**
 * Track a workflow for cleanup
 */
export function trackWorkflow(context: IntegrationTestContext, workflowId: string): void {
  if (!context.createdWorkflowIds.includes(workflowId)) {
    context.createdWorkflowIds.push(workflowId);
    logger.debug(`Tracking workflow ${workflowId} for cleanup`);
  }
}

/**
 * Cleanup all tracked workflows
 */
export async function cleanupWorkflows(context: IntegrationTestContext): Promise<void> {
  if (!context.config.cleanupEnabled) {
    logger.info('Cleanup disabled, skipping');
    return;
  }

  if (context.createdWorkflowIds.length === 0) {
    return;
  }

  logger.info(`Cleaning up ${context.createdWorkflowIds.length} workflow(s)`);

  for (const id of context.createdWorkflowIds) {
    try {
      await context.client.deleteWorkflow(id);
      logger.debug(`Deleted workflow: ${id}`);
    } catch (error) {
      // Log but don't fail - workflow might already be deleted
      logger.warn(`Failed to delete workflow ${id}:`, error);
    }
  }

  context.createdWorkflowIds = [];
}

/**
 * Generate a unique test workflow name
 */
export function createTestWorkflowName(
  context: IntegrationTestContext,
  baseName: string
): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `${context.config.testPrefix}_${baseName}_${timestamp}_${randomSuffix}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Global Setup/Teardown
// ─────────────────────────────────────────────────────────────────────────────

let globalContext: IntegrationTestContext | null = null;

/**
 * Get the global integration test context (for use in tests without local context)
 */
export function getGlobalContext(): IntegrationTestContext {
  if (!globalContext) {
    throw new Error('Global context not initialized. Call setupIntegrationTests() first.');
  }
  return globalContext;
}

/**
 * Setup integration tests - verify n8n is accessible
 */
export async function setupIntegrationTests(): Promise<void> {
  const config = getIntegrationConfig();

  logger.info(`n8n API URL: ${config.n8nApiUrl}`);
  logger.info(`API Key configured: ${config.n8nApiKey ? 'Yes' : 'No'}`);

  // Create global client
  globalContext = createIntegrationContext();

  // Verify n8n is accessible
  try {
    const isHealthy = await globalContext.client.healthCheck();
    if (isHealthy) {
      logger.info('n8n instance is healthy');
    }
  } catch (error) {
    logger.warn('n8n health check failed:', error);
    throw new Error(
      `n8n instance not accessible at ${config.n8nApiUrl}. Ensure n8n is running.`
    );
  }
}

/**
 * Teardown integration tests - cleanup remaining resources
 */
export async function teardownIntegrationTests(): Promise<void> {
  if (globalContext) {
    await cleanupWorkflows(globalContext);
    globalContext = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Vitest Hooks (for tests that import this file as setup)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Global beforeAll - setup n8n connection
 */
export async function globalBeforeAll(): Promise<void> {
  await setupIntegrationTests();
}

/**
 * Global afterAll - cleanup resources
 */
export async function globalAfterAll(): Promise<void> {
  await teardownIntegrationTests();
}

/**
 * AfterEach - cleanup workflows created during test
 */
export async function afterEachCleanup(): Promise<void> {
  if (globalContext) {
    await cleanupWorkflows(globalContext);
  }
}
