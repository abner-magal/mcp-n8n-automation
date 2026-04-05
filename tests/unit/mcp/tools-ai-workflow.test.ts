/**
 * Tests for AI Workflow MCP Tool Definitions.
 *
 * Validates that tool definitions have correct structure,
 * required fields, and proper schema constraints.
 */

import { describe, it, expect } from 'vitest';
import { n8n_create_from_prompt, n8n_suggest_nodes } from '../../../src/mcp/tools-ai-workflow';

describe('tools-ai-workflow', () => {
  describe('n8n_create_from_prompt', () => {
    it('should have correct tool name', () => {
      expect(n8n_create_from_prompt.name).toBe('n8n_create_from_prompt');
    });

    it('should have a description', () => {
      expect(n8n_create_from_prompt.description).toBeTruthy();
      expect(n8n_create_from_prompt.description.length).toBeGreaterThan(50);
    });

    it('should have inputSchema with type object', () => {
      expect(n8n_create_from_prompt.inputSchema.type).toBe('object');
    });

    it('should require description field', () => {
      expect(n8n_create_from_prompt.inputSchema.required).toContain('description');
    });

    it('should have description property in inputSchema', () => {
      expect(n8n_create_from_prompt.inputSchema.properties.description).toBeDefined();
      expect(n8n_create_from_prompt.inputSchema.properties.description.type).toBe('string');
    });

    it('should have optional workflowName property', () => {
      expect(n8n_create_from_prompt.inputSchema.properties.workflowName).toBeDefined();
      expect(n8n_create_from_prompt.inputSchema.properties.workflowName.type).toBe('string');
    });

    it('should have optional activate property', () => {
      expect(n8n_create_from_prompt.inputSchema.properties.activate).toBeDefined();
      expect(n8n_create_from_prompt.inputSchema.properties.activate.type).toBe('boolean');
    });

    it('should have outputSchema with required fields', () => {
      const required = n8n_create_from_prompt.outputSchema.required;
      expect(required).toContain('success');
      expect(required).toContain('workflowName');
      expect(required).toContain('nodesCreated');
      expect(required).toContain('activationStatus');
      expect(required).toContain('mappedNodes');
      expect(required).toContain('warnings');
    });

    it('should have outputSchema mappedNodes as array', () => {
      expect(n8n_create_from_prompt.outputSchema.properties.mappedNodes.type).toBe('array');
    });

    it('should have outputSchema warnings as array', () => {
      expect(n8n_create_from_prompt.outputSchema.properties.warnings.type).toBe('array');
    });
  });

  describe('n8n_suggest_nodes', () => {
    it('should have correct tool name', () => {
      expect(n8n_suggest_nodes.name).toBe('n8n_suggest_nodes');
    });

    it('should have a description', () => {
      expect(n8n_suggest_nodes.description).toBeTruthy();
      expect(n8n_suggest_nodes.description.length).toBeGreaterThan(50);
    });

    it('should have inputSchema with type object', () => {
      expect(n8n_suggest_nodes.inputSchema.type).toBe('object');
    });

    it('should have no required fields', () => {
      expect(n8n_suggest_nodes.inputSchema.required).toBeUndefined();
    });

    it('should have optional existingNodes property', () => {
      expect(n8n_suggest_nodes.inputSchema.properties.existingNodes).toBeDefined();
      expect(n8n_suggest_nodes.inputSchema.properties.existingNodes.type).toBe('array');
    });

    it('should have optional taskDescription property', () => {
      expect(n8n_suggest_nodes.inputSchema.properties.taskDescription).toBeDefined();
      expect(n8n_suggest_nodes.inputSchema.properties.taskDescription.type).toBe('string');
    });

    it('should have category enum with correct values', () => {
      const category = n8n_suggest_nodes.inputSchema.properties.category;
      expect(category.enum).toEqual([
        'webhook',
        'notification',
        'data-sync',
        'automation',
        'api-integration',
        'database',
      ]);
    });

    it('should have optional maxResults property', () => {
      expect(n8n_suggest_nodes.inputSchema.properties.maxResults).toBeDefined();
      expect(n8n_suggest_nodes.inputSchema.properties.maxResults.type).toBe('number');
    });

    it('should have outputSchema with success as only required field', () => {
      expect(n8n_suggest_nodes.outputSchema.required).toEqual(['success']);
    });

    it('should have suggestions array in outputSchema', () => {
      expect(n8n_suggest_nodes.outputSchema.properties.suggestions.type).toBe('array');
    });

    it('should have templates array in outputSchema', () => {
      expect(n8n_suggest_nodes.outputSchema.properties.templates.type).toBe('array');
    });
  });
});
