import { ToolDocumentation } from '../types';

export const n8nCreateTagDoc: ToolDocumentation = {
  name: 'n8n_create_tag',
  category: 'Tags Management',
  essentials: {
    description: 'Create a new tag in the n8n instance.',
    keyParameters: ['name'],
    example: 'n8n_create_tag({name: "production"})',
    performance: 'Fast — single POST request to n8n /tags endpoint',
    tips: ['Tag names should be unique', 'Avoid special characters in tag names']
  },
  full: {
    description: 'Creates a new tag in the n8n instance. Tags can be used to categorize and filter workflows.',
    parameters: {
      name: {
        type: 'string',
        description: 'The name of the new tag. Must be unique.',
        required: true,
        examples: ['production', 'staging', 'webhook']
      }
    },
    returns: 'The created tag object containing id and name.',
    examples: [
      'n8n_create_tag({name: "production"}) - Create a production tag',
      'n8n_create_tag({name: "automation"}) - Create an automation tag'
    ],
    useCases: [
      'Create a tag for categorizing workflows before applying it.',
      'Add a new label to group specific integration workflows.'
    ],
    performance: 'Fast — single POST request to n8n /tags endpoint',
    bestPractices: ['Use consistent naming conventions', 'Check if tag exists before creating'],
    pitfalls: ['Creating duplicate tags may cause errors'],
    relatedTools: ['n8n_list_tags', 'n8n_create_workflow', 'n8n_update_full_workflow']
  }
};
