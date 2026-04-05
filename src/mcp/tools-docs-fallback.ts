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
          enum: ['auto', 'kapa_ai', 'llms_txt'],
          default: 'auto',
          description: 'Documentation source: "auto" uses layered fallback (Kapa.ai → llms.txt → docs link), "kapa_ai" queries Kapa.ai only, "llms_txt" queries llms.txt only'
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
    name: 'n8n_search_kapa_ai',
    description: `Search n8n documentation using Kapa.ai MCP server directly.
This is Layer 1 of the documentation fallback strategy.
Kapa.ai provides semantic search across official n8n documentation with AI-powered answers.
Use this for detailed questions about n8n nodes, features, configurations, or best practices.
Returns structured answers with source citations when available.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "How to configure HTTP Request node with OAuth2", "webhook trigger best practices")'
        },
        includeSources: {
          type: 'boolean',
          default: true,
          description: 'Include source URLs in the response when available'
        }
      },
      required: ['query']
    },
    annotations: {
      title: 'Search Kapa.ai Documentation',
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
  {
    name: 'n8n_search_llms_txt',
    description: `Search n8n documentation via llms.txt index (Layer 2 of documentation fallback).
Fetches the machine-readable llms.txt index from docs.n8n.io and performs keyword-based search.
Returns ranked results by relevance score with titles, descriptions, and URLs.
Use this when Kapa.ai (Layer 1) is unavailable or when you need direct links to documentation pages.
Faster than Kapa.ai but less semantic — good for finding specific node types or features.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "HTTP Request node OAuth2", "webhook trigger configuration", "Google Sheets integration")'
        },
        maxResults: {
          type: 'number',
          default: 5,
          description: 'Maximum number of results to return (1-20)'
        }
      },
      required: ['query']
    },
    annotations: {
      title: 'Search llms.txt Documentation',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
];
