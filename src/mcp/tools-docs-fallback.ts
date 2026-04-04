import { ToolDefinition } from '../types';

/**
 * External Documentation Fallback Tools
 *
 * These tools query external documentation sources (Kapa.ai MCP, llms.txt)
 * when internal documentation is insufficient.
 * Implements the layered fallback strategy: Kapa.ai → llms.txt → docs.n8n.io
 */
export const docsFallbackTools: ToolDefinition[] = [
  {
    name: 'n8n_search_external_docs',
    description: `Search external n8n documentation using layered fallback strategy.
Layer 1: Kapa.ai MCP (semantic search on official docs)
Layer 2: llms.txt (LLM-optimized documentation)
Layer 3: Returns link to docs.n8n.io if both fail.
Use this when internal docs don't cover a specific node, feature, or configuration.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "HTTP Request node OAuth2", "webhook trigger configuration")'
        },
        source: {
          type: 'string',
          enum: ['auto', 'kapa', 'llms-txt'],
          default: 'auto',
          description: 'Documentation source: auto=try Kapa.ai first then fallback, kapa=only Kapa.ai, llms-txt=only llms.txt'
        }
      },
      required: ['query']
    },
    annotations: {
      title: 'Search External Documentation',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'n8n_suggest_nodes',
    description: `Suggest n8n nodes based on a task description.
Analyzes the task and recommends the best nodes to accomplish it.
Returns node names, types, descriptions, and configuration tips.
Use this when you know what you want to achieve but don't know which nodes to use.`,
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'Task description (e.g., "send email when new row in Google Sheets", "post to Slack on webhook")'
        },
        maxResults: {
          type: 'number',
          default: 5,
          description: 'Maximum number of node suggestions to return'
        },
        includeTriggers: {
          type: 'boolean',
          default: true,
          description: 'Include trigger nodes (webhooks, schedules, etc.) in suggestions'
        }
      },
      required: ['task']
    },
    annotations: {
      title: 'Suggest Nodes for Task',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];
