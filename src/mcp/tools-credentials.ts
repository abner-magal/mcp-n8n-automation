import { ToolDefinition } from '../types';

/**
 * Credential Management MCP Tools
 *
 * These tools enable AI agents to manage n8n credentials through the n8n API.
 * SECURITY: Credential data (secrets) is NEVER returned in list/get responses.
 */
export const credentialTools: ToolDefinition[] = [
  {
    name: 'n8n_list_credentials',
    description: `List credentials from the n8n instance. Returns metadata only (id, name, type) - NO sensitive data. Use type parameter to filter by credential type (e.g., "slackOAuth2", "googleSheetsOAuth2").`,
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Filter by credential type (e.g., "slackOAuth2", "googleSheetsOAuth2")',
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 1000,
          description: 'Maximum number of credentials to return (default: 100)',
        },
      },
      required: [],
      additionalProperties: false,
    },
    annotations: {
      title: 'List Credentials',
      readOnlyHint: true,
      idempotentHint: true,
    },
  },
  {
    name: 'n8n_get_credential',
    description: `Get credential metadata by ID. SECURITY WARNING: Returns credential structure but NEVER returns secret values. Use this to understand credential configuration, not to retrieve secrets.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Credential ID',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: {
      title: 'Get Credential',
      readOnlyHint: true,
      idempotentHint: true,
    },
  },
  {
    name: 'n8n_create_credential',
    description: `Create a new credential in n8n. The data object should contain the credential fields specific to the credential type (e.g., accessToken, refreshToken, clientId, clientSecret). Returns the created credential metadata - secrets are stored securely and never returned.`,
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Credential name (human-readable identifier)',
        },
        type: {
          type: 'string',
          description: 'Credential type (e.g., "slackOAuth2", "googleSheetsOAuth2", "httpHeaderAuth")',
        },
        data: {
          type: 'object',
          description: 'Credential data with type-specific fields (e.g., {accessToken: "...", refreshToken: "..."})',
        },
      },
      required: ['name', 'type', 'data'],
      additionalProperties: false,
    },
    annotations: {
      title: 'Create Credential',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'n8n_update_credential',
    description: `Update an existing credential. Provide id and the fields to update (name and/or data). Only specified fields are updated - unspecified fields remain unchanged. Returns updated credential metadata - secrets are never returned.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Credential ID to update',
        },
        name: {
          type: 'string',
          description: 'New credential name (optional)',
        },
        data: {
          type: 'object',
          description: 'Updated credential data (optional - only specified fields are updated)',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: {
      title: 'Update Credential',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'n8n_delete_credential',
    description: `Delete a credential by ID. This action is irreversible. Returns confirmation with the deleted credential ID.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Credential ID to delete',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: {
      title: 'Delete Credential',
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
];
