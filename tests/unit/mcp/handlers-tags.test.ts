import { describe, it, expect } from 'vitest';
import { n8nListTagsTool, n8nCreateTagTool, tagsTools } from '@/mcp/tools-tags';

describe('Tags Tools Schema Definitions', () => {
  describe('n8n_list_tags', () => {
    it('should have correct tool name', () => {
      expect(n8nListTagsTool.name).toBe('n8n_list_tags');
    });

    it('should have a description', () => {
      expect(n8nListTagsTool.description).toBeDefined();
      expect(n8nListTagsTool.description.length).toBeGreaterThan(10);
    });

    it('should have valid inputSchema with limit parameter', () => {
      expect(n8nListTagsTool.inputSchema.type).toBe('object');
      expect(n8nListTagsTool.inputSchema.properties).toHaveProperty('limit');
      expect(n8nListTagsTool.inputSchema.properties.limit.type).toBe('number');
    });

    it('should not have required fields (all optional)', () => {
      expect(n8nListTagsTool.inputSchema.required).toBeUndefined();
    });
  });

  describe('n8n_create_tag', () => {
    it('should have correct tool name', () => {
      expect(n8nCreateTagTool.name).toBe('n8n_create_tag');
    });

    it('should have a description', () => {
      expect(n8nCreateTagTool.description).toBeDefined();
    });

    it('should have valid inputSchema with required name parameter', () => {
      expect(n8nCreateTagTool.inputSchema.type).toBe('object');
      expect(n8nCreateTagTool.inputSchema.properties).toHaveProperty('name');
      expect(n8nCreateTagTool.inputSchema.properties.name.type).toBe('string');
      expect(n8nCreateTagTool.inputSchema.required).toContain('name');
    });
  });

  describe('tagsTools export', () => {
    it('should export both tools', () => {
      expect(tagsTools).toHaveLength(2);
      expect(tagsTools.map(t => t.name)).toContain('n8n_list_tags');
      expect(tagsTools.map(t => t.name)).toContain('n8n_create_tag');
    });
  });
});
