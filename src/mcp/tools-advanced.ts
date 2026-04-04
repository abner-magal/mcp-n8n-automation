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
      },
      active: {
        type: 'boolean',
        description: 'Filter by active status.',
      },
    },
    required: ['query'],
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
      },
      newName: {
        type: 'string',
        description: 'Optional new name for the duplicated workflow. Defaults to "{originalName} (Copy)".',
      },
    },
    required: ['id'],
  },
};

export const n8nExportWorkflowTool: ToolDefinition = {
  name: 'n8n_export_workflow',
  description: 'Export a workflow as JSON for backup or sharing.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The ID of the workflow to export.',
      },
    },
    required: ['id'],
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
      },
    },
    required: ['id'],
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
        description: 'Array of workflow specs to create. Each must have a name.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            nodes: { type: 'array' },
            connections: { type: 'object' },
          },
          required: ['name'],
        },
      },
    },
    required: ['workflows'],
  },
};

export const advancedWorkflowTools: ToolDefinition[] = [
  n8nSearchWorkflowsTool,
  n8nDuplicateWorkflowTool,
  n8nExportWorkflowTool,
  n8nGetWorkflowConnectionsTool,
  n8nBatchCreateWorkflowsTool,
];
