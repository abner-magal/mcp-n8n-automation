import { ToolDocumentation } from '../types';

export const n8nListVariablesDoc: ToolDocumentation = {
  name: 'n8n_list_variables',
  category: 'Variables Management',
  essentials: {
    description: 'List environment variables from the n8n instance.',
    keyParameters: [],
    example: 'n8n_list_variables({})',
    performance: 'Fast — single API call to n8n /variables endpoint',
    tips: ['Variables are environment variables used in workflows', 'Requires Source Control API access']
  },
  full: {
    description: 'Lists all environment variables configured in the n8n instance. Variables can be referenced in workflows using {{ $env.VARIABLE_NAME }}.',
    parameters: {},
    returns: 'Array of variable objects with id, key, and value.',
    examples: [
      'n8n_list_variables({}) - List all environment variables'
    ],
    useCases: [
      'View all configured environment variables.',
      'Check if a variable exists before creating it.',
      'Audit environment configuration.'
    ],
    performance: 'Fast — single API call to n8n /variables endpoint',
    bestPractices: ['Review variables regularly for security', 'Use descriptive key names'],
    pitfalls: ['Variables may not be available in all n8n versions', 'Some variables may be managed externally'],
    relatedTools: ['n8n_create_variable', 'n8n_update_variable', 'n8n_list_tags']
  }
};
