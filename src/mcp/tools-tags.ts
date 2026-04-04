import { ToolDefinition } from '../types';

export const n8nListTagsTool: ToolDefinition = {
  name: 'n8n_list_tags',
  description: 'List tags from the n8n instance.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'The maximum number of tags to return.',
      },
    },
  },
};

export const n8nCreateTagTool: ToolDefinition = {
  name: 'n8n_create_tag',
  description: 'Create a new tag in the n8n instance.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The name of the new tag.',
      },
    },
    required: ['name'],
  },
};

export const tagsTools: ToolDefinition[] = [n8nListTagsTool, n8nCreateTagTool];
