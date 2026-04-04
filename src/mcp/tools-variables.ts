import { ToolDefinition } from '../types';

export const n8nListVariablesTool: ToolDefinition = {
  name: 'n8n_list_variables',
  description: 'List environment variables from the n8n instance.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export const n8nCreateVariableTool: ToolDefinition = {
  name: 'n8n_create_variable',
  description: 'Create a new environment variable in the n8n instance.',
  inputSchema: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: 'The name/key of the variable.',
      },
      value: {
        type: 'string',
        description: 'The value of the variable.',
      },
    },
    required: ['key', 'value'],
  },
};

export const n8nUpdateVariableTool: ToolDefinition = {
  name: 'n8n_update_variable',
  description: 'Update an existing environment variable in the n8n instance.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The ID of the variable to update.',
      },
      value: {
        type: 'string',
        description: 'The new value for the variable.',
      },
    },
    required: ['id', 'value'],
  },
};

export const variablesTools: ToolDefinition[] = [
  n8nListVariablesTool,
  n8nCreateVariableTool,
  n8nUpdateVariableTool,
];
