import { N8nApiClient } from '../services/n8n-api-client';
import { getN8nApiConfig, getN8nApiConfigFromContext } from '../config/n8n-api';
import {
  Workflow,
  WorkflowNode,
  WorkflowConnection,
  ExecutionStatus,
  WebhookRequest,
  McpToolResponse,
  ExecutionFilterOptions,
  ExecutionMode,
} from '../types/n8n-api';
import type { TriggerType, TestWorkflowInput } from '../triggers/types';
import {
  validateWorkflowStructure,
  hasWebhookTrigger,
  getWebhookUrl
} from '../services/n8n-validation';
import {
  N8nApiError,
  N8nNotFoundError,
  getUserFriendlyErrorMessage,
  formatExecutionError,
  formatNoExecutionError
} from '../utils/n8n-errors';
import { logger } from '../utils/logger';
import { z } from 'zod';
import { WorkflowValidator } from '../services/workflow-validator';
import { EnhancedConfigValidator } from '../services/enhanced-config-validator';
import { NodeRepository } from '../database/node-repository';
import { InstanceContext, validateInstanceContext } from '../types/instance-context';
import { NodeTypeNormalizer } from '../utils/node-type-normalizer';
import { WorkflowAutoFixer, AutoFixConfig } from '../services/workflow-auto-fixer';
import { ExpressionFormatValidator, ExpressionFormatIssue } from '../services/expression-format-validator';
import { WorkflowVersioningService } from '../services/workflow-versioning-service';
import { handleUpdatePartialWorkflow } from './handlers-workflow-diff';
import { TemplateService } from '../templates/template-service';
import {
  createCacheKey,
  createInstanceCache,
  CacheMutex,
  cacheMetrics,
  withRetry,
  getCacheStatistics
} from '../utils/cache-utils';
import { processExecution } from '../services/execution-processor';
import { checkNpmVersion, formatVersionMessage } from '../utils/npm-version-checker';
import { getKapaAiClient } from '../services/kapa-ai-client';
import { getLlmsTxtService, LlmsTxtSearchResult } from '../services/llms-txt-service';
import {
  getDocsFallbackService,
  DocsFallbackService,
  DocsSearchResult,
} from '../services/docs-fallback-service';

// ========================================================================
// TypeScript Interfaces for Type Safety
// ========================================================================

/**
 * Health Check Response Data Structure
 */
interface HealthCheckResponseData {
  status: string;
  instanceId?: string;
  n8nVersion?: string;
  features?: Record<string, unknown>;
  apiUrl?: string;
  mcpVersion: string;
  supportedN8nVersion?: string;
  versionCheck: {
    current: string;
    latest: string | null;
    upToDate: boolean;
    message: string;
    updateCommand?: string;
  };
  performance: {
    responseTimeMs: number;
    cacheHitRate: string;
    cachedInstances: number;
  };
  nextSteps?: string[];
  updateWarning?: string;
}

/**
 * Cloud Platform Guide Structure
 */
interface CloudPlatformGuide {
  name: string;
  troubleshooting: string[];
}

/**
 * Applied Fix from Auto-Fix Operation
 */
interface AppliedFix {
  node: string;
  field: string;
  type: string;
  before: string;
  after: string;
  confidence: string;
}

/**
 * Auto-Fix Result Data from handleAutofixWorkflow
 */
interface AutofixResultData {
  fixesApplied?: number;
  fixes?: AppliedFix[];
  workflowId?: string;
  workflowName?: string;
  message?: string;
  summary?: string;
  stats?: Record<string, number>;
}

/**
 * Workflow Validation Response Data
 */
interface WorkflowValidationResponse {
  valid: boolean;
  workflowId?: string;
  workflowName?: string;
  summary: {
    totalNodes: number;
    enabledNodes: number;
    triggerNodes: number;
    validConnections: number;
    invalidConnections: number;
    expressionsValidated: number;
    errorCount: number;
    warningCount: number;
  };
  errors?: Array<{
    node: string;
    nodeName?: string;
    message: string;
    details?: Record<string, unknown>;
  }>;
  warnings?: Array<{
    node: string;
    nodeName?: string;
    message: string;
    details?: Record<string, unknown>;
  }>;
  suggestions?: unknown[];
}

/**
 * Diagnostic Response Data Structure
 */
interface DiagnosticResponseData {
  timestamp: string;
  environment: {
    N8N_API_URL: string | null;
    N8N_API_KEY: string | null;
    NODE_ENV: string;
    MCP_MODE: string;
    isDocker: boolean;
    cloudPlatform: string | null;
    nodeVersion: string;
    platform: string;
  };
  apiConfiguration: {
    configured: boolean;
    status: {
      configured: boolean;
      connected: boolean;
      error: string | null;
      version: string | null;
    };
    config: {
      baseUrl: string;
      timeout: number;
      maxRetries: number;
    } | null;
  };
  versionInfo: {
    current: string;
    latest: string | null;
    upToDate: boolean;
    message: string;
    updateCommand?: string;
  };
  toolsAvailability: {
    documentationTools: {
      count: number;
      enabled: boolean;
      description: string;
    };
    managementTools: {
      count: number;
      enabled: boolean;
      description: string;
    };
    totalAvailable: number;
  };
  performance: {
    diagnosticResponseTimeMs: number;
    cacheHitRate: string;
    cachedInstances: number;
  };
  modeSpecificDebug: Record<string, unknown>;
  dockerDebug?: Record<string, unknown>;
  cloudPlatformDebug?: CloudPlatformGuide;
  nextSteps?: Record<string, unknown>;
  troubleshooting?: Record<string, unknown>;
  setupGuide?: Record<string, unknown>;
  updateWarning?: Record<string, unknown>;
  debug?: Record<string, unknown>;
  [key: string]: unknown; // Allow dynamic property access for optional fields
}

// ========================================================================
// Singleton n8n API client instance (backward compatibility)
let defaultApiClient: N8nApiClient | null = null;
let lastDefaultConfigUrl: string | null = null;

// Mutex for cache operations to prevent race conditions
const cacheMutex = new CacheMutex();

// Instance-specific API clients cache with LRU eviction and TTL
const instanceClients = createInstanceCache<N8nApiClient>((client, key) => {
  // Clean up when evicting from cache
  logger.debug('Evicting API client from cache', {
    cacheKey: key.substring(0, 8) + '...' // Only log partial key for security
  });
});

/**
 * Get or create API client with flexible instance support
 * Supports both singleton mode (using environment variables) and instance-specific mode.
 * Uses LRU cache with mutex protection for thread-safe operations.
 *
 * @param context - Optional instance context for instance-specific configuration
 * @returns API client configured for the instance or environment, or null if not configured
 *
 * @example
 * // Using environment variables (singleton mode)
 * const client = getN8nApiClient();
 *
 * @example
 * // Using instance context
 * const client = getN8nApiClient({
 *   n8nApiUrl: 'https://customer.n8n.cloud',
 *   n8nApiKey: 'api-key-123',
 *   instanceId: 'customer-1'
 * });
 */
/**
 * Get cache statistics for monitoring
 * @returns Formatted cache statistics string
 */
export function getInstanceCacheStatistics(): string {
  return getCacheStatistics();
}

/**
 * Get raw cache metrics for detailed monitoring
 * @returns Raw cache metrics object
 */
export function getInstanceCacheMetrics() {
  return cacheMetrics.getMetrics();
}

/**
 * Clear the instance cache for testing or maintenance
 */
export function clearInstanceCache(): void {
  instanceClients.clear();
  cacheMetrics.recordClear();
  cacheMetrics.updateSize(0, instanceClients.max);
}

export function getN8nApiClient(context?: InstanceContext): N8nApiClient | null {
  // If context provided with n8n config, use instance-specific client
  if (context?.n8nApiUrl && context?.n8nApiKey) {
    // Validate context before using
    const validation = validateInstanceContext(context);
    if (!validation.valid) {
      logger.warn('Invalid instance context provided', {
        instanceId: context.instanceId,
        errors: validation.errors
      });
      return null;
    }
    // Create secure hash of credentials for cache key using memoization
    const cacheKey = createCacheKey(
      `${context.n8nApiUrl}:${context.n8nApiKey}:${context.instanceId || ''}`
    );

    // Check cache first
    if (instanceClients.has(cacheKey)) {
      cacheMetrics.recordHit();
      return instanceClients.get(cacheKey) || null;
    }

    cacheMetrics.recordMiss();

    // Check if already being created (simple lock check)
    if (cacheMutex.isLocked(cacheKey)) {
      // Wait briefly and check again
      const waitTime = 100; // 100ms
      const start = Date.now();
      while (cacheMutex.isLocked(cacheKey) && (Date.now() - start) < 1000) {
        // Busy wait for up to 1 second
      }
      // Check if it was created while waiting
      if (instanceClients.has(cacheKey)) {
        cacheMetrics.recordHit();
        return instanceClients.get(cacheKey) || null;
      }
    }

    const config = getN8nApiConfigFromContext(context);
    if (config) {
      // Sanitized logging - never log API keys
      logger.info('Creating instance-specific n8n API client', {
        url: config.baseUrl.replace(/^(https?:\/\/[^\/]+).*/, '$1'), // Only log domain
        instanceId: context.instanceId,
        cacheKey: cacheKey.substring(0, 8) + '...' // Only log partial hash
      });

      const client = new N8nApiClient(config);
      instanceClients.set(cacheKey, client);
      cacheMetrics.recordSet();
      cacheMetrics.updateSize(instanceClients.size, instanceClients.max);
      return client;
    }

    return null;
  }

  // Fall back to default singleton from environment
  logger.info('Falling back to environment configuration for n8n API client');
  const config = getN8nApiConfig();

  if (!config) {
    if (defaultApiClient) {
      logger.info('n8n API configuration removed, clearing default client');
      defaultApiClient = null;
      lastDefaultConfigUrl = null;
    }
    return null;
  }

  // Check if config has changed
  if (!defaultApiClient || lastDefaultConfigUrl !== config.baseUrl) {
    logger.info('n8n API client initialized from environment', { url: config.baseUrl });
    defaultApiClient = new N8nApiClient(config);
    lastDefaultConfigUrl = config.baseUrl;
  }

  return defaultApiClient;
}

/**
 * Helper to ensure API is configured
 * @param context - Optional instance context
 * @returns Configured API client
 * @throws Error if API is not configured
 */
function ensureApiConfigured(context?: InstanceContext): N8nApiClient {
  const client = getN8nApiClient(context);
  if (!client) {
    if (context?.instanceId) {
      throw new Error(`n8n API not configured for instance ${context.instanceId}. Please provide n8nApiUrl and n8nApiKey in the instance context.`);
    }
    throw new Error('n8n API not configured. Please set N8N_API_URL and N8N_API_KEY environment variables.');
  }
  return client;
}

// Zod schemas for input validation
const createWorkflowSchema = z.object({
  name: z.string(),
  nodes: z.array(z.any()),
  connections: z.record(z.any()),
  settings: z.object({
    executionOrder: z.enum(['v0', 'v1']).optional(),
    timezone: z.string().optional(),
    saveDataErrorExecution: z.enum(['all', 'none']).optional(),
    saveDataSuccessExecution: z.enum(['all', 'none']).optional(),
    saveManualExecutions: z.boolean().optional(),
    saveExecutionProgress: z.boolean().optional(),
    executionTimeout: z.number().optional(),
    errorWorkflow: z.string().optional(),
  }).optional(),
  projectId: z.string().optional(),
});

const updateWorkflowSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  nodes: z.array(z.any()).optional(),
  connections: z.record(z.any()).optional(),
  settings: z.any().optional(),
  createBackup: z.boolean().optional(),
  intent: z.string().optional(),
});

const listWorkflowsSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().optional(),
  active: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  projectId: z.string().optional(),
  excludePinnedData: z.boolean().optional(),
});

const validateWorkflowSchema = z.object({
  id: z.string(),
  options: z.object({
    validateNodes: z.boolean().optional(),
    validateConnections: z.boolean().optional(),
    validateExpressions: z.boolean().optional(),
    profile: z.enum(['minimal', 'runtime', 'ai-friendly', 'strict']).optional(),
  }).optional(),
});

const autofixWorkflowSchema = z.object({
  id: z.string(),
  applyFixes: z.boolean().optional().default(false),
  fixTypes: z.array(z.enum([
    'expression-format',
    'typeversion-correction',
    'error-output-config',
    'node-type-correction',
    'webhook-missing-path',
    'typeversion-upgrade',
    'version-migration',
    'tool-variant-correction',
    'connection-numeric-keys',
    'connection-invalid-type',
    'connection-id-to-name',
    'connection-duplicate-removal',
    'connection-input-index'
  ])).optional(),
  confidenceThreshold: z.enum(['high', 'medium', 'low']).optional().default('medium'),
  maxFixes: z.number().optional().default(50)
});

// Schema for n8n_test_workflow tool
const testWorkflowSchema = z.object({
  workflowId: z.string(),
  triggerType: z.enum(['webhook', 'form', 'chat']).optional(),
  httpMethod: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional(),
  webhookPath: z.string().optional(),
  message: z.string().optional(),
  sessionId: z.string().optional(),
  data: z.record(z.unknown()).optional(),
  headers: z.record(z.string()).optional(),
  timeout: z.number().optional(),
  waitForResponse: z.boolean().optional(),
});

const listExecutionsSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().optional(),
  workflowId: z.string().optional(),
  projectId: z.string().optional(),
  status: z.enum(['success', 'error', 'waiting']).optional(),
  includeData: z.boolean().optional(),
});

const workflowVersionsSchema = z.object({
  mode: z.enum(['list', 'get', 'rollback', 'delete', 'prune', 'truncate']),
  workflowId: z.string().optional(),
  versionId: z.number().optional(),
  limit: z.number().default(10).optional(),
  validateBefore: z.boolean().default(true).optional(),
  deleteAll: z.boolean().default(false).optional(),
  maxVersions: z.number().default(10).optional(),
  confirmTruncate: z.boolean().default(false).optional(),
});

// Workflow Management Handlers

export async function handleCreateWorkflow(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const input = createWorkflowSchema.parse(args);

    // Proactively detect SHORT form node types (common mistake)
    const shortFormErrors: string[] = [];
    input.nodes?.forEach((node: any, index: number) => {
      if (node.type?.startsWith('nodes-base.') || node.type?.startsWith('nodes-langchain.')) {
        const fullForm = node.type.startsWith('nodes-base.')
          ? node.type.replace('nodes-base.', 'n8n-nodes-base.')
          : node.type.replace('nodes-langchain.', '@n8n/n8n-nodes-langchain.');
        shortFormErrors.push(
          `Node ${index} ("${node.name}") uses SHORT form "${node.type}". ` +
          `The n8n API requires FULL form. Change to "${fullForm}"`
        );
      }
    });

    if (shortFormErrors.length > 0) {
      return {
        success: false,
        error: 'Node type format error: n8n API requires FULL form node types',
        details: {
          errors: shortFormErrors,
          hint: 'Use n8n-nodes-base.* instead of nodes-base.* for standard nodes'
        }
      };
    }

    // Validate workflow structure (n8n API expects FULL form: n8n-nodes-base.*)
    const errors = validateWorkflowStructure(input);
    if (errors.length > 0) {
      return {
        success: false,
        error: 'Workflow validation failed',
        details: { errors }
      };
    }

    // Create workflow (n8n API expects node types in FULL form)
    const workflow = await client.createWorkflow(input);

    // Defensive check: ensure the API returned a valid workflow with an ID
    if (!workflow || !workflow.id) {
      return {
        success: false,
        error: 'Workflow creation failed: n8n API returned an empty or invalid response. Verify your N8N_API_URL points to the correct /api/v1 endpoint and that the n8n instance supports workflow creation.',
        details: {
          response: workflow ? { keys: Object.keys(workflow) } : null
        }
      };
    }

    return {
      success: true,
      data: {
        id: workflow.id,
        name: workflow.name,
        active: workflow.active,
        nodeCount: workflow.nodes?.length || 0
      },
      message: `Workflow "${workflow.name}" created successfully with ID: ${workflow.id}. Use n8n_get_workflow with mode 'structure' to verify current state.`
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
        details: error.details as Record<string, unknown> | undefined
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleGetWorkflow(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const { id } = z.object({ id: z.string() }).parse(args);
    
    const workflow = await client.getWorkflow(id);
    
    return {
      success: true,
      data: workflow
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleGetWorkflowDetails(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const { id } = z.object({ id: z.string() }).parse(args);
    
    const workflow = await client.getWorkflow(id);
    
    // Get recent executions for this workflow
    const executions = await client.listExecutions({
      workflowId: id,
      limit: 10
    });
    
    // Calculate execution statistics
    const stats = {
      totalExecutions: executions.data.length,
      successCount: executions.data.filter(e => e.status === ExecutionStatus.SUCCESS).length,
      errorCount: executions.data.filter(e => e.status === ExecutionStatus.ERROR).length,
      lastExecutionTime: executions.data[0]?.startedAt || null
    };
    
    return {
      success: true,
      data: {
        workflow,
        executionStats: stats,
        hasWebhookTrigger: hasWebhookTrigger(workflow),
        webhookPath: getWebhookUrl(workflow)
      }
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleGetWorkflowStructure(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const { id } = z.object({ id: z.string() }).parse(args);
    
    const workflow = await client.getWorkflow(id);
    
    // Simplify nodes to just essential structure
    const simplifiedNodes = workflow.nodes.map(node => ({
      id: node.id,
      name: node.name,
      type: node.type,
      position: node.position,
      disabled: node.disabled || false
    }));
    
    return {
      success: true,
      data: {
        id: workflow.id,
        name: workflow.name,
        active: workflow.active,
        isArchived: workflow.isArchived,
        nodes: simplifiedNodes,
        connections: workflow.connections,
        nodeCount: workflow.nodes.length,
        connectionCount: Object.keys(workflow.connections).length
      }
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleGetWorkflowMinimal(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const { id } = z.object({ id: z.string() }).parse(args);
    
    const workflow = await client.getWorkflow(id);
    
    return {
      success: true,
      data: {
        id: workflow.id,
        name: workflow.name,
        active: workflow.active,
        isArchived: workflow.isArchived,
        tags: workflow.tags || [],
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt
      }
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleUpdateWorkflow(
  args: unknown,
  repository: NodeRepository,
  context?: InstanceContext
): Promise<McpToolResponse> {
  const startTime = Date.now();
  const sessionId = `mutation_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  let workflowBefore: any = null;
  let userIntent = 'Full workflow update';

  try {
    const client = ensureApiConfigured(context);
    const input = updateWorkflowSchema.parse(args);
    const { id, createBackup, intent, ...updateData } = input;
    userIntent = intent || 'Full workflow update';

    // If nodes/connections are being updated, validate the structure
    if (updateData.nodes || updateData.connections) {
      // Always fetch current workflow for validation (need all fields like name)
      const current = await client.getWorkflow(id);
      workflowBefore = JSON.parse(JSON.stringify(current));

      // Preserve credentials from current workflow for nodes that don't specify them.
      // AI-generated node updates typically omit credential references because they
      // aren't included in the context provided to the AI. Without this merge, the
      // n8n API rejects the PUT with missing credentials.
      if (updateData.nodes && current.nodes) {
        const currentById = new Map<string, any>();
        const currentByName = new Map<string, any>();
        for (const node of current.nodes) {
          if (node.id) currentById.set(node.id, node);
          currentByName.set(node.name, node);
        }
        for (const node of updateData.nodes as any[]) {
          const hasCredentials = node.credentials && typeof node.credentials === 'object' && Object.keys(node.credentials).length > 0;
          if (!hasCredentials) {
            const match = (node.id && currentById.get(node.id)) || currentByName.get(node.name);
            if (match?.credentials) {
              node.credentials = match.credentials;
            }
          }
        }
      }

      // Create backup before modifying workflow (default: true)
      if (createBackup !== false) {
        try {
          const versioningService = new WorkflowVersioningService(repository, client);
          const backupResult = await versioningService.createBackup(id, current, {
            trigger: 'full_update'
          });

          logger.info('Workflow backup created', {
            workflowId: id,
            versionId: backupResult.versionId,
            versionNumber: backupResult.versionNumber,
            pruned: backupResult.pruned
          });
        } catch (error: any) {
          logger.warn('Failed to create workflow backup', {
            workflowId: id,
            error: error.message
          });
          // Continue with update even if backup fails (non-blocking)
        }
      }

      const fullWorkflow = {
        ...current,
        ...updateData
      };

      // Validate workflow structure (n8n API expects FULL form: n8n-nodes-base.*)
      const errors = validateWorkflowStructure(fullWorkflow);
      if (errors.length > 0) {
        return {
          success: false,
          error: 'Workflow validation failed',
          details: { errors }
        };
      }
    }

    // Update workflow
    const workflow = await client.updateWorkflow(id, updateData);

    return {
      success: true,
      data: {
        id: workflow.id,
        name: workflow.name,
        active: workflow.active,
        nodeCount: workflow.nodes?.length || 0
      },
      message: `Workflow "${workflow.name}" updated successfully. Use n8n_get_workflow with mode 'structure' to verify current state.`
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }

    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
        details: error.details as Record<string, unknown> | undefined
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleDeleteWorkflow(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const { id } = z.object({ id: z.string() }).parse(args);

    const deleted = await client.deleteWorkflow(id);

    return {
      success: true,
      data: {
        id: deleted?.id || id,
        name: deleted?.name,
        deleted: true
      },
      message: `Workflow "${deleted?.name || id}" deleted successfully.`
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleListWorkflows(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const input = listWorkflowsSchema.parse(args || {});

    // Convert tags array to comma-separated string (n8n API format)
    const tagsParam = input.tags && input.tags.length > 0
      ? input.tags.join(',')
      : undefined;

    const response = await client.listWorkflows({
      limit: input.limit || 100,
      cursor: input.cursor,
      active: input.active,
      tags: tagsParam as any,  // API expects string, not array
      projectId: input.projectId,
      excludePinnedData: input.excludePinnedData ?? true
    });
    
    // Strip down workflows to only essential metadata
    const minimalWorkflows = response.data.map(workflow => ({
      id: workflow.id,
      name: workflow.name,
      active: workflow.active,
      isArchived: workflow.isArchived,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      tags: workflow.tags || [],
      nodeCount: workflow.nodes?.length || 0
    }));

    return {
      success: true,
      data: {
        workflows: minimalWorkflows,
        returned: minimalWorkflows.length,
        nextCursor: response.nextCursor,
        hasMore: !!response.nextCursor,
        ...(response.nextCursor ? { 
          _note: "More workflows available. Use cursor to get next page." 
        } : {})
      }
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleValidateWorkflow(
  args: unknown,
  repository: NodeRepository,
  context?: InstanceContext
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const input = validateWorkflowSchema.parse(args);
    
    // First, fetch the workflow from n8n
    const workflowResponse = await handleGetWorkflow({ id: input.id }, context);
    
    if (!workflowResponse.success) {
      return workflowResponse; // Return the error from fetching
    }
    
    const workflow = workflowResponse.data as Workflow;
    
    // Create validator instance using the provided repository
    const validator = new WorkflowValidator(repository, EnhancedConfigValidator);
    
    // Run validation
    const validationResult = await validator.validateWorkflow(workflow, input.options);
    
    // Format the response (same format as the regular validate_workflow tool)
    const response: WorkflowValidationResponse = {
      valid: validationResult.valid,
      workflowId: workflow.id,
      workflowName: workflow.name,
      summary: {
        totalNodes: validationResult.statistics.totalNodes,
        enabledNodes: validationResult.statistics.enabledNodes,
        triggerNodes: validationResult.statistics.triggerNodes,
        validConnections: validationResult.statistics.validConnections,
        invalidConnections: validationResult.statistics.invalidConnections,
        expressionsValidated: validationResult.statistics.expressionsValidated,
        errorCount: validationResult.errors.length,
        warningCount: validationResult.warnings.length
      }
    };
    
    if (validationResult.errors.length > 0) {
      response.errors = validationResult.errors.map(e => ({
        node: e.nodeName || 'workflow',
        nodeName: e.nodeName, // Also set nodeName for compatibility
        message: e.message,
        details: e.details
      }));
    }

    if (validationResult.warnings.length > 0) {
      response.warnings = validationResult.warnings.map(w => ({
        node: w.nodeName || 'workflow',
        nodeName: w.nodeName, // Also set nodeName for compatibility
        message: w.message,
        details: w.details
      }));
    }
    
    if (validationResult.suggestions.length > 0) {
      response.suggestions = validationResult.suggestions;
    }

    return {
      success: true,
      data: response
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleAutofixWorkflow(
  args: unknown,
  repository: NodeRepository,
  context?: InstanceContext
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const input = autofixWorkflowSchema.parse(args);

    // First, fetch the workflow from n8n
    const workflowResponse = await handleGetWorkflow({ id: input.id }, context);

    if (!workflowResponse.success) {
      return workflowResponse; // Return the error from fetching
    }

    const workflow = workflowResponse.data as Workflow;

    // Create validator instance using the provided repository
    const validator = new WorkflowValidator(repository, EnhancedConfigValidator);

    // Run validation to identify issues
    const validationResult = await validator.validateWorkflow(workflow, {
      validateNodes: true,
      validateConnections: true,
      validateExpressions: true,
      profile: 'ai-friendly'
    });

    // Check for expression format issues
    const allFormatIssues: ExpressionFormatIssue[] = [];
    for (const node of workflow.nodes) {
      const formatContext = {
        nodeType: node.type,
        nodeName: node.name,
        nodeId: node.id
      };

      const nodeFormatIssues = ExpressionFormatValidator.validateNodeParameters(
        node.parameters,
        formatContext
      );

      // Add node information to each format issue
      const enrichedIssues = nodeFormatIssues.map(issue => ({
        ...issue,
        nodeName: node.name,
        nodeId: node.id
      }));

      allFormatIssues.push(...enrichedIssues);
    }

    // Generate fixes using WorkflowAutoFixer
    const autoFixer = new WorkflowAutoFixer(repository);
    const fixResult = await autoFixer.generateFixes(
      workflow,
      validationResult,
      allFormatIssues,
      {
        applyFixes: input.applyFixes,
        fixTypes: input.fixTypes,
        confidenceThreshold: input.confidenceThreshold,
        maxFixes: input.maxFixes
      }
    );

    // If no fixes available
    if (fixResult.fixes.length === 0) {
      return {
        success: true,
        data: {
          workflowId: workflow.id,
          workflowName: workflow.name,
          message: 'No automatic fixes available for this workflow',
          validationSummary: {
            errors: validationResult.errors.length,
            warnings: validationResult.warnings.length
          }
        }
      };
    }

    // If preview mode (applyFixes = false)
    if (!input.applyFixes) {
      return {
        success: true,
        data: {
          workflowId: workflow.id,
          workflowName: workflow.name,
          preview: true,
          fixesAvailable: fixResult.fixes.length,
          fixes: fixResult.fixes,
          summary: fixResult.summary,
          stats: fixResult.stats,
          message: `${fixResult.fixes.length} fixes available. Set applyFixes=true to apply them.`
        }
      };
    }

    // Apply fixes using the diff engine
    if (fixResult.operations.length > 0) {
      const updateResult = await handleUpdatePartialWorkflow(
        {
          id: workflow.id,
          operations: fixResult.operations,
          createBackup: true  // Ensure backup is created with autofix metadata
        },
        repository,
        context
      );

      if (!updateResult.success) {
        return {
          success: false,
          error: 'Failed to apply fixes',
          details: {
            fixes: fixResult.fixes,
            updateError: updateResult.error
          }
        };
      }

      return {
        success: true,
        data: {
          workflowId: workflow.id,
          workflowName: workflow.name,
          fixesApplied: fixResult.fixes.length,
          fixes: fixResult.fixes,
          summary: fixResult.summary,
          stats: fixResult.stats,
          message: `Successfully applied ${fixResult.fixes.length} fixes to workflow "${workflow.name}"`
        }
      };
    }

    return {
      success: true,
      data: {
        workflowId: workflow.id,
        workflowName: workflow.name,
        message: 'No fixes needed'
      }
    };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }

    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// Execution Management Handlers

/**
 * Handler for n8n_test_workflow tool
 * Triggers workflow execution via auto-detected or specified trigger type
 */
export async function handleTestWorkflow(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const input = testWorkflowSchema.parse(args);

    // Import trigger system (lazy to avoid circular deps)
    const {
      detectTriggerFromWorkflow,
      ensureRegistryInitialized,
      TriggerRegistry,
    } = await import('../triggers');

    // Ensure registry is initialized
    await ensureRegistryInitialized();

    // Fetch the workflow to analyze its trigger
    const workflow = await client.getWorkflow(input.workflowId);

    // Determine trigger type
    let triggerType: TriggerType | undefined = input.triggerType as TriggerType | undefined;
    let triggerInfo;

    // Auto-detect from workflow
    const detection = detectTriggerFromWorkflow(workflow);

    if (!triggerType) {
      if (detection.detected && detection.trigger) {
        triggerType = detection.trigger.type;
        triggerInfo = detection.trigger;
      } else {
        // No externally-triggerable trigger found
        return {
          success: false,
          error: 'Workflow cannot be triggered externally',
          details: {
            workflowId: input.workflowId,
            reason: detection.reason,
            hint: 'Only workflows with webhook, form, or chat triggers can be executed via the API. Add one of these trigger nodes to your workflow.',
          },
        };
      }
    } else {
      // User specified a trigger type, verify it matches workflow
      if (detection.detected && detection.trigger?.type === triggerType) {
        triggerInfo = detection.trigger;
      } else if (!detection.detected || detection.trigger?.type !== triggerType) {
        return {
          success: false,
          error: `Workflow does not have a ${triggerType} trigger`,
          details: {
            workflowId: input.workflowId,
            requestedTrigger: triggerType,
            detectedTrigger: detection.trigger?.type || 'none',
            hint: detection.detected
              ? `Workflow has a ${detection.trigger?.type} trigger. Either use that type or omit triggerType for auto-detection.`
              : 'Workflow has no externally-triggerable triggers (webhook, form, or chat).',
          },
        };
      }
    }

    // Get handler for trigger type
    const handler = TriggerRegistry.getHandler(triggerType, client, context);
    if (!handler) {
      return {
        success: false,
        error: `No handler registered for trigger type: ${triggerType}`,
        details: {
          supportedTypes: TriggerRegistry.getRegisteredTypes(),
        },
      };
    }

    // Check if workflow is active (if required by handler)
    if (handler.capabilities.requiresActiveWorkflow && !workflow.active) {
      return {
        success: false,
        error: 'Workflow must be active to trigger via this method',
        details: {
          workflowId: input.workflowId,
          triggerType,
          hint: 'Activate the workflow in n8n using n8n_update_partial_workflow with [{type: "activateWorkflow"}]',
        },
      };
    }

    // Validate chat trigger has message
    if (triggerType === 'chat' && !input.message) {
      return {
        success: false,
        error: 'Chat trigger requires a message parameter',
        details: {
          hint: 'Provide message="your message" for chat triggers',
        },
      };
    }

    // Build trigger-specific input
    const triggerInput = {
      workflowId: input.workflowId,
      triggerType,
      httpMethod: input.httpMethod,
      webhookPath: input.webhookPath,
      message: input.message || '',
      sessionId: input.sessionId,
      data: input.data,
      formData: input.data, // For form triggers
      headers: input.headers,
      timeout: input.timeout,
      waitForResponse: input.waitForResponse,
    };

    // Execute the trigger
    const response = await handler.execute(triggerInput as any, workflow, triggerInfo);

    return {
      success: response.success,
      data: response.data,
      message: response.success
        ? `Workflow triggered successfully via ${triggerType}`
        : response.error,
      executionId: response.executionId,
      workflowId: input.workflowId,
      details: {
        triggerType,
        metadata: response.metadata,
        ...(response.details || {}),
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors },
      };
    }

    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
        details: error.details as Record<string, unknown> | undefined,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export async function handleGetExecution(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);

    // Parse and validate input with new parameters
    const schema = z.object({
      id: z.string(),
      // Filtering parameters
      mode: z.enum(['preview', 'summary', 'filtered', 'full', 'error']).optional(),
      nodeNames: z.array(z.string()).optional(),
      itemsLimit: z.number().optional(),
      includeInputData: z.boolean().optional(),
      // Legacy parameter (backward compatibility)
      includeData: z.boolean().optional(),
      // Error mode specific parameters
      errorItemsLimit: z.number().min(0).max(100).optional(),
      includeStackTrace: z.boolean().optional(),
      includeExecutionPath: z.boolean().optional(),
      fetchWorkflow: z.boolean().optional()
    });

    const params = schema.parse(args);
    const {
      id,
      mode,
      nodeNames,
      itemsLimit,
      includeInputData,
      includeData,
      errorItemsLimit,
      includeStackTrace,
      includeExecutionPath,
      fetchWorkflow
    } = params;

    /**
     * Map legacy includeData parameter to mode for backward compatibility
     *
     * Legacy behavior:
     * - includeData: undefined -> minimal execution summary (no data)
     * - includeData: false -> minimal execution summary (no data)
     * - includeData: true -> full execution data
     *
     * New behavior mapping:
     * - includeData: undefined -> no mode (minimal)
     * - includeData: false -> no mode (minimal)
     * - includeData: true -> mode: 'summary' (2 items per node, not full)
     *
     * Note: Legacy true behavior returned ALL data, which could exceed token limits.
     * New behavior caps at 2 items for safety. Users can use mode: 'full' for old behavior.
     */
    let effectiveMode = mode;
    if (!effectiveMode && includeData !== undefined) {
      effectiveMode = includeData ? 'summary' : undefined;
    }

    // Determine if we need to fetch full data from API
    // We fetch full data if any mode is specified (including preview) or legacy includeData is true
    // Preview mode needs the data to analyze structure and generate recommendations
    const fetchFullData = effectiveMode !== undefined || includeData === true;

    // Fetch execution from n8n API
    const execution = await client.getExecution(id, fetchFullData);

    // If no filtering options specified, return original execution (backward compatibility)
    if (!effectiveMode && !nodeNames && itemsLimit === undefined) {
      return {
        success: true,
        data: execution
      };
    }

    // For error mode, optionally fetch workflow for accurate upstream detection
    let workflow: Workflow | undefined;
    if (effectiveMode === 'error' && fetchWorkflow !== false && execution.workflowId) {
      try {
        workflow = await client.getWorkflow(execution.workflowId);
      } catch (e) {
        // Workflow fetch failed - continue without it (use heuristics)
        logger.debug('Could not fetch workflow for error analysis', {
          workflowId: execution.workflowId,
          error: e instanceof Error ? e.message : 'Unknown error'
        });
      }
    }

    // Apply filtering using ExecutionProcessor
    const filterOptions: ExecutionFilterOptions = {
      mode: effectiveMode,
      nodeNames,
      itemsLimit,
      includeInputData,
      // Error mode specific options
      errorItemsLimit,
      includeStackTrace,
      includeExecutionPath
    };

    const processedExecution = processExecution(execution, filterOptions, workflow);

    return {
      success: true,
      data: processedExecution
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }

    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleListExecutions(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const input = listExecutionsSchema.parse(args || {});
    
    const response = await client.listExecutions({
      limit: input.limit || 100,
      cursor: input.cursor,
      workflowId: input.workflowId,
      projectId: input.projectId,
      status: input.status as ExecutionStatus | undefined,
      includeData: input.includeData || false
    });
    
    return {
      success: true,
      data: {
        executions: response.data,
        returned: response.data.length,
        nextCursor: response.nextCursor,
        hasMore: !!response.nextCursor,
        ...(response.nextCursor ? { 
          _note: "More executions available. Use cursor to get next page." 
        } : {})
      }
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function handleDeleteExecution(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const { id } = z.object({ id: z.string() }).parse(args);
    
    await client.deleteExecution(id);
    
    return {
      success: true,
      message: `Execution ${id} deleted successfully`
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }
    
    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// System Tools Handlers

export async function handleHealthCheck(context?: InstanceContext): Promise<McpToolResponse> {
  const startTime = Date.now();

  try {
    const client = ensureApiConfigured(context);
    const health = await client.healthCheck();

    // Get MCP version from package.json
    const packageJson = require('../../package.json');
    const mcpVersion = packageJson.version;
    const supportedN8nVersion = packageJson.dependencies?.n8n?.replace(/[^0-9.]/g, '');

    // Check npm for latest version (async, non-blocking)
    const versionCheck = await checkNpmVersion();

    // Get cache metrics for performance monitoring
    const cacheMetricsData = getInstanceCacheMetrics();

    // Calculate response time
    const responseTime = Date.now() - startTime;

    // Build response data
    const responseData: HealthCheckResponseData = {
      status: health.status,
      instanceId: health.instanceId,
      n8nVersion: health.n8nVersion,
      features: health.features,
      apiUrl: getN8nApiConfig()?.baseUrl,
      mcpVersion,
      supportedN8nVersion,
      versionCheck: {
        current: versionCheck.currentVersion,
        latest: versionCheck.latestVersion,
        upToDate: !versionCheck.isOutdated,
        message: formatVersionMessage(versionCheck),
        ...(versionCheck.updateCommand ? { updateCommand: versionCheck.updateCommand } : {})
      },
      performance: {
        responseTimeMs: responseTime,
        cacheHitRate: (cacheMetricsData.hits + cacheMetricsData.misses) > 0
          ? ((cacheMetricsData.hits / (cacheMetricsData.hits + cacheMetricsData.misses)) * 100).toFixed(2) + '%'
          : 'N/A',
        cachedInstances: cacheMetricsData.size
      }
    };

    // Add next steps guidance
    responseData.nextSteps = [
      '• Create workflow: n8n_create_workflow',
      '• List workflows: n8n_list_workflows',
      '• Search nodes: search_nodes',
      '• Browse templates: search_templates'
    ];

    // Add update warning if outdated
    if (versionCheck.isOutdated && versionCheck.latestVersion) {
      responseData.updateWarning = `⚠️  n8n-mcp v${versionCheck.latestVersion} is available (you have v${versionCheck.currentVersion}). Update recommended.`;
    }

    return {
      success: true,
      data: responseData
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;

    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
        details: {
          apiUrl: getN8nApiConfig()?.baseUrl,
          hint: 'Check if n8n is running and API is enabled',
          troubleshooting: [
            '1. Verify n8n instance is running',
            '2. Check N8N_API_URL is correct',
            '3. Verify N8N_API_KEY has proper permissions',
            '4. Run n8n_health_check with mode="diagnostic" for detailed analysis'
          ]
        }
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// Environment-aware debugging helpers

/**
 * Detect cloud platform from environment variables
 * Returns platform name or null if not in cloud
 */
function detectCloudPlatform(): string | null {
  if (process.env.RAILWAY_ENVIRONMENT) return 'railway';
  if (process.env.RENDER) return 'render';
  if (process.env.FLY_APP_NAME) return 'fly';
  if (process.env.HEROKU_APP_NAME) return 'heroku';
  if (process.env.AWS_EXECUTION_ENV) return 'aws';
  if (process.env.KUBERNETES_SERVICE_HOST) return 'kubernetes';
  if (process.env.GOOGLE_CLOUD_PROJECT) return 'gcp';
  if (process.env.AZURE_FUNCTIONS_ENVIRONMENT) return 'azure';
  return null;
}

/**
 * Get mode-specific debugging suggestions
 */
function getModeSpecificDebug(mcpMode: string) {
  if (mcpMode === 'http') {
    const port = process.env.MCP_PORT || process.env.PORT || 3000;
    return {
      mode: 'HTTP Server',
      port,
      authTokenConfigured: !!(process.env.MCP_AUTH_TOKEN || process.env.AUTH_TOKEN),
      corsEnabled: true,
      serverUrl: `http://localhost:${port}`,
      healthCheckUrl: `http://localhost:${port}/health`,
      troubleshooting: [
        `1. Test server health: curl http://localhost:${port}/health`,
        '2. Check browser console for CORS errors',
        '3. Verify MCP_AUTH_TOKEN or AUTH_TOKEN if authentication enabled',
        `4. Ensure port ${port} is not in use: lsof -i :${port} (macOS/Linux) or netstat -ano | findstr :${port} (Windows)`,
        '5. Check firewall settings for port access',
        '6. Review server logs for connection errors'
      ],
      commonIssues: [
        'CORS policy blocking browser requests',
        'Port already in use by another application',
        'Authentication token mismatch',
        'Network firewall blocking connections'
      ]
    };
  } else {
    // stdio mode
    const configLocation = process.platform === 'darwin'
      ? '~/Library/Application Support/Claude/claude_desktop_config.json'
      : process.platform === 'win32'
      ? '%APPDATA%\\Claude\\claude_desktop_config.json'
      : '~/.config/Claude/claude_desktop_config.json';

    return {
      mode: 'Standard I/O (Claude Desktop)',
      configLocation,
      troubleshooting: [
        '1. Verify Claude Desktop config file exists and is valid JSON',
        '2. Check MCP server entry: {"mcpServers": {"n8n": {"command": "npx", "args": ["-y", "n8n-mcp"]}}}',
        '3. Restart Claude Desktop after config changes',
        '4. Check Claude Desktop logs for startup errors',
        '5. Test npx can run: npx -y n8n-mcp --version',
        '6. Verify executable permissions if using local installation'
      ],
      commonIssues: [
        'Invalid JSON in claude_desktop_config.json',
        'Incorrect command or args in MCP server config',
        'Claude Desktop not restarted after config changes',
        'npx unable to download or run package',
        'Missing execute permissions on local binary'
      ]
    };
  }
}

/**
 * Get Docker-specific debugging suggestions
 */
function getDockerDebug(isDocker: boolean) {
  if (!isDocker) return null;

  return {
    containerDetected: true,
    troubleshooting: [
      '1. Verify volume mounts for data/nodes.db',
      '2. Check network connectivity to n8n instance',
      '3. Ensure ports are correctly mapped',
      '4. Review container logs: docker logs <container-name>',
      '5. Verify environment variables passed to container',
      '6. Check IS_DOCKER=true is set correctly'
    ],
    commonIssues: [
      'Volume mount not persisting database',
      'Network isolation preventing n8n API access',
      'Port mapping conflicts',
      'Missing environment variables in container'
    ]
  };
}

/**
 * Get cloud platform-specific suggestions
 */
function getCloudPlatformDebug(cloudPlatform: string | null) {
  if (!cloudPlatform) return null;

  const platformGuides: Record<string, CloudPlatformGuide> = {
    railway: {
      name: 'Railway',
      troubleshooting: [
        '1. Check Railway environment variables are set',
        '2. Verify deployment logs in Railway dashboard',
        '3. Ensure PORT matches Railway assigned port (automatic)',
        '4. Check networking configuration for external access'
      ]
    },
    render: {
      name: 'Render',
      troubleshooting: [
        '1. Verify Render environment variables',
        '2. Check Render logs for startup errors',
        '3. Ensure health check endpoint is responding',
        '4. Verify instance type has sufficient resources'
      ]
    },
    fly: {
      name: 'Fly.io',
      troubleshooting: [
        '1. Check Fly.io logs: flyctl logs',
        '2. Verify fly.toml configuration',
        '3. Ensure volumes are properly mounted',
        '4. Check app status: flyctl status'
      ]
    },
    heroku: {
      name: 'Heroku',
      troubleshooting: [
        '1. Check Heroku logs: heroku logs --tail',
        '2. Verify Procfile configuration',
        '3. Ensure dynos are running: heroku ps',
        '4. Check environment variables: heroku config'
      ]
    },
    kubernetes: {
      name: 'Kubernetes',
      troubleshooting: [
        '1. Check pod logs: kubectl logs <pod-name>',
        '2. Verify service and ingress configuration',
        '3. Check persistent volume claims',
        '4. Verify resource limits and requests'
      ]
    },
    aws: {
      name: 'AWS',
      troubleshooting: [
        '1. Check CloudWatch logs',
        '2. Verify IAM roles and permissions',
        '3. Check security groups and networking',
        '4. Verify environment variables in service config'
      ]
    }
  };

  return platformGuides[cloudPlatform] || {
    name: cloudPlatform.toUpperCase(),
    troubleshooting: [
      '1. Check cloud platform logs',
      '2. Verify environment variables are set',
      '3. Check networking and port configuration',
      '4. Review platform-specific documentation'
    ]
  };
}

// Handler: n8n_diagnostic
export async function handleDiagnostic(request: any, context?: InstanceContext): Promise<McpToolResponse> {
  const startTime = Date.now();
  const verbose = request.params?.arguments?.verbose || false;

  // Detect environment for targeted debugging
  const mcpMode = process.env.MCP_MODE || 'stdio';
  const isDocker = process.env.IS_DOCKER === 'true';
  const cloudPlatform = detectCloudPlatform();

  // Check environment variables
  const envVars = {
    N8N_API_URL: process.env.N8N_API_URL || null,
    N8N_API_KEY: process.env.N8N_API_KEY ? '***configured***' : null,
    NODE_ENV: process.env.NODE_ENV || 'production',
    MCP_MODE: mcpMode,
    isDocker,
    cloudPlatform,
    nodeVersion: process.version,
    platform: process.platform
  };

  // Check API configuration
  const apiConfig = getN8nApiConfig();
  const apiConfigured = apiConfig !== null;
  const apiClient = getN8nApiClient(context);

  // Test API connectivity if configured
  let apiStatus = {
    configured: apiConfigured,
    connected: false,
    error: null as string | null,
    version: null as string | null
  };

  if (apiClient) {
    try {
      const health = await apiClient.healthCheck();
      apiStatus.connected = true;
      apiStatus.version = health.n8nVersion || 'unknown';
    } catch (error) {
      apiStatus.error = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  // Check which tools are available
  const documentationTools = 7; // Base documentation tools (after v2.26.0 consolidation)
  const managementTools = apiConfigured ? 14 : 0; // Management tools requiring API (includes n8n_manage_datatable)
  const totalTools = documentationTools + managementTools;

  // Check npm version
  const versionCheck = await checkNpmVersion();

  // Get performance metrics
  const cacheMetricsData = getInstanceCacheMetrics();
  const responseTime = Date.now() - startTime;

  // Build diagnostic report
  const diagnostic: DiagnosticResponseData = {
    timestamp: new Date().toISOString(),
    environment: envVars,
    apiConfiguration: {
      configured: apiConfigured,
      status: apiStatus,
      config: apiConfig ? {
        baseUrl: apiConfig.baseUrl,
        timeout: apiConfig.timeout,
        maxRetries: apiConfig.maxRetries
      } : null
    },
    versionInfo: {
      current: versionCheck.currentVersion,
      latest: versionCheck.latestVersion,
      upToDate: !versionCheck.isOutdated,
      message: formatVersionMessage(versionCheck),
      ...(versionCheck.updateCommand ? { updateCommand: versionCheck.updateCommand } : {})
    },
    toolsAvailability: {
      documentationTools: {
        count: documentationTools,
        enabled: true,
        description: 'Always available - node info, search, validation, etc.'
      },
      managementTools: {
        count: managementTools,
        enabled: apiConfigured,
        description: apiConfigured ?
          'Management tools are ENABLED - create, update, execute workflows' :
          'Management tools are DISABLED - configure N8N_API_URL and N8N_API_KEY to enable'
      },
      totalAvailable: totalTools
    },
    performance: {
      diagnosticResponseTimeMs: responseTime,
      cacheHitRate: (cacheMetricsData.hits + cacheMetricsData.misses) > 0
        ? ((cacheMetricsData.hits / (cacheMetricsData.hits + cacheMetricsData.misses)) * 100).toFixed(2) + '%'
        : 'N/A',
      cachedInstances: cacheMetricsData.size
    },
    modeSpecificDebug: getModeSpecificDebug(mcpMode)
  };

  // Provide next steps when API is working
  if (apiConfigured && apiStatus.connected) {
    // API is working - provide next steps
    diagnostic.nextSteps = {
      message: '✓ API connected! Here\'s what you can do:',
      recommended: [
        {
          action: 'n8n_list_workflows',
          description: 'See your existing workflows',
          timing: 'Fast (6 seconds median)'
        },
        {
          action: 'n8n_create_workflow',
          description: 'Create a new workflow',
          timing: 'Typically 6-14 minutes to build'
        },
        {
          action: 'search_nodes',
          description: 'Discover available nodes',
          timing: 'Fast - explore 500+ nodes'
        },
        {
          action: 'search_templates',
          description: 'Browse pre-built workflows',
          timing: 'Find examples quickly'
        }
      ],
      tips: [
        '82% of users start creating workflows after diagnostics - you\'re ready to go!',
        'Most common first action: n8n_update_partial_workflow (managing existing workflows)',
        'Use n8n_validate_workflow before deploying to catch issues early'
      ]
    };
  } else if (apiConfigured && !apiStatus.connected) {
    // API configured but not connecting - troubleshooting
    diagnostic.troubleshooting = {
      issue: '⚠️ API configured but connection failed',
      error: apiStatus.error,
      steps: [
        '1. Verify n8n instance is running and accessible',
        '2. Check N8N_API_URL is correct (currently: ' + apiConfig?.baseUrl + ')',
        '3. Test URL in browser: ' + apiConfig?.baseUrl + '/healthz',
        '4. Verify N8N_API_KEY has proper permissions',
        '5. Check firewall/network settings if using remote n8n',
        '6. Try running n8n_health_check again after fixes'
      ],
      commonIssues: [
        'Wrong port number in N8N_API_URL',
        'API key doesn\'t have sufficient permissions',
        'n8n instance not running or crashed',
        'Network firewall blocking connection'
      ],
      documentation: 'https://github.com/czlonkowski/n8n-mcp?tab=readme-ov-file#n8n-management-tools-optional---requires-api-configuration'
    };
  } else {
    // API not configured - setup guidance
    diagnostic.setupGuide = {
      message: 'n8n API not configured. You can still use documentation tools!',
      whatYouCanDoNow: {
        documentation: [
          {
            tool: 'search_nodes',
            description: 'Search 500+ n8n nodes',
            example: 'search_nodes({query: "slack"})'
          },
          {
            tool: 'get_node_essentials',
            description: 'Get node configuration details',
            example: 'get_node_essentials({nodeType: "nodes-base.httpRequest"})'
          },
          {
            tool: 'search_templates',
            description: 'Browse workflow templates',
            example: 'search_templates({query: "chatbot"})'
          },
          {
            tool: 'validate_workflow',
            description: 'Validate workflow JSON',
            example: 'validate_workflow({workflow: {...}})'
          }
        ],
        note: '14 documentation tools available without API configuration'
      },
      whatYouCannotDo: [
        '✗ Create/update workflows in n8n instance',
        '✗ List your workflows',
        '✗ Execute workflows',
        '✗ View execution results'
      ],
      howToEnable: {
        steps: [
          '1. Get your n8n API key: [Your n8n instance]/settings/api',
          '2. Set environment variables:',
          '   N8N_API_URL=https://your-n8n-instance.com',
          '   N8N_API_KEY=your_api_key_here',
          '3. Restart the MCP server',
          '4. Run n8n_health_check with mode="diagnostic" to verify',
          '5. All 19 tools will be available!'
        ],
        documentation: 'https://github.com/czlonkowski/n8n-mcp?tab=readme-ov-file#n8n-management-tools-optional---requires-api-configuration'
      }
    };
  }

  // Add version warning if outdated
  if (versionCheck.isOutdated && versionCheck.latestVersion) {
    diagnostic.updateWarning = {
      message: `⚠️ Update available: v${versionCheck.currentVersion} → v${versionCheck.latestVersion}`,
      command: versionCheck.updateCommand,
      benefits: [
        'Latest bug fixes and improvements',
        'New features and tools',
        'Better performance and reliability'
      ]
    };
  }

  // Add Docker-specific debugging if in container
  const dockerDebug = getDockerDebug(isDocker);
  if (dockerDebug) {
    diagnostic.dockerDebug = dockerDebug;
  }

  // Add cloud platform-specific debugging if detected
  const cloudDebug = getCloudPlatformDebug(cloudPlatform);
  if (cloudDebug) {
    diagnostic.cloudPlatformDebug = cloudDebug;
  }

  // Add verbose debug info if requested
  if (verbose) {
    diagnostic.debug = {
      processEnv: Object.keys(process.env).filter(key =>
        key.startsWith('N8N_') || key.startsWith('MCP_')
      ),
      nodeVersion: process.version,
      platform: process.platform,
      workingDirectory: process.cwd(),
      cacheMetrics: cacheMetricsData
    };
  }

  return {
    success: true,
    data: diagnostic
  };
}

export async function handleWorkflowVersions(
  args: unknown,
  repository: NodeRepository,
  context?: InstanceContext
): Promise<McpToolResponse> {
  try {
    const input = workflowVersionsSchema.parse(args);
    const client = context ? getN8nApiClient(context) : null;
    const versioningService = new WorkflowVersioningService(repository, client || undefined);

    switch (input.mode) {
      case 'list': {
        if (!input.workflowId) {
          return {
            success: false,
            error: 'workflowId is required for list mode'
          };
        }

        const versions = await versioningService.getVersionHistory(input.workflowId, input.limit);

        return {
          success: true,
          data: {
            workflowId: input.workflowId,
            versions,
            count: versions.length,
            message: `Found ${versions.length} version(s) for workflow ${input.workflowId}`
          }
        };
      }

      case 'get': {
        if (!input.versionId) {
          return {
            success: false,
            error: 'versionId is required for get mode'
          };
        }

        const version = await versioningService.getVersion(input.versionId);

        if (!version) {
          return {
            success: false,
            error: `Version ${input.versionId} not found`
          };
        }

        return {
          success: true,
          data: version
        };
      }

      case 'rollback': {
        if (!input.workflowId) {
          return {
            success: false,
            error: 'workflowId is required for rollback mode'
          };
        }

        if (!client) {
          return {
            success: false,
            error: 'n8n API not configured. Cannot perform rollback without API access.'
          };
        }

        const result = await versioningService.restoreVersion(
          input.workflowId,
          input.versionId,
          input.validateBefore
        );

        return {
          success: result.success,
          data: result.success ? result : undefined,
          error: result.success ? undefined : result.message,
          details: result.success ? undefined : {
            validationErrors: result.validationErrors
          }
        };
      }

      case 'delete': {
        if (input.deleteAll) {
          if (!input.workflowId) {
            return {
              success: false,
              error: 'workflowId is required for deleteAll mode'
            };
          }

          const result = await versioningService.deleteAllVersions(input.workflowId);

          return {
            success: true,
            data: {
              workflowId: input.workflowId,
              deleted: result.deleted,
              message: result.message
            }
          };
        } else {
          if (!input.versionId) {
            return {
              success: false,
              error: 'versionId is required for single version delete'
            };
          }

          const result = await versioningService.deleteVersion(input.versionId);

          return {
            success: result.success,
            data: result.success ? { message: result.message } : undefined,
            error: result.success ? undefined : result.message
          };
        }
      }

      case 'prune': {
        if (!input.workflowId) {
          return {
            success: false,
            error: 'workflowId is required for prune mode'
          };
        }

        const result = await versioningService.pruneVersions(
          input.workflowId,
          input.maxVersions || 10
        );

        return {
          success: true,
          data: {
            workflowId: input.workflowId,
            pruned: result.pruned,
            remaining: result.remaining,
            message: `Pruned ${result.pruned} old version(s), ${result.remaining} version(s) remaining`
          }
        };
      }

      case 'truncate': {
        if (!input.confirmTruncate) {
          return {
            success: false,
            error: 'confirmTruncate must be true to truncate all versions. This action cannot be undone.'
          };
        }

        const result = await versioningService.truncateAllVersions(true);

        return {
          success: true,
          data: {
            deleted: result.deleted,
            message: result.message
          }
        };
      }

      default:
        return {
          success: false,
          error: `Unknown mode: ${input.mode}`
        };
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// ========================================================================
// Template Deployment Handler
// ========================================================================

const deployTemplateSchema = z.object({
  templateId: z.number().positive().int(),
  name: z.string().optional(),
  autoUpgradeVersions: z.boolean().default(true),
  autoFix: z.boolean().default(true),  // Auto-apply fixes after deployment
  stripCredentials: z.boolean().default(true)
});

interface RequiredCredential {
  nodeType: string;
  nodeName: string;
  credentialType: string;
}

/**
 * Deploy a workflow template from n8n.io directly to the user's n8n instance.
 *
 * This handler:
 * 1. Fetches the template from the local template database
 * 2. Extracts credential requirements for user guidance
 * 3. Optionally strips credentials (for user to configure in n8n UI)
 * 4. Optionally upgrades node typeVersions to latest supported
 * 5. Optionally validates the workflow structure
 * 6. Creates the workflow in the n8n instance
 */
export async function handleDeployTemplate(
  args: unknown,
  templateService: TemplateService,
  repository: NodeRepository,
  context?: InstanceContext
): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const input = deployTemplateSchema.parse(args);

    // Fetch template
    const template = await templateService.getTemplate(input.templateId, 'full');
    if (!template) {
      return {
        success: false,
        error: `Template ${input.templateId} not found`,
        details: {
          hint: 'Use search_templates to find available templates',
          templateUrl: `https://n8n.io/workflows/${input.templateId}`
        }
      };
    }

    // Extract workflow from template (deep copy to avoid mutation)
    const workflow = JSON.parse(JSON.stringify(template.workflow));
    if (!workflow || !workflow.nodes) {
      return {
        success: false,
        error: 'Template has invalid workflow structure',
        details: { templateId: input.templateId }
      };
    }

    // Set workflow name
    const workflowName = input.name || template.name;

    // Collect required credentials before stripping
    const requiredCredentials: RequiredCredential[] = [];
    for (const node of workflow.nodes) {
      if (node.credentials && typeof node.credentials === 'object') {
        for (const [credType] of Object.entries(node.credentials)) {
          requiredCredentials.push({
            nodeType: node.type,
            nodeName: node.name,
            credentialType: credType
          });
        }
      }
    }

    // Strip credentials if requested
    if (input.stripCredentials) {
      workflow.nodes = workflow.nodes.map((node: any) => {
        const { credentials, ...rest } = node;
        return rest;
      });
    }

    // Auto-upgrade typeVersions if requested
    if (input.autoUpgradeVersions) {
      const autoFixer = new WorkflowAutoFixer(repository);

      // Run validation to get issues to fix
      const validator = new WorkflowValidator(repository, EnhancedConfigValidator);
      const validationResult = await validator.validateWorkflow(workflow, {
        validateNodes: true,
        validateConnections: false,
        validateExpressions: false,
        profile: 'runtime'
      });

      // Generate fixes focused on typeVersion upgrades
      const fixResult = await autoFixer.generateFixes(
        workflow,
        validationResult,
        [],
        { fixTypes: ['typeversion-upgrade', 'typeversion-correction'] }
      );

      // Apply fixes to workflow
      if (fixResult.operations.length > 0) {
        for (const op of fixResult.operations) {
          if (op.type === 'updateNode' && op.updates) {
            const node = workflow.nodes.find((n: any) =>
              n.id === op.nodeId || n.name === op.nodeName
            );
            if (node) {
              for (const [path, value] of Object.entries(op.updates)) {
                if (path === 'typeVersion') {
                  node.typeVersion = value;
                }
              }
            }
          }
        }
      }
    }

    // Identify trigger type
    const triggerNode = workflow.nodes.find((n: any) =>
      n.type?.includes('Trigger') ||
      n.type?.includes('webhook') ||
      n.type === 'n8n-nodes-base.webhook'
    );
    const triggerType = triggerNode?.type?.split('.').pop() || 'manual';

    // Create workflow via API (always creates inactive)
    // Deploy first, then fix - this ensures the workflow exists before we modify it
    const createdWorkflow = await client.createWorkflow({
      name: workflowName,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: workflow.settings || { executionOrder: 'v1' }
    });

    // Get base URL for workflow link
    const apiConfig = context ? getN8nApiConfigFromContext(context) : getN8nApiConfig();
    const baseUrl = apiConfig?.baseUrl?.replace('/api/v1', '') || '';

    // Auto-fix common issues after deployment (expression format, etc.)
    let fixesApplied: AppliedFix[] = [];
    let fixSummary = '';
    let autoFixStatus: 'success' | 'failed' | 'skipped' = 'skipped';

    if (input.autoFix) {
      try {
        // Run autofix on the deployed workflow
        const autofixResult = await handleAutofixWorkflow(
          {
            id: createdWorkflow.id,
            applyFixes: true,
            fixTypes: ['expression-format', 'typeversion-upgrade'],
            confidenceThreshold: 'medium'
          },
          repository,
          context
        );

        if (autofixResult.success && autofixResult.data) {
          const fixData = autofixResult.data as AutofixResultData;
          autoFixStatus = 'success';
          if (fixData.fixesApplied && fixData.fixesApplied > 0) {
            fixesApplied = fixData.fixes || [];
            fixSummary = ` Auto-fixed ${fixData.fixesApplied} issue(s).`;
          }
        }
      } catch (fixError) {
        // Log but don't fail - autofix is best-effort
        autoFixStatus = 'failed';
        logger.warn('Auto-fix failed after template deployment', {
          workflowId: createdWorkflow.id,
          error: fixError instanceof Error ? fixError.message : 'Unknown error'
        });
        fixSummary = ' Auto-fix failed (workflow deployed successfully).';
      }
    }

    return {
      success: true,
      data: {
        workflowId: createdWorkflow.id,
        name: createdWorkflow.name,
        active: false,
        nodeCount: workflow.nodes.length,
        triggerType,
        requiredCredentials: requiredCredentials.length > 0 ? requiredCredentials : undefined,
        url: baseUrl ? `${baseUrl}/workflow/${createdWorkflow.id}` : undefined,
        templateId: input.templateId,
        templateUrl: template.url || `https://n8n.io/workflows/${input.templateId}`,
        autoFixStatus,
        fixesApplied: fixesApplied.length > 0 ? fixesApplied : undefined
      },
      message: `Workflow "${createdWorkflow.name}" deployed successfully from template ${input.templateId}.${fixSummary} ${
        requiredCredentials.length > 0
          ? `Configure ${requiredCredentials.length} credential(s) in n8n to activate.`
          : ''
      }`
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }

    if (error instanceof N8nApiError) {
      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
        details: error.details as Record<string, unknown> | undefined
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Backward-compatible webhook trigger handler
 *
 * @deprecated Use handleTestWorkflow instead. This function is kept for
 * backward compatibility with existing integration tests.
 */
export async function handleTriggerWebhookWorkflow(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  const triggerWebhookSchema = z.object({
    webhookUrl: z.string().url(),
    httpMethod: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional(),
    data: z.record(z.unknown()).optional(),
    headers: z.record(z.string()).optional(),
    waitForResponse: z.boolean().optional(),
  });

  try {
    const client = ensureApiConfigured(context);
    const input = triggerWebhookSchema.parse(args);

    const webhookRequest: WebhookRequest = {
      webhookUrl: input.webhookUrl,
      httpMethod: input.httpMethod || 'POST',
      data: input.data,
      headers: input.headers,
      waitForResponse: input.waitForResponse ?? true
    };

    const response = await client.triggerWebhook(webhookRequest);

    return {
      success: true,
      data: response,
      message: 'Webhook triggered successfully'
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid input',
        details: { errors: error.errors }
      };
    }

    if (error instanceof N8nApiError) {
      const errorData = error.details as any;
      const executionId = errorData?.executionId || errorData?.id || errorData?.execution?.id;
      const workflowId = errorData?.workflowId || errorData?.workflow?.id;

      if (executionId) {
        return {
          success: false,
          error: formatExecutionError(executionId, workflowId),
          code: error.code,
          executionId,
          workflowId: workflowId || undefined
        };
      }

      if (error.code === 'SERVER_ERROR' || error.statusCode && error.statusCode >= 500) {
        return {
          success: false,
          error: formatNoExecutionError(),
          code: error.code
        };
      }

      return {
        success: false,
        error: getUserFriendlyErrorMessage(error),
        code: error.code,
        details: error.details as Record<string, unknown> | undefined
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// ========================================================================
// Data Table Handlers
// ========================================================================

// Shared Zod schemas for data table operations
const dataTableFilterConditionSchema = z.object({
  columnName: z.string().min(1),
  condition: z.enum(['eq', 'neq', 'like', 'ilike', 'gt', 'gte', 'lt', 'lte']),
  value: z.any(),
});

const dataTableFilterSchema = z.object({
  type: z.enum(['and', 'or']).optional().default('and'),
  filters: z.array(dataTableFilterConditionSchema).min(1, 'At least one filter condition is required'),
});

// Shared base schema for actions requiring a tableId
const tableIdSchema = z.object({
  tableId: z.string().min(1, 'tableId is required'),
});

// Per-action Zod schemas
const createTableSchema = z.object({
  name: z.string().min(1, 'Table name cannot be empty'),
  columns: z.array(z.object({
    name: z.string().min(1, 'Column name cannot be empty'),
    type: z.enum(['string', 'number', 'boolean', 'date']).optional(),
  })).optional(),
});

const listTablesSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

const updateTableSchema = tableIdSchema.extend({
  name: z.string().min(1, 'New table name cannot be empty'),
});

// MCP transports may serialize JSON objects/arrays as strings.
// Parse them back, but return the original value on failure so Zod reports a proper type error.
export function tryParseJson(val: unknown): unknown {
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return val; }
}

const coerceJsonArray = z.preprocess(tryParseJson, z.array(z.record(z.unknown())));
const coerceJsonObject = z.preprocess(tryParseJson, z.record(z.unknown()));
const coerceJsonFilter = z.preprocess(tryParseJson, dataTableFilterSchema);

const getRowsSchema = tableIdSchema.extend({
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().optional(),
  filter: z.union([coerceJsonFilter, z.string()]).optional(),
  sortBy: z.string().optional(),
  search: z.string().optional(),
});

const insertRowsSchema = tableIdSchema.extend({
  data: coerceJsonArray.pipe(z.array(z.record(z.unknown())).min(1, 'At least one row is required')),
  returnType: z.enum(['count', 'id', 'all']).optional(),
});

// Shared schema for update/upsert (identical structure)
const mutateRowsSchema = tableIdSchema.extend({
  filter: coerceJsonFilter,
  data: coerceJsonObject,
  returnData: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});

const deleteRowsSchema = tableIdSchema.extend({
  filter: coerceJsonFilter,
  returnData: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});

function handleDataTableError(error: unknown): McpToolResponse {
  if (error instanceof z.ZodError) {
    return { success: false, error: 'Invalid input', details: { errors: error.errors } };
  }
  if (error instanceof N8nApiError) {
    return {
      success: false,
      error: getUserFriendlyErrorMessage(error),
      code: error.code,
      details: error.details as Record<string, unknown> | undefined,
    };
  }
  return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
}

export async function handleCreateTable(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const input = createTableSchema.parse(args);
    const dataTable = await client.createDataTable(input);
    if (!dataTable || !dataTable.id) {
      return { success: false, error: 'Data table creation failed: n8n API returned an empty or invalid response' };
    }
    return {
      success: true,
      data: { id: dataTable.id, name: dataTable.name },
      message: `Data table "${dataTable.name}" created with ID: ${dataTable.id}`,
    };
  } catch (error) {
    return handleDataTableError(error);
  }
}

export async function handleListTables(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const input = listTablesSchema.parse(args || {});
    const result = await client.listDataTables(input);
    return {
      success: true,
      data: {
        tables: result.data,
        count: result.data.length,
        nextCursor: result.nextCursor || undefined,
      },
    };
  } catch (error) {
    return handleDataTableError(error);
  }
}

export async function handleGetTable(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const { tableId } = tableIdSchema.parse(args);
    const dataTable = await client.getDataTable(tableId);
    return { success: true, data: dataTable };
  } catch (error) {
    return handleDataTableError(error);
  }
}

export async function handleUpdateTable(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const { tableId, name } = updateTableSchema.parse(args);
    const dataTable = await client.updateDataTable(tableId, { name });
    const rawArgs = args as Record<string, unknown>;
    const hasColumns = rawArgs && typeof rawArgs === 'object' && 'columns' in rawArgs;
    return {
      success: true,
      data: dataTable,
      message: `Data table renamed to "${dataTable.name}"` +
        (hasColumns ? '. Note: columns parameter was ignored — table schema is immutable after creation via the public API' : ''),
    };
  } catch (error) {
    return handleDataTableError(error);
  }
}

export async function handleDeleteTable(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const { tableId } = tableIdSchema.parse(args);
    await client.deleteDataTable(tableId);
    return { success: true, message: `Data table ${tableId} deleted successfully` };
  } catch (error) {
    return handleDataTableError(error);
  }
}

export async function handleGetRows(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const { tableId, filter, sortBy, ...params } = getRowsSchema.parse(args);
    const queryParams: Record<string, unknown> = { ...params };
    if (filter) {
      queryParams.filter = typeof filter === 'string' ? filter : JSON.stringify(filter);
    }
    if (sortBy) {
      queryParams.sortBy = sortBy;
    }
    const result = await client.getDataTableRows(tableId, queryParams as any);
    return {
      success: true,
      data: {
        rows: result.data,
        count: result.data.length,
        nextCursor: result.nextCursor || undefined,
      },
    };
  } catch (error) {
    return handleDataTableError(error);
  }
}

export async function handleInsertRows(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const { tableId, ...params } = insertRowsSchema.parse(args);
    const result = await client.insertDataTableRows(tableId, params);
    return {
      success: true,
      data: result,
      message: `Rows inserted into data table ${tableId}`,
    };
  } catch (error) {
    return handleDataTableError(error);
  }
}

export async function handleUpdateRows(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const { tableId, ...params } = mutateRowsSchema.parse(args);
    const result = await client.updateDataTableRows(tableId, params);
    return {
      success: true,
      data: result,
      message: params.dryRun ? 'Dry run: rows matched (no changes applied)' : 'Rows updated successfully',
    };
  } catch (error) {
    return handleDataTableError(error);
  }
}

export async function handleUpsertRows(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const { tableId, ...params } = mutateRowsSchema.parse(args);
    const result = await client.upsertDataTableRow(tableId, params);
    return {
      success: true,
      data: result,
      message: params.dryRun ? 'Dry run: upsert previewed (no changes applied)' : 'Row upserted successfully',
    };
  } catch (error) {
    return handleDataTableError(error);
  }
}

export async function handleDeleteRows(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const { tableId, filter, ...params } = deleteRowsSchema.parse(args);
    const queryParams = {
      filter: JSON.stringify(filter),
      ...params,
    };
    const result = await client.deleteDataTableRows(tableId, queryParams as any);
    return {
      success: true,
      data: result,
      message: params.dryRun ? 'Dry run: rows matched for deletion (no changes applied)' : 'Rows deleted successfully',
    };
  } catch (error) {
    return handleDataTableError(error);
  }
}

// ========================================================================
// External Documentation Fallback Tools
// ========================================================================

/**
 * Search external n8n documentation using layered fallback strategy.
 * Layer 1: Kapa.ai MCP → Layer 2: llms.txt → Layer 3: docs.n8n.io link
 *
 * When source='auto': uses the DocsFallbackService orchestrator.
 * When source='kapa_ai': queries Kapa.ai directly (no fallback).
 * When source='llms_txt': queries llms.txt directly (no fallback).
 */
export async function handleSearchExternalDocs(args: unknown): Promise<McpToolResponse> {
  const schema = z.object({
    query: z.string().min(1),
    source: z.enum(['auto', 'kapa_ai', 'llms_txt']).default('auto'),
  });

  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid input: ${parsed.error.message}`,
    };
  }

  const { query, source } = parsed.data;
  const orchestrator = getDocsFallbackService();

  try {
    let result: DocsSearchResult | null = null;

    if (source === 'kapa_ai') {
      result = await orchestrator.searchKapaOnly(query);
    } else if (source === 'llms_txt') {
      result = await orchestrator.searchLlmsTxtOnly(query);
    } else {
      result = await orchestrator.search(query);
    }

    if (!result) {
      const searchUrl = `https://docs.n8n.io/search/?q=${encodeURIComponent(query)}`;
      return {
        success: true,
        message: `No results found. Search n8n documentation directly: ${searchUrl}`,
      };
    }

    const sourceLabel = result.source === 'kapa_ai' ? 'Kapa.ai' : result.source === 'llms_txt' ? 'llms.txt' : 'n8n Docs';
    let response = `## ${sourceLabel} Search Results\n\n${result.content}`;

    if (result.confidence !== undefined) {
      response = `## ${sourceLabel} Search Results (Confidence: ${Math.round(result.confidence * 100)}%)\n\n${result.content}`;
    }

    response += `\n\n---\n\n*Source: ${sourceLabel} | Time: ${result.elapsedMs}ms*`;
    response += `\n\nFor more details, visit: https://docs.n8n.io/search/?q=${encodeURIComponent(query)}`;

    return {
      success: true,
      message: response,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.debug('handleSearchExternalDocs failed', { query: query.slice(0, 100), error: message });

    const searchUrl = `https://docs.n8n.io/search/?q=${encodeURIComponent(query)}`;
    return {
      success: false,
      error: `External docs search failed: ${message}. Search directly: ${searchUrl}`,
    };
  }
}

// ========================================================================
// llms.txt Search Tool (D.2)
// ========================================================================

/**
 * Search n8n documentation via llms.txt index.
 * This is Layer 2 of the documentation fallback strategy.
 * Fetches the machine-readable llms.txt from docs.n8n.io and performs keyword search.
 */
export async function handleSearchLlmsTxt(args: unknown): Promise<McpToolResponse> {
  const schema = z.object({
    query: z.string().min(1),
    maxResults: z.number().min(1).max(20).default(5),
  });

  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid input: ${parsed.error.message}`,
    };
  }

  const { query, maxResults } = parsed.data;

  try {
    const service = getLlmsTxtService();
    const results = await service.search(query, maxResults);

    if (results.length === 0) {
      return {
        success: true,
        message: `No results found in llms.txt for "${query}". Try rephrasing your query or search n8n documentation directly at https://docs.n8n.io/search/?q=${encodeURIComponent(query)}`,
      };
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

    const response = `## llms.txt Search Results for "${query}"\n\n${formattedResults.join('\n\n---\n\n')}`;

    return {
      success: true,
      message: response + `\n\n---\n\nFor more details, visit: https://docs.n8n.io/search/?q=${encodeURIComponent(query)}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.debug('handleSearchLlmsTxt failed', { query, error: message });

    return {
      success: false,
      error: `llms.txt search failed: ${message}. Try searching directly at https://docs.n8n.io/search/?q=${encodeURIComponent(query)}`,
    };
  }
}

// ========================================================================
// Kapa.ai Search Tool
// ========================================================================

/**
 * Search n8n documentation using Kapa.ai MCP server directly.
 * This is Layer 1 of the documentation fallback strategy.
 */
export async function handleSearchKapaAi(args: unknown): Promise<McpToolResponse> {
  const schema = z.object({
    query: z.string().min(1),
    includeSources: z.boolean().default(true),
  });

  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid input: ${parsed.error.message}`,
    };
  }

  const { query, includeSources } = parsed.data;

  try {
    const client = getKapaAiClient();
    const result = await client.search(query);

    if (!result.success) {
      return {
        success: false,
        error: result.error ?? 'Kapa.ai search returned no results',
      };
    }

    if (result.results.length === 0) {
      return {
        success: true,
        message: `No results found in Kapa.ai for "${query}". Try rephrasing your question or check the n8n documentation directly at https://docs.n8n.io/search/?q=${encodeURIComponent(query)}`,
      };
    }

    const firstResult = result.results[0];
    let response = `## Kapa.ai Search Results\n\n${firstResult.answer}`;

    if (includeSources && firstResult.source) {
      response += `\n\n**Source:** ${firstResult.source}`;
    }

    if (firstResult.confidence !== undefined) {
      response += `\n**Confidence:** ${Math.round(firstResult.confidence * 100)}%`;
    }

    response += `\n\n---\n\nFor more details, visit: https://docs.n8n.io/search/?q=${encodeURIComponent(query)}`;

    return {
      success: true,
      message: response,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.debug('handleSearchKapaAi failed', { query, error: message });

    return {
      success: false,
      error: `Kapa.ai search failed: ${message}`,
    };
  }
}

// ========================================================================
// Node Suggestion Tool
// ========================================================================

/**
 * Suggest n8n nodes based on a task description.
 * Uses keyword matching against known node type mappings.
 */
export async function handleSuggestNodes(args: unknown): Promise<McpToolResponse> {
  const schema = z.object({
    task: z.string().min(1),
    maxResults: z.number().min(1).max(20).default(5),
    includeTriggers: z.boolean().default(true),
  });

  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid input: ${parsed.error.message}`,
    };
  }

  const { task, maxResults, includeTriggers } = parsed.data;
  const keywords = task.toLowerCase().split(/\s+/).filter(k => k.length > 2);

  // Common task keyword mappings to node types
  const keywordNodeMap: Record<string, string[]> = {
    email: ['nodes-base.emailSend', 'nodes-base.emailRead', 'nodes-base.gmail', 'nodes-base.outlook'],
    slack: ['nodes-base.slack'],
    webhook: ['nodes-base.webhook'],
    schedule: ['nodes-base.scheduleTrigger'],
    cron: ['nodes-base.scheduleTrigger'],
    sheets: ['nodes-base.googleSheets'],
    drive: ['nodes-base.googleDrive'],
    telegram: ['nodes-base.telegram'],
    discord: ['nodes-base.discord'],
    http: ['nodes-base.httpRequest'],
    api: ['nodes-base.httpRequest'],
    database: ['nodes-base.postgres', 'nodes-base.mysql', 'nodes-base.sqlite'],
    postgres: ['nodes-base.postgres'],
    mysql: ['nodes-base.mysql'],
    file: ['nodes-base.readWriteFile'],
    image: ['nodes-base.moveBinaryData'],
    code: ['nodes-base.code'],
    transform: ['nodes-base.code', 'nodes-base.set'],
    merge: ['nodes-base.merge'],
    if: ['nodes-base.if'],
    switch: ['nodes-base.switch'],
    loop: ['nodes-base.splitOut'],
    wait: ['nodes-base.wait'],
    rss: ['nodes-base.rssFeedRead'],
    twitter: ['nodes-base.twitter'],
    github: ['nodes-base.github'],
    gitlab: ['nodes-base.gitlab'],
    jira: ['nodes-base.jira'],
    notion: ['nodes-base.notion'],
    airtable: ['nodes-base.airtable'],
    stripe: ['nodes-base.stripe'],
    paypal: ['nodes-base.paypal'],
  };

  // Find matching nodes
  const matchedTypes = new Set<string>();

  for (const keyword of keywords) {
    const mappedTypes = keywordNodeMap[keyword];
    if (mappedTypes) {
      mappedTypes.forEach(t => matchedTypes.add(t));
    }
  }

  // If no keyword matches, suggest general-purpose nodes
  if (matchedTypes.size === 0) {
    matchedTypes.add('nodes-base.httpRequest');
    matchedTypes.add('nodes-base.code');
    matchedTypes.add('nodes-base.set');
  }

  // Add trigger nodes if requested
  if (includeTriggers) {
    if (task.toLowerCase().includes('when') || task.toLowerCase().includes('on ') || task.toLowerCase().includes('trigger')) {
      matchedTypes.add('nodes-base.webhook');
      matchedTypes.add('nodes-base.scheduleTrigger');
    }
  }

  const suggestions = Array.from(matchedTypes).slice(0, maxResults).map(nodeType => {
    const displayName = nodeType
      .replace('nodes-base.', '')
      .replace('nodes-langchain.', '')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, s => s.toUpperCase())
      .trim();

    return {
      nodeType,
      displayName,
      suggestion: `Use "${displayName}" node (${nodeType})`,
    };
  });

  if (suggestions.length === 0) {
    return {
      success: true,
      message: `No specific node suggestions for "${task}".\n\nTry using search_nodes({query: "..."}) to find relevant nodes.`,
    };
  }

  const formattedSuggestions = suggestions.map((s, i) =>
    `${i + 1}. **${s.displayName}**\n   - Type: \`${s.nodeType}\`\n   - ${s.suggestion}`
  ).join('\n\n');

  return {
    success: true,
    message: `# Suggested Nodes for: "${task}"\n\n${formattedSuggestions}\n\n---\n\n**Next steps:**\n1. Use \`get_node({nodeType: "<type>", detail: "standard"})\` to see required properties\n2. Use \`validate_node({nodeType: "<type>", config: {...}})\` to validate configuration\n3. Use \`search_nodes({query: "<keyword>"})\` for more options`,
  };
}

// ============================================================================
// Zod schemas for tags, variables, and advanced workflow tools
const listTagsSchema = z.object({
  limit: z.number().min(1).max(1000).optional(),
  cursor: z.string().optional(),
});

const createTagSchema = z.object({
  name: z.string().min(1).max(255),
});

const listVariablesSchema = z.object({});

const createVariableSchema = z.object({
  key: z.string().min(1).max(255),
  value: z.string().min(1),
});

const updateVariableSchema = z.object({
  id: z.string().min(1),
  value: z.string(),
});

const searchWorkflowsSchema = z.object({
  query: z.string().min(1),
  active: z.boolean().optional(),
  limit: z.number().min(1).max(1000).optional(),
});

const duplicateWorkflowSchema = z.object({
  id: z.string().min(1),
  newName: z.string().min(1).max(255).optional(),
});

const exportWorkflowSchema = z.object({
  id: z.string().min(1),
});

const getWorkflowConnectionsSchema = z.object({
  id: z.string().min(1),
});

const batchCreateWorkflowsSchema = z.object({
  workflows: z
    .array(
      z.object({
        name: z.string().min(1),
        nodes: z.array(z.any()).optional(),
        connections: z.record(z.any()).optional(),
      })
    )
    .min(1)
    .max(50),
});

// TAGS MANAGEMENT
// ============================================================================

export async function handleListTags(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const parsed = listTagsSchema.safeParse(args);
    if (!parsed.success) {
      return { success: false, error: `Invalid input: ${parsed.error.message}` };
    }
    const { limit, cursor } = parsed.data;
    const tags = await client.listTags({ limit, cursor });
    return {
      success: true,
      data: tags,
      message: `Successfully retrieved ${tags.data.length} tags.`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export async function handleCreateTag(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const parsed = createTagSchema.safeParse(args);
    if (!parsed.success) {
      return { success: false, error: `Invalid input: ${parsed.error.message}` };
    }
    const { name } = parsed.data;
    const tag = await client.createTag({ name });
    return {
      success: true,
      data: tag,
      message: `Successfully created tag "${tag.name}" with ID: ${tag.id}.`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

// ============================================================================
// VARIABLES MANAGEMENT
// ============================================================================

export async function handleListVariables(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const parsed = listVariablesSchema.safeParse(args);
    if (!parsed.success) {
      return { success: false, error: `Invalid input: ${parsed.error.message}` };
    }
    const variables = await client.getVariables();
    if (!Array.isArray(variables) || variables.length === 0) {
      return {
        success: true,
        data: { variables: [], count: 0 },
        message: 'No variables found. Variables API may not be available in this n8n version.',
      };
    }
    // Sanitize: do not return variable values (they may contain secrets)
    const sanitized = variables.map((v: any) => ({ id: v.id, key: v.key }));
    return {
      success: true,
      data: { variables: sanitized, count: sanitized.length },
      message: `Successfully retrieved ${sanitized.length} variables.`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export async function handleCreateVariable(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const parsed = createVariableSchema.safeParse(args);
    if (!parsed.success) {
      return { success: false, error: `Invalid input: ${parsed.error.message}` };
    }
    const { key, value } = parsed.data;
    const variable = await client.createVariable({ key, value });
    // SECURITY: Do NOT return the value in the response
    return {
      success: true,
      data: { id: variable.id, key: variable.key },
      message: `Successfully created variable "${variable.key}" with ID: ${variable.id}.`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export async function handleUpdateVariable(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const parsed = updateVariableSchema.safeParse(args);
    if (!parsed.success) {
      return { success: false, error: `Invalid input: ${parsed.error.message}` };
    }
    const { id, value } = parsed.data;
    const variable = await client.updateVariable(id, { value });
    // SECURITY: Do NOT return the value in the response
    return {
      success: true,
      data: { id: variable.id, key: variable.key },
      message: `Successfully updated variable "${variable.key}" (ID: ${variable.id}).`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

// ============================================================================
// ADVANCED WORKFLOW TOOLS
// ============================================================================

export async function handleSearchWorkflows(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const parsed = searchWorkflowsSchema.safeParse(args);
    if (!parsed.success) {
      return { success: false, error: `Invalid input: ${parsed.error.message}` };
    }
    const { query, active, limit } = parsed.data;
    const fetchLimit = limit || 100;
    const workflows = await client.listWorkflows({ active, limit: fetchLimit });
    const queryLower = query.toLowerCase();
    const filtered = workflows.data.filter((wf: any) => {
      const nameMatch = wf.name?.toLowerCase().includes(queryLower);
      const tagMatch = wf.tags?.some((t: any) => t.name?.toLowerCase().includes(queryLower));
      return nameMatch || tagMatch;
    });
    return {
      success: true,
      data: { workflows: filtered, count: filtered.length, query, note: `Searched ${workflows.data.length} workflows (limit: ${fetchLimit}). Increase limit parameter for more results.` },
      message: `Found ${filtered.length} workflow(s) matching "${query}".`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export async function handleDuplicateWorkflow(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const parsed = duplicateWorkflowSchema.safeParse(args);
    if (!parsed.success) {
      return { success: false, error: `Invalid input: ${parsed.error.message}` };
    }
    const { id, newName } = parsed.data;
    const original = await client.getWorkflow(id);
    const dupName = newName || `${original.name} (Copy)`;
    // Explicitly select only the fields createWorkflow expects
    const duplicated = await client.createWorkflow({
      name: dupName,
      nodes: original.nodes,
      connections: original.connections,
      settings: original.settings,
      tags: original.tags,
    } as any);
    // SECURITY: Only return metadata, not the full workflow JSON with credentials
    return {
      success: true,
      data: { id: duplicated.id, name: duplicated.name, active: duplicated.active },
      message: `Successfully duplicated workflow "${original.name}" → "${duplicated.name}" (ID: ${duplicated.id}).`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export async function handleExportWorkflow(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const parsed = exportWorkflowSchema.safeParse(args);
    if (!parsed.success) {
      return { success: false, error: `Invalid input: ${parsed.error.message}` };
    }
    const { id } = parsed.data;
    const workflow = await client.getWorkflow(id);
    return {
      success: true,
      data: workflow,
      message: `Exported workflow "${workflow.name}" (ID: ${workflow.id}). ⚠️ This export may contain embedded credentials in node configurations.`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export async function handleGetWorkflowConnections(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const parsed = getWorkflowConnectionsSchema.safeParse(args);
    if (!parsed.success) {
      return { success: false, error: `Invalid input: ${parsed.error.message}` };
    }
    const { id } = parsed.data;
    const workflow = await client.getWorkflow(id);
    const nodes = workflow.nodes;
    const connections = workflow.connections;
    const edges: Array<{ from: string; to: string; type?: string }> = [];
    for (const [sourceNode, outputPorts] of Object.entries(connections)) {
      for (const outputConnections of Object.values(outputPorts)) {
        for (const connectionGroup of outputConnections) {
          for (const conn of connectionGroup) {
            if (conn?.node) {
              edges.push({ from: sourceNode, to: conn.node, type: conn.type });
            }
          }
        }
      }
    }
    return {
      success: true,
      data: {
        workflowId: workflow.id,
        workflowName: workflow.name,
        nodes: nodes.map((n) => ({ id: n.id, name: n.name, type: n.type })),
        edges,
        nodeCount: nodes.length,
        edgeCount: edges.length,
      },
      message: `Workflow "${workflow.name}" has ${nodes.length} node(s) and ${edges.length} connection(s).`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export async function handleBatchCreateWorkflows(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  try {
    const client = ensureApiConfigured(context);
    const parsed = batchCreateWorkflowsSchema.safeParse(args);
    if (!parsed.success) {
      return { success: false, error: `Invalid input: ${parsed.error.message}` };
    }
    const { workflows } = parsed.data;
    const created: Array<{ id: string; name: string }> = [];
    const failed: Array<{ name: string; error: string }> = [];
    for (const wf of workflows) {
      try {
        const result = await client.createWorkflow({
          name: wf.name,
          nodes: wf.nodes,
          connections: wf.connections,
        } as any);
        if (result.id) {
          created.push({ id: result.id, name: result.name });
        } else {
          failed.push({ name: wf.name, error: 'Workflow creation returned no ID' });
        }
      } catch (err) {
        failed.push({ name: wf.name, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return {
      success: true,
      data: { created, failed, totalRequested: workflows.length, totalCreated: created.length, totalFailed: failed.length },
      message: `Batch complete: ${created.length} created, ${failed.length} failed.`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

// ========================================================================
// Execution Management Handlers (C.3)
// ========================================================================

const executeWorkflowSchema = z.object({
  workflowId: z.string().min(1, 'workflowId is required'),
  inputData: z.record(z.unknown()).optional(),
  mode: z.enum(['run', 'error']).optional().default('run'),
});

export async function handleExecuteWorkflow(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  const parsed = executeWorkflowSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  const { workflowId, inputData, mode } = parsed.data;
  const client = ensureApiConfigured(context);

  try {
    const result = await client.executeWorkflow(workflowId, {
      data: inputData,
      mode,
    });

    return {
      success: true,
      data: {
        executionId: result.executionId,
        status: result.status,
        workflowId,
      },
      message: `Workflow execution started successfully. Execution ID: ${result.executionId}`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to execute workflow: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

const retryExecutionSchema = z.object({
  executionId: z.string().min(1, 'executionId is required'),
});

export async function handleRetryExecution(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  const parsed = retryExecutionSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  const { executionId } = parsed.data;
  const client = ensureApiConfigured(context);

  try {
    const result = await client.retryExecution(executionId);

    return {
      success: true,
      executionId: result.newExecutionId,
      data: {
        newExecutionId: result.newExecutionId,
        status: result.status,
        originalExecutionId: executionId,
      },
      message: `Execution retried successfully. New execution ID: ${result.newExecutionId}`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to retry execution: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ========================================================================
// Credential Management Handlers (C.4)
// ========================================================================

const listCredentialsSchema = z.object({
  type: z.string().optional(),
  limit: z.number().min(1).max(1000).optional().default(100),
});

export async function handleListCredentials(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  const parsed = listCredentialsSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  const { type, limit } = parsed.data;
  const client = ensureApiConfigured(context);

  try {
    const response = await client.listCredentials({ limit, filter: type ? { type } : undefined });
    const credentials = response.data || [];

    // SECURITY: Return only metadata - NEVER include credential data (secrets)
    const sanitizedCredentials = credentials.map((cred: any) => ({
      id: cred.id,
      name: cred.name,
      type: cred.type,
      createdAt: cred.createdAt,
      updatedAt: cred.updatedAt,
    }));

    return {
      success: true,
      data: {
        credentials: sanitizedCredentials,
        total: sanitizedCredentials.length,
      },
      message: `Successfully retrieved ${sanitizedCredentials.length} credential(s). Note: Secret values are not returned for security.`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list credentials: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

const getCredentialSchema = z.object({
  id: z.string().min(1, 'id is required'),
});

export async function handleGetCredential(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  const parsed = getCredentialSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  const { id } = parsed.data;
  const client = ensureApiConfigured(context);

  try {
    // AUDIT: Log credential access with guaranteed persistence (error level)
    logger.error(`[AUDIT] Credential accessed: id=${id}`, {
      action: 'credential_read',
      credentialId: id,
      timestamp: new Date().toISOString(),
    });

    const credential = await client.getCredential(id);

    // SECURITY: Remove sensitive data from response
    // The n8n API may return data with encrypted secrets - we should not expose them
    const sanitizedCredential = {
      id: credential.id,
      name: credential.name,
      type: credential.type,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    };

    return {
      success: true,
      data: sanitizedCredential,
      message: `Credential retrieved successfully. SECURITY: Secret values are not returned for security.`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get credential: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

const createCredentialSchema = z.object({
  name: z.string().min(1, 'name is required'),
  type: z.string().min(1, 'type is required'),
  data: z.record(z.unknown()),
});

export async function handleCreateCredential(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  const parsed = createCredentialSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  const { name, type, data } = parsed.data;
  const client = ensureApiConfigured(context);

  try {
    const credential = await client.createCredential({
      name,
      type,
      data,
    });

    // SECURITY: Return only metadata - NEVER return the credential data (secrets)
    return {
      success: true,
      data: {
        id: credential.id,
        name: credential.name,
        type: credential.type,
        createdAt: credential.createdAt,
      },
      message: `Credential "${name}" created successfully. Secret values are stored securely and not returned.`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to create credential: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

const updateCredentialSchema = z.object({
  id: z.string().min(1, 'id is required'),
  name: z.string().min(1).optional(),
  data: z.record(z.unknown()).optional(),
});

export async function handleUpdateCredential(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  const parsed = updateCredentialSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  const { id, name, data } = parsed.data;
  const client = ensureApiConfigured(context);

  try {
    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name;
    if (data) updateData.data = data;

    const credential = await client.updateCredential(id, updateData);

    // SECURITY: Return only metadata - NEVER return the credential data (secrets)
    return {
      success: true,
      data: {
        id: credential.id,
        name: credential.name,
        type: credential.type,
        updatedAt: credential.updatedAt,
      },
      message: `Credential "${credential.name}" updated successfully. Secret values are stored securely and not returned.`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to update credential: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

const deleteCredentialSchema = z.object({
  id: z.string().min(1, 'id is required'),
});

export async function handleDeleteCredential(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  const parsed = deleteCredentialSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  const { id } = parsed.data;
  const client = ensureApiConfigured(context);

  try {
    // Check if credential is in use by any workflows
    const workflows = await client.listWorkflows({ limit: 1000 });
    const usedByWorkflows = (workflows.data || []).filter((wf: any) => {
      return wf.nodes?.some((node: any) =>
        node.credentials && Object.values(node.credentials as Record<string, unknown>).some(
          (cred: any) => cred?.id === id
        )
      );
    });

    if (usedByWorkflows.length > 0) {
      return {
        success: false,
        error: `Credential is in use by ${usedByWorkflows.length} workflow(s). Deactivate or update these workflows before deleting.`,
        data: {
          credentialId: id,
          usedBy: usedByWorkflows.slice(0, 10).map((wf: any) => ({ id: wf.id, name: wf.name })),
        },
      };
    }

    await client.deleteCredential(id);

    return {
      success: true,
      data: { id },
      message: `Credential ${id} deleted successfully.`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to delete credential: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
