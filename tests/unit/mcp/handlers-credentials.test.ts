import { describe, it, expect } from 'vitest';
import { credentialTools } from '@/mcp/tools-credentials';

describe('Credential Tools Schema Definitions', () => {
  const getToolByName = (name: string) =>
    credentialTools.find((t) => t.name === name);

  describe('n8n_list_credentials', () => {
    const tool = getToolByName('n8n_list_credentials')!;

    it('should have correct tool name', () => {
      expect(tool.name).toBe('n8n_list_credentials');
    });

    it('should have a description', () => {
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(10);
    });

    it('should have valid inputSchema with optional type and limit', () => {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toHaveProperty('type');
      expect(tool.inputSchema.properties).toHaveProperty('limit');
      expect(tool.inputSchema.properties!.limit).toHaveProperty('minimum', 1);
      expect(tool.inputSchema.properties!.limit).toHaveProperty('maximum', 1000);
    });

    it('should have no required fields', () => {
      expect(tool.inputSchema.required).toEqual([]);
    });

    it('should have additionalProperties false', () => {
      expect(tool.inputSchema.additionalProperties).toBe(false);
    });

    it('should have readOnlyHint and idempotentHint annotations', () => {
      expect(tool.annotations).toBeDefined();
      expect(tool.annotations!.readOnlyHint).toBe(true);
      expect(tool.annotations!.idempotentHint).toBe(true);
    });
  });

  describe('n8n_get_credential', () => {
    const tool = getToolByName('n8n_get_credential')!;

    it('should have correct tool name', () => {
      expect(tool.name).toBe('n8n_get_credential');
    });

    it('should have a description', () => {
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(10);
    });

    it('should have valid inputSchema with required id parameter', () => {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toHaveProperty('id');
      expect(tool.inputSchema.properties!.id.type).toBe('string');
      expect(tool.inputSchema.required).toContain('id');
    });

    it('should have additionalProperties false', () => {
      expect(tool.inputSchema.additionalProperties).toBe(false);
    });

    it('should have readOnlyHint and idempotentHint annotations', () => {
      expect(tool.annotations!.readOnlyHint).toBe(true);
      expect(tool.annotations!.idempotentHint).toBe(true);
    });
  });

  describe('n8n_create_credential', () => {
    const tool = getToolByName('n8n_create_credential')!;

    it('should have correct tool name', () => {
      expect(tool.name).toBe('n8n_create_credential');
    });

    it('should have a description', () => {
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(10);
    });

    it('should have valid inputSchema with required name, type, and data', () => {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toHaveProperty('name');
      expect(tool.inputSchema.properties).toHaveProperty('type');
      expect(tool.inputSchema.properties).toHaveProperty('data');
      expect(tool.inputSchema.properties!.name.type).toBe('string');
      expect(tool.inputSchema.properties!.type.type).toBe('string');
      expect(tool.inputSchema.properties!.data.type).toBe('object');
    });

    it('should require name, type, and data fields', () => {
      expect(tool.inputSchema.required).toContain('name');
      expect(tool.inputSchema.required).toContain('type');
      expect(tool.inputSchema.required).toContain('data');
      expect(tool.inputSchema.required).toHaveLength(3);
    });

    it('should have additionalProperties false', () => {
      expect(tool.inputSchema.additionalProperties).toBe(false);
    });

    it('should have openWorldHint annotation', () => {
      expect(tool.annotations!.openWorldHint).toBe(true);
    });
  });

  describe('n8n_update_credential', () => {
    const tool = getToolByName('n8n_update_credential')!;

    it('should have correct tool name', () => {
      expect(tool.name).toBe('n8n_update_credential');
    });

    it('should have a description', () => {
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(10);
    });

    it('should have valid inputSchema with required id and optional name/data', () => {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toHaveProperty('id');
      expect(tool.inputSchema.properties).toHaveProperty('name');
      expect(tool.inputSchema.properties).toHaveProperty('data');
      expect(tool.inputSchema.properties!.id.type).toBe('string');
    });

    it('should require only id field', () => {
      expect(tool.inputSchema.required).toContain('id');
      expect(tool.inputSchema.required).toHaveLength(1);
    });

    it('should have additionalProperties false', () => {
      expect(tool.inputSchema.additionalProperties).toBe(false);
    });

    it('should have openWorldHint annotation', () => {
      expect(tool.annotations!.openWorldHint).toBe(true);
    });
  });

  describe('n8n_delete_credential', () => {
    const tool = getToolByName('n8n_delete_credential')!;

    it('should have correct tool name', () => {
      expect(tool.name).toBe('n8n_delete_credential');
    });

    it('should have a description', () => {
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(10);
    });

    it('should have valid inputSchema with required id parameter', () => {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toHaveProperty('id');
      expect(tool.inputSchema.properties!.id.type).toBe('string');
      expect(tool.inputSchema.required).toContain('id');
    });

    it('should have additionalProperties false', () => {
      expect(tool.inputSchema.additionalProperties).toBe(false);
    });

    it('should have destructiveHint annotation', () => {
      expect(tool.annotations!.destructiveHint).toBe(true);
    });
  });

  describe('credentialTools export', () => {
    it('should export all 5 credential tools', () => {
      expect(credentialTools).toHaveLength(5);
      const names = credentialTools.map((t) => t.name);
      expect(names).toContain('n8n_list_credentials');
      expect(names).toContain('n8n_get_credential');
      expect(names).toContain('n8n_create_credential');
      expect(names).toContain('n8n_update_credential');
      expect(names).toContain('n8n_delete_credential');
    });

    it('should have unique tool names', () => {
      const names = credentialTools.map((t) => t.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('should have inputSchema for every tool', () => {
      credentialTools.forEach((tool) => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      });
    });
  });
});
