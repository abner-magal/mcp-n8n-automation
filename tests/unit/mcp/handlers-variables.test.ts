import { describe, it, expect } from 'vitest';
import {
  n8nListVariablesTool,
  n8nCreateVariableTool,
  n8nUpdateVariableTool,
  variablesTools
} from '@/mcp/tools-variables';

describe('Variables Tools Schema Definitions', () => {
  describe('n8n_list_variables', () => {
    it('should have correct tool name', () => {
      expect(n8nListVariablesTool.name).toBe('n8n_list_variables');
    });

    it('should have a description', () => {
      expect(n8nListVariablesTool.description).toBeDefined();
      expect(n8nListVariablesTool.description.length).toBeGreaterThan(10);
    });

    it('should have valid inputSchema with no required fields', () => {
      expect(n8nListVariablesTool.inputSchema.type).toBe('object');
      expect(n8nListVariablesTool.inputSchema.properties).toBeDefined();
      expect(n8nListVariablesTool.inputSchema.required).toBeUndefined();
    });
  });

  describe('n8n_create_variable', () => {
    it('should have correct tool name', () => {
      expect(n8nCreateVariableTool.name).toBe('n8n_create_variable');
    });

    it('should have a description', () => {
      expect(n8nCreateVariableTool.description).toBeDefined();
    });

    it('should have required key and value parameters', () => {
      expect(n8nCreateVariableTool.inputSchema.properties).toHaveProperty('key');
      expect(n8nCreateVariableTool.inputSchema.properties).toHaveProperty('value');
      expect(n8nCreateVariableTool.inputSchema.properties.key.type).toBe('string');
      expect(n8nCreateVariableTool.inputSchema.properties.value.type).toBe('string');
      expect(n8nCreateVariableTool.inputSchema.required).toContain('key');
      expect(n8nCreateVariableTool.inputSchema.required).toContain('value');
    });
  });

  describe('n8n_update_variable', () => {
    it('should have correct tool name', () => {
      expect(n8nUpdateVariableTool.name).toBe('n8n_update_variable');
    });

    it('should have a description', () => {
      expect(n8nUpdateVariableTool.description).toBeDefined();
    });

    it('should have required id and value parameters', () => {
      expect(n8nUpdateVariableTool.inputSchema.properties).toHaveProperty('id');
      expect(n8nUpdateVariableTool.inputSchema.properties).toHaveProperty('value');
      expect(n8nUpdateVariableTool.inputSchema.properties.id.type).toBe('string');
      expect(n8nUpdateVariableTool.inputSchema.properties.value.type).toBe('string');
      expect(n8nUpdateVariableTool.inputSchema.required).toContain('id');
      expect(n8nUpdateVariableTool.inputSchema.required).toContain('value');
    });
  });

  describe('variablesTools export', () => {
    it('should export all 3 tools', () => {
      expect(variablesTools).toHaveLength(3);
      const names = variablesTools.map(t => t.name);
      expect(names).toContain('n8n_list_variables');
      expect(names).toContain('n8n_create_variable');
      expect(names).toContain('n8n_update_variable');
    });
  });
});
