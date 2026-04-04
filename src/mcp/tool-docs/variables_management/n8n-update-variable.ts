import { ToolDocumentation } from '../types';

export const n8nUpdateVariableDoc: ToolDocumentation = {
  name: 'n8n_update_variable',
  category: 'Variables Management',
  essentials: {
    description: 'Update an existing environment variable in the n8n instance.',
    keyParameters: ['id', 'value'],
    example: 'n8n_update_variable({id: "var-123", value: "new-secret"})',
    performance: 'Fast — single PATCH request to n8n /variables/{id} endpoint',
    tips: ['You need the variable ID from n8n_list_variables', 'Only the value can be updated, not the key']
  },
  full: {
    description: 'Updates the value of an existing environment variable in the n8n instance. The variable key (name) cannot be changed.',
    parameters: {
      id: {
        type: 'string',
        description: 'The ID of the variable to update. Get this from n8n_list_variables.',
        required: true,
        examples: ['var-abc123', '1']
      },
      value: {
        type: 'string',
        description: 'The new value for the variable.',
        required: true,
        examples: ['new-secret', 'updated-url']
      }
    },
    returns: 'The updated variable object containing id, key, and the new value.',
    examples: [
      'n8n_update_variable({id: "1", value: "new-api-key"}) - Update variable by ID',
      'n8n_update_variable({id: "var-abc", value: "postgres://new-host/db"}) - Update database URL'
    ],
    useCases: [
      'Rotate API keys without recreating the variable.',
      'Update database connection strings during migration.',
      'Refresh webhook secrets.'
    ],
    performance: 'Fast — single PATCH request to n8n /variables/{id} endpoint',
    bestPractices: ['List variables first to get the correct ID', 'Verify the update was successful'],
    pitfalls: ['Using wrong ID will fail', 'Cannot change the key, only the value'],
    relatedTools: ['n8n_list_variables', 'n8n_create_variable', 'n8n_update_full_workflow']
  }
};
