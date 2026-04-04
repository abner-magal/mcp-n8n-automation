import { ToolDocumentation } from '../types';

export const n8nCreateVariableDoc: ToolDocumentation = {
  name: 'n8n_create_variable',
  category: 'Variables Management',
  essentials: {
    description: 'Create a new environment variable in the n8n instance.',
    keyParameters: ['key', 'value'],
    example: 'n8n_create_variable({key: "API_KEY", value: "secret123"})',
    performance: 'Fast — single POST request to n8n /variables endpoint',
    tips: ['Use uppercase with underscores for key names', 'Avoid storing secrets directly in variables when possible']
  },
  full: {
    description: 'Creates a new environment variable in the n8n instance. Variables can be used in workflows via {{ $env.KEY_NAME }}.',
    parameters: {
      key: {
        type: 'string',
        description: 'The name/key of the variable. Convention: UPPERCASE_WITH_UNDERSCORES.',
        required: true,
        examples: ['API_KEY', 'DATABASE_URL', 'WEBHOOK_SECRET']
      },
      value: {
        type: 'string',
        description: 'The value of the variable.',
        required: true,
        examples: ['sk-xxx...', 'postgres://...', 'whsec_...']
      }
    },
    returns: 'The created variable object containing id, key, and value.',
    examples: [
      'n8n_create_variable({key: "API_KEY", value: "sk-12345"}) - Create an API key variable',
      'n8n_create_variable({key: "DATABASE_URL", value: "postgres://localhost:5432/db"}) - Create a database URL'
    ],
    useCases: [
      'Store API keys for use in HTTP Request nodes.',
      'Configure database connection strings.',
      'Set webhook secrets for verification.'
    ],
    performance: 'Fast — single POST request to n8n /variables endpoint',
    bestPractices: ['Follow naming conventions (UPPERCASE)', 'Document what each variable is for', 'Rotate secrets regularly'],
    pitfalls: ['Duplicate keys may cause errors', 'Values are stored as-is, consider encryption needs'],
    relatedTools: ['n8n_list_variables', 'n8n_update_variable', 'n8n_create_workflow']
  }
};
