import { ToolDefinition } from '../types';

export const n8nListTagsTool: ToolDefinition = {
  name: 'n8n_list_tags',
  description: 'List tags from the n8n instance.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'The maximum number of tags to return (1-1000).',
        minimum: 1,
        maximum: 1000,
      },
      cursor: {
        type: 'string',
        description: 'Pagination cursor for retrieving the next page of results.',
      },
    },
    additionalProperties: false,
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
        description: 'The name of the new tag (1-255 characters).',
        minLength: 1,
        maxLength: 255,
      },
    },
    required: ['name'],
    additionalProperties: false,
  },
};

export const tagsTools: ToolDefinition[] = [n8nListTagsTool, n8nCreateTagTool];
