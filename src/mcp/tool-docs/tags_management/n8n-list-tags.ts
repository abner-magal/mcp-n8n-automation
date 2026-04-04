import { ToolDocumentation } from '../types';

export const n8nListTagsDoc: ToolDocumentation = {
  name: 'n8n_list_tags',
  category: 'Tags Management',
  essentials: {
    description: 'List tags from the n8n instance with optional pagination.',
    keyParameters: ['limit', 'cursor'],
    example: 'n8n_list_tags({limit: 50})',
    performance: 'Fast — single API call to n8n /tags endpoint',
    tips: ['Use limit to control page size', 'Use cursor for pagination']
  },
  full: {
    description: 'Lists tags from the n8n instance. Returns paginated results with tag objects containing id and name.',
    parameters: {
      limit: {
        type: 'number',
        description: 'Maximum number of tags to return',
        required: false,
        default: 100,
        examples: ['10', '50', '100']
      }
    },
    returns: 'Paginated list of tag objects with id, name, and optional cursor for next page.',
    examples: [
      'n8n_list_tags({limit: 20}) - First 20 tags',
      'n8n_list_tags({cursor: "abc123"}) - Next page of results'
    ],
    useCases: [
      'View available tags to assign to a workflow.',
      'List existing tags for categorization.'
    ],
    performance: 'Fast — single API call to n8n /tags endpoint',
    bestPractices: ['Use pagination for large tag lists', 'Cache results when possible'],
    pitfalls: ['Without limit, may return very large result sets'],
    relatedTools: ['n8n_create_tag', 'n8n_create_workflow', 'n8n_health_check']
  }
};
