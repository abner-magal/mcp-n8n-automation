/**
 * MCP Suggest Nodes Tool Tests
 * 
 * Tests for the n8n_suggest_nodes MCP tool handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSuggestNodes } from '../../../src/mcp/handlers-ai-workflow';
import type { McpToolResponse } from '../../../src/types/n8n-api';

describe('handleSuggestNodes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('with existingNodes parameter', () => {
    it('should return complementary node suggestions', async () => {
      const result = await handleSuggestNodes({
        existingNodes: ['n8n-nodes-base.webhook'],
      }) as McpToolResponse;

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.suggestions).toBeDefined();
      expect(Array.isArray(result.data.suggestions)).toBe(true);
      expect(result.data.suggestions.length).toBeGreaterThan(0);
    });

    it('should limit results to maxResults', async () => {
      const result = await handleSuggestNodes({
        existingNodes: ['n8n-nodes-base.webhook'],
        maxResults: 2,
      }) as McpToolResponse;

      expect(result.success).toBe(true);
      expect(result.data.suggestions.length).toBeLessThanOrEqual(2);
    });

    it('should suggest nodes for HTTP request workflow', async () => {
      const result = await handleSuggestNodes({
        existingNodes: ['n8n-nodes-base.httpRequest'],
      }) as McpToolResponse;

      expect(result.success).toBe(true);
      expect(result.data.suggestions.some(
        (s: any) => s.nodeType.includes('json') || s.nodeType.includes('set')
      )).toBe(true);
    });

    it('should suggest nodes for database workflow', async () => {
      const result = await handleSuggestNodes({
        existingNodes: ['n8n-nodes-base.postgres'],
      }) as McpToolResponse;

      expect(result.success).toBe(true);
      expect(result.data.suggestions.some(
        (s: any) => s.nodeType.includes('aggregate') || s.nodeType.includes('set')
      )).toBe(true);
    });

    it('should return error for empty existingNodes array', async () => {
      const result = await handleSuggestNodes({
        existingNodes: [],
      }) as McpToolResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('with taskDescription parameter', () => {
    it('should return node suggestions for webhook task', async () => {
      const result = await handleSuggestNodes({
        taskDescription: 'Create a webhook endpoint',
      }) as McpToolResponse;

      expect(result.success).toBe(true);
      expect(result.data.suggestions).toBeDefined();
      expect(result.data.suggestions.length).toBeGreaterThan(0);
    });

    it('should return node suggestions for email task', async () => {
      const result = await handleSuggestNodes({
        taskDescription: 'Send email notification',
      }) as McpToolResponse;

      expect(result.success).toBe(true);
      expect(result.data.suggestions.some(
        (s: any) => s.nodeType.includes('email')
      )).toBe(true);
    });

    it('should return node suggestions for Slack task', async () => {
      const result = await handleSuggestNodes({
        taskDescription: 'Post message to Slack',
      }) as McpToolResponse;

      expect(result.success).toBe(true);
      expect(result.data.suggestions.some(
        (s: any) => s.nodeType.includes('slack')
      )).toBe(true);
    });

    it('should return node suggestions for database task', async () => {
      const result = await handleSuggestNodes({
        taskDescription: 'Query PostgreSQL database',
      }) as McpToolResponse;

      expect(result.success).toBe(true);
      expect(result.data.suggestions.some(
        (s: any) => s.nodeType.includes('postgres')
      )).toBe(true);
    });

    it('should limit results to maxResults for task description', async () => {
      const result = await handleSuggestNodes({
        taskDescription: 'Webhook, HTTP request, and email',
        maxResults: 3,
      }) as McpToolResponse;

      expect(result.success).toBe(true);
      expect(result.data.suggestions.length).toBeLessThanOrEqual(3);
    });

    it('should return error for empty task description', async () => {
      const result = await handleSuggestNodes({
        taskDescription: '',
      }) as McpToolResponse;

      // Zod validation should fail for empty string (min length)
      expect(result.success).toBe(false);
    });
  });

  describe('with category parameter', () => {
    it('should return templates for webhook category', async () => {
      const result = await handleSuggestNodes({
        category: 'webhook',
      }) as McpToolResponse;

      expect(result.success).toBe(true);
      expect(result.data.templates).toBeDefined();
      expect(result.data.templates.length).toBeGreaterThan(0);
      expect(result.data.templates[0].category).toBe('webhook');
    });

    it('should return templates for notification category', async () => {
      const result = await handleSuggestNodes({
        category: 'notification',
      }) as McpToolResponse;

      expect(result.success).toBe(true);
      expect(result.data.templates.length).toBeGreaterThan(0);
      expect(result.data.templates[0].category).toBe('notification');
    });

    it('should return templates for data-sync category', async () => {
      const result = await handleSuggestNodes({
        category: 'data-sync',
      }) as McpToolResponse;

      expect(result.success).toBe(true);
      expect(result.data.templates.length).toBeGreaterThan(0);
      expect(result.data.templates[0].category).toBe('data-sync');
    });

    it('should return templates for automation category', async () => {
      const result = await handleSuggestNodes({
        category: 'automation',
      }) as McpToolResponse;

      expect(result.success).toBe(true);
      expect(result.data.templates.length).toBeGreaterThan(0);
      expect(result.data.templates[0].category).toBe('automation');
    });

    it('should return templates for api-integration category', async () => {
      const result = await handleSuggestNodes({
        category: 'api-integration',
      }) as McpToolResponse;

      expect(result.success).toBe(true);
      expect(result.data.templates.length).toBeGreaterThan(0);
      expect(result.data.templates[0].category).toBe('api-integration');
    });

    it('should return templates for database category', async () => {
      const result = await handleSuggestNodes({
        category: 'database',
      }) as McpToolResponse;

      expect(result.success).toBe(true);
      expect(result.data.templates.length).toBeGreaterThan(0);
      expect(result.data.templates[0].category).toBe('database');
    });

    it('should return error for invalid category', async () => {
      const result = await handleSuggestNodes({
        category: 'invalid-category',
      }) as McpToolResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should include nodes in templates', async () => {
      const result = await handleSuggestNodes({
        category: 'webhook',
      }) as McpToolResponse;

      expect(result.success).toBe(true);
      expect(result.data.templates[0].nodes.length).toBeGreaterThan(0);
      expect(result.data.templates[0].nodes[0].type).toBeDefined();
      expect(result.data.templates[0].nodes[0].name).toBeDefined();
      expect(result.data.templates[0].nodes[0].position).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should return error when no parameters provided', async () => {
      const result = await handleSuggestNodes({}) as McpToolResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for invalid input type', async () => {
      const result = await handleSuggestNodes('invalid' as any) as McpToolResponse;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
    });

    it('should return error for null input', async () => {
      const result = await handleSuggestNodes(null as any) as McpToolResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for undefined input', async () => {
      const result = await handleSuggestNodes(undefined as any) as McpToolResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for maxResults out of range', async () => {
      const result = await handleSuggestNodes({
        taskDescription: 'test',
        maxResults: 0,
      }) as McpToolResponse;

      expect(result.success).toBe(false);
    });

    it('should return error for maxResults too high', async () => {
      const result = await handleSuggestNodes({
        taskDescription: 'test',
        maxResults: 100,
      }) as McpToolResponse;

      expect(result.success).toBe(false);
    });
  });

  describe('response structure', () => {
    it('should return proper McpToolResponse structure for suggestions', async () => {
      const result = await handleSuggestNodes({
        existingNodes: ['n8n-nodes-base.webhook'],
      }) as McpToolResponse;

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('success');
      expect(result.data).toHaveProperty('suggestions');
    });

    it('should return proper McpToolResponse structure for templates', async () => {
      const result = await handleSuggestNodes({
        category: 'webhook',
      }) as McpToolResponse;

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('success');
      expect(result.data).toHaveProperty('templates');
    });

    it('should return proper error structure', async () => {
      const result = await handleSuggestNodes({}) as McpToolResponse;

      expect(result).toHaveProperty('success');
      expect(result.success).toBe(false);
      expect(result).toHaveProperty('error');
    });

    it('should include message in successful responses', async () => {
      const result = await handleSuggestNodes({
        taskDescription: 'Send email',
      }) as McpToolResponse;

      expect(result.message).toBeDefined();
      expect(typeof result.message).toBe('string');
    });
  });

  describe('suggestion quality', () => {
    it('should have confidence scores between 0 and 1', async () => {
      const result = await handleSuggestNodes({
        taskDescription: 'Webhook and HTTP request',
      }) as McpToolResponse;

      for (const suggestion of result.data.suggestions) {
        expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
        expect(suggestion.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should have non-empty reason field', async () => {
      const result = await handleSuggestNodes({
        existingNodes: ['n8n-nodes-base.webhook'],
      }) as McpToolResponse;

      for (const suggestion of result.data.suggestions) {
        expect(suggestion.reason).toBeDefined();
        expect(suggestion.reason.length).toBeGreaterThan(0);
      }
    });

    it('should have non-empty nodeName field', async () => {
      const result = await handleSuggestNodes({
        existingNodes: ['n8n-nodes-base.webhook'],
      }) as McpToolResponse;

      for (const suggestion of result.data.suggestions) {
        expect(suggestion.nodeName).toBeDefined();
        expect(suggestion.nodeName.length).toBeGreaterThan(0);
      }
    });

    it('should have non-empty category field', async () => {
      const result = await handleSuggestNodes({
        existingNodes: ['n8n-nodes-base.webhook'],
      }) as McpToolResponse;

      for (const suggestion of result.data.suggestions) {
        expect(suggestion.category).toBeDefined();
        expect(suggestion.category.length).toBeGreaterThan(0);
      }
    });
  });
});
