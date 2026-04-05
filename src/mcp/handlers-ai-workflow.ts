/**
 * AI Workflow Handlers - Natural language workflow creation.
 */

import { z } from 'zod';
import { getKeywordMapper } from '../services/keyword-mapper';
import { getWorkflowSpecGenerator } from '../services/workflow-spec-generator';
import { getN8nApiConfig, getN8nApiConfigFromContext } from '../config/n8n-api';
import { N8nApiClient } from '../services/n8n-api-client';
import { getNodeSuggester, type NodeSuggestion, type WorkflowTemplate } from '../services/node-suggester';
import { logger } from '../utils/logger';
import { ConfigurationError } from '../errors/configuration-error';
import type { McpToolResponse, WorkflowNode, WorkflowConnection } from '../types/n8n-api';
import type { InstanceContext } from '../types/instance-context';

// ---------------------------------------------------------------------------
// Input validation schema (Zod — used for runtime validation in handler)
// ---------------------------------------------------------------------------
const createFromPromptInputSchema = z.object({
  description: z
    .string()
    .min(10)
    .describe(
      'Natural language description of what the workflow should do.'
    ),
  workflowName: z
    .string()
    .optional()
    .describe('Optional name for the workflow. Auto-generated if not provided.'),
  activate: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to activate the workflow after creation.'),
});

// ---------------------------------------------------------------------------
// Internal result type (not exposed to MCP — we map to McpToolResponse)
// ---------------------------------------------------------------------------
interface CreateFromPromptResult {
  success: boolean;
  workflowId?: string;
  workflowName: string;
  nodesCreated: number;
  activationStatus: 'active' | 'inactive';
  mappedNodes: Array<{
    nodeType: string;
    nodeName: string;
    category: string;
    confidence: number;
  }>;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Public handler
// ---------------------------------------------------------------------------

/**
 * Handle the n8n_create_from_prompt MCP tool.
 *
 * Pipeline:
 * 1. Validate input with Zod.
 * 2. Map description keywords to n8n nodes (KeywordMapper).
 * 3. Generate workflow spec (WorkflowSpecGenerator).
 * 4. Call n8n API to create the workflow.
 * 5. Optionally activate it.
 * 6. Return structured results.
 */
export async function handleCreateFromPrompt(
  args: unknown,
  context?: InstanceContext
): Promise<McpToolResponse> {
  try {
    const input = createFromPromptInputSchema.parse(args);

    const client = ensureApiConfigured(context);

    // Step 1 — Map keywords to nodes
    const mapper = getKeywordMapper();
    const mappedNodes = mapper.mapKeywordsToNodes(input.description);

    if (mappedNodes.length === 0) {
      return buildErrorResponse(
        'No nodes matched the description.',
        'Provide a more specific description mentioning n8n node types ' +
          '(e.g., "webhook", "HTTP request", "Slack", "Google Sheets", "email").'
      );
    }

    // Step 2 — Generate workflow spec
    const specGenerator = getWorkflowSpecGenerator();
    const spec = specGenerator.generateFromNodes(mappedNodes, input.workflowName);

    // Step 3 — Create workflow via n8n API
    const nodes: WorkflowNode[] = spec.nodes.map((n) => ({
      ...n,
      parameters: n.parameters || {},
    }));

    const workflow = await client.createWorkflow({
      name: spec.name,
      nodes,
      connections: spec.connections as WorkflowConnection,
      settings: spec.settings,
    });

    if (!workflow || !workflow.id) {
      return buildErrorResponse(
        'Workflow creation failed: n8n API returned an empty response.',
        'Verify your N8N_API_URL points to the correct /api/v1 endpoint.'
      );
    }

    // Step 4 — Optionally activate
    let activationStatus: 'active' | 'inactive' = 'inactive';
    if (input.activate) {
      try {
        await client.activateWorkflow(workflow.id);
        activationStatus = 'active';
      } catch (activateError) {
        logger.warn('Failed to activate workflow after creation', {
          workflowId: workflow.id,
          error: activateError instanceof Error ? activateError.message : String(activateError),
        });
      }
    }

    // Step 5 — Build warnings
    const warnings = buildWarnings(mappedNodes);

    const result: CreateFromPromptResult = {
      success: true,
      workflowId: workflow.id,
      workflowName: spec.name,
      nodesCreated: mappedNodes.length,
      activationStatus,
      mappedNodes: mappedNodes.map((n) => ({
        nodeType: n.nodeType,
        nodeName: n.nodeName,
        category: n.category,
        confidence: n.confidence,
      })),
      warnings,
    };

    return {
      success: true,
      data: result,
      message: `Workflow "${spec.name}" created with ${mappedNodes.length} node(s).`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return buildErrorResponse(
        'Invalid input',
        error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
      );
    }

    if (error instanceof Error) {
      logger.error('handleCreateFromPrompt failed', {
        message: error.message,
        stack: error.stack,
      });
      return buildErrorResponse(
        'Workflow creation failed',
        'Check that your n8n instance is accessible and properly configured.'
      );
    }

    return buildErrorResponse(
      'Workflow creation failed',
      'Check that your n8n instance is accessible and properly configured.'
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureApiConfigured(context?: InstanceContext): N8nApiClient {
  const config = context
    ? getN8nApiConfigFromContext(context)
    : getN8nApiConfig();

  if (!config) {
    throw new ConfigurationError(
      'n8n API is not configured',
      'Set N8N_API_URL in your environment variables.'
    );
  }

  return new N8nApiClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
}

function buildErrorResponse(error: string, hint?: string): McpToolResponse {
  return {
    success: false,
    error,
    message: hint,
    data: {
      success: false,
      workflowName: '',
      nodesCreated: 0,
      activationStatus: 'inactive',
      mappedNodes: [],
      warnings: [],
    },
  };
}

function buildWarnings(
  mappedNodes: Array<{ confidence: number; nodeType: string; nodeName: string }>
): string[] {
  const warnings: string[] = [];

  // Low-confidence mappings
  const lowConfidenceNodes = mappedNodes.filter((n) => n.confidence < 0.4);
  for (const node of lowConfidenceNodes) {
    warnings.push(
      `Low confidence mapping for "${node.nodeName}" (${node.nodeType}) — ` +
        `confidence: ${node.confidence}. Review and adjust parameters manually.`
    );
  }

  // No trigger node
  const hasTrigger = mappedNodes.some((n) => n.nodeType.includes('.webhook') || n.nodeType.includes('.scheduleTrigger'));
  if (!hasTrigger) {
    warnings.push(
      'No trigger node detected. Workflows require a trigger (e.g., Webhook, Schedule) to execute. ' +
        'Add a trigger node manually or refine your description.'
    );
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// n8n_suggest_nodes handler
// ---------------------------------------------------------------------------

/**
 * Input validation schema for n8n_suggest_nodes.
 */
const suggestNodesInputSchema = z.object({
  existingNodes: z.array(z.string()).optional(),
  taskDescription: z.string().optional(),
  category: z.enum(['webhook', 'notification', 'data-sync', 'automation', 'api-integration', 'database']).optional(),
  maxResults: z.number().min(1).max(50).optional().default(5),
});

/**
 * Result type for n8n_suggest_nodes.
 */
interface SuggestNodesResult {
  success: boolean;
  suggestions?: NodeSuggestion[];
  templates?: WorkflowTemplate[];
  message?: string;
}

/**
 * Handle the n8n_suggest_nodes MCP tool.
 *
 * Routing logic:
 * - If category is provided → return templates for that category
 * - If existingNodes is provided → analyze and suggest complementary nodes
 * - If taskDescription is provided → suggest nodes based on task
 * - If none provided → return error
 */
export async function handleSuggestNodes(args: unknown): Promise<McpToolResponse> {
  try {
    const input = suggestNodesInputSchema.parse(args);
    const suggester = getNodeSuggester();

    // Case 1: Return templates by category
    if (input.category) {
      const templates = suggester.getTemplates(input.category);

      if (templates.length === 0) {
        return buildSuggestErrorResponse(
          `No templates found for category "${input.category}".`,
          `Available categories: webhook, notification, data-sync, automation, api-integration, database`
        );
      }

      const result: SuggestNodesResult = {
        success: true,
        templates,
        message: `Found ${templates.length} template(s) for category "${input.category}".`,
      };

      return {
        success: true,
        data: result,
        message: result.message,
      };
    }

    // Case 2: Analyze existing nodes and suggest complementary ones
    if (input.existingNodes && input.existingNodes.length > 0) {
      const suggestions = suggester.analyzeAndSuggest(input.existingNodes);
      const limitedSuggestions = suggestions.slice(0, input.maxResults);

      if (limitedSuggestions.length === 0) {
        return buildSuggestErrorResponse(
          'No additional node suggestions based on existing nodes.',
          'Try providing a task description instead or check if workflow is complete.'
        );
      }

      const result: SuggestNodesResult = {
        success: true,
        suggestions: limitedSuggestions,
        message: `Found ${limitedSuggestions.length} complementary node suggestion(s).`,
      };

      return {
        success: true,
        data: result,
        message: result.message,
      };
    }

    // Case 3: Suggest nodes based on task description
    if (input.taskDescription) {
      const suggestions = suggester.suggestFromTask(input.taskDescription);
      const limitedSuggestions = suggestions.slice(0, input.maxResults);

      if (limitedSuggestions.length === 0) {
        return buildSuggestErrorResponse(
          `No node suggestions for task: "${input.taskDescription}".`,
          'Try using more specific keywords (e.g., "webhook", "email", "Slack", "database").'
        );
      }

      const result: SuggestNodesResult = {
        success: true,
        suggestions: limitedSuggestions,
        message: `Found ${limitedSuggestions.length} node suggestion(s) for task.`,
      };

      return {
        success: true,
        data: result,
        message: result.message,
      };
    }

    // Case 4: No valid input
    return buildSuggestErrorResponse(
      'Either existingNodes, taskDescription, or category must be provided.',
      'Provide at least one parameter to get node suggestions.'
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return buildSuggestErrorResponse(
        'Invalid input',
        error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
      );
    }

    if (error instanceof Error) {
      logger.error('handleSuggestNodes failed', {
        message: error.message,
        stack: error.stack,
      });
      return buildSuggestErrorResponse(error.message);
    }

    return buildSuggestErrorResponse(String(error));
  }
}

/**
 * Build error response for suggest nodes handler.
 */
function buildSuggestErrorResponse(error: string, hint?: string): McpToolResponse {
  return {
    success: false,
    error,
    message: hint,
    data: {
      success: false,
      suggestions: [],
      templates: [],
    },
  };
}
