/**
 * AI Workflow Tools - MCP tool definitions for natural language workflow creation.
 */

/**
 * MCP tool definition for n8n_create_from_prompt.
 */
export const n8n_create_from_prompt = {
  name: 'n8n_create_from_prompt' as const,
  description:
    'Create an n8n workflow from a natural language description. ' +
    'Maps keywords to appropriate n8n nodes and generates a complete workflow JSON structure. ' +
    'Returns the created workflow ID, mapped nodes with confidence scores, and any warnings. ' +
    'Use this when you have a high-level description of what a workflow should accomplish ' +
    'and need the system to automatically determine the appropriate nodes and connections.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      description: {
        type: 'string' as const,
        description:
          'Natural language description of what the workflow should do. ' +
          'Example: "When a webhook receives data, send an email notification and log it to Google Sheets"',
      },
      workflowName: {
        type: 'string' as const,
        description: 'Optional name for the workflow. Auto-generated if not provided.',
      },
      activate: {
        type: 'boolean' as const,
        description: 'Whether to activate the workflow after creation. Default: false.',
      },
    },
    required: ['description'],
  },
  outputSchema: {
    type: 'object' as const,
    properties: {
      success: { type: 'boolean' as const },
      workflowId: { type: 'string' as const },
      workflowName: { type: 'string' as const },
      nodesCreated: { type: 'number' as const },
      activationStatus: { type: 'string' as const, enum: ['active', 'inactive'] },
      mappedNodes: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            nodeType: { type: 'string' as const },
            nodeName: { type: 'string' as const },
            category: { type: 'string' as const },
            confidence: { type: 'number' as const },
          },
          required: ['nodeType', 'nodeName', 'category', 'confidence'],
        },
      },
      warnings: {
        type: 'array' as const,
        items: { type: 'string' as const },
      },
    },
    required: ['success', 'workflowName', 'nodesCreated', 'activationStatus', 'mappedNodes', 'warnings'],
  },
};

/**
 * MCP tool definition for n8n_suggest_nodes.
 */
export const n8n_suggest_nodes = {
  name: 'n8n_suggest_nodes' as const,
  description:
    'Suggest complementary n8n nodes based on existing workflow nodes or task description. ' +
    'Analyzes existing nodes and recommends missing ones for complete workflows. ' +
    'Can also suggest nodes from task description or provide workflow templates by category. ' +
    'Use this when building workflows and need to know what nodes to add next, ' +
    'or when you want template workflows for common patterns.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      existingNodes: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description:
          'Array of node types already in the workflow ' +
          '(e.g., ["n8n-nodes-base.webhook", "n8n-nodes-base.httpRequest"])',
      },
      taskDescription: {
        type: 'string' as const,
        description:
          'Description of what the workflow should do ' +
          '(e.g., "When webhook receives data, send email notification")',
      },
      category: {
        type: 'string' as const,
        enum: ['webhook', 'notification', 'data-sync', 'automation', 'api-integration', 'database'],
        description:
          'Get workflow template for specific category. ' +
          'Categories: webhook, notification, data-sync, automation, api-integration, database',
      },
      maxResults: {
        type: 'number' as const,
        description: 'Maximum number of node suggestions to return. Default: 5.',
      },
    },
  },
  outputSchema: {
    type: 'object' as const,
    properties: {
      success: { type: 'boolean' as const },
      suggestions: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            nodeType: { type: 'string' as const },
            nodeName: { type: 'string' as const },
            category: { type: 'string' as const },
            reason: { type: 'string' as const },
            confidence: { type: 'number' as const },
            useCase: { type: 'string' as const },
          },
          required: ['nodeType', 'nodeName', 'category', 'reason', 'confidence'],
        },
      },
      templates: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            name: { type: 'string' as const },
            category: { type: 'string' as const },
            description: { type: 'string' as const },
            nodes: {
              type: 'array' as const,
              items: {
                type: 'object' as const,
                properties: {
                  type: { type: 'string' as const },
                  name: { type: 'string' as const },
                  position: {
                    type: 'array' as const,
                    items: { type: 'number' as const },
                  },
                },
                required: ['type', 'name', 'position'],
              },
            },
          },
          required: ['name', 'category', 'description', 'nodes'],
        },
      },
    },
    required: ['success'],
  },
};
