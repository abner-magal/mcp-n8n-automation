import { ToolDefinition } from '../types';

export const n8nSearchWorkflowsTool: ToolDefinition = {
  name: 'n8n_search_workflows',
  description: 'Search workflows by name, description, or tags using fuzzy matching.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query (matched against workflow names and tags).',
        minLength: 1,
      },
      active: {
        type: 'boolean',
        description: 'Filter by active status.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of workflows to fetch before filtering (1-1000, default 100). Higher limits may impact performance.',
        minimum: 1,
        maximum: 1000,
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
};

export const n8nDuplicateWorkflowTool: ToolDefinition = {
  name: 'n8n_duplicate_workflow',
  description: 'Duplicate an existing workflow with all its nodes and connections.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The ID of the workflow to duplicate.',
        minLength: 1,
      },
      newName: {
        type: 'string',
        description: 'Optional new name for the duplicated workflow. Defaults to "{originalName} (Copy)".',
        minLength: 1,
        maxLength: 255,
      },
    },
    required: ['id'],
    additionalProperties: false,
  },
};

export const n8nExportWorkflowTool: ToolDefinition = {
  name: 'n8n_export_workflow',
  description: 'Export a workflow as JSON for backup or sharing. ⚠️ Warning: exports may contain embedded credentials in node configurations.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The ID of the workflow to export.',
        minLength: 1,
      },
    },
    required: ['id'],
    additionalProperties: false,
  },
};

export const n8nGetWorkflowConnectionsTool: ToolDefinition = {
  name: 'n8n_get_workflow_connections',
  description: 'Get the connection graph of a workflow showing how nodes are linked.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The ID of the workflow.',
        minLength: 1,
      },
    },
    required: ['id'],
    additionalProperties: false,
  },
};

export const n8nBatchCreateWorkflowsTool: ToolDefinition = {
  name: 'n8n_batch_create_workflows',
  description: 'Create multiple workflows in a single batch operation.',
  inputSchema: {
    type: 'object',
    properties: {
      workflows: {
        type: 'array',
        description: 'Array of workflow specs to create (1-50 workflows). Each must have a name.',
        minItems: 1,
        maxItems: 50,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1 },
            nodes: { type: 'array' },
            connections: { type: 'object' },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
    },
    required: ['workflows'],
    additionalProperties: false,
  },
};

export const advancedWorkflowTools: ToolDefinition[] = [
  n8nSearchWorkflowsTool,
  n8nDuplicateWorkflowTool,
  n8nExportWorkflowTool,
  n8nGetWorkflowConnectionsTool,
  n8nBatchCreateWorkflowsTool,
];
