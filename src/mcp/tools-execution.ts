import { ToolDefinition } from '../types';

/**
 * Execution Management MCP Tools
 *
 * These tools enable AI agents to execute and manage n8n workflow executions.
 */
export const executionTools: ToolDefinition[] = [
  {
    name: 'n8n_execute_workflow',
    description: `Execute a workflow immediately (not via webhook). Provide workflowId and optional inputData to pass to the first node. Returns executionId and status. Use mode='run' for normal execution (default) or mode='error' to test error handling.`,
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description: 'Workflow ID to execute',
        },
        inputData: {
          type: 'object',
          description: 'Input data to pass to the first node (e.g., {key: "value"})',
        },
        mode: {
          type: 'string',
          enum: ['run', 'error'],
          description: 'Execution mode: "run" for normal execution (default), "error" to test error handling',
          default: 'run',
        },
      },
      required: ['workflowId'],
      additionalProperties: false,
    },
    annotations: {
      title: 'Execute Workflow',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'n8n_retry_execution',
    description: `Retry a failed execution. Provide executionId to retry. Returns the new execution ID and status. Only failed executions can be retried.`,
    inputSchema: {
      type: 'object',
      properties: {
        executionId: {
          type: 'string',
          description: 'Execution ID to retry (must be a failed execution)',
        },
      },
      required: ['executionId'],
      additionalProperties: false,
    },
    annotations: {
      title: 'Retry Execution',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
];
