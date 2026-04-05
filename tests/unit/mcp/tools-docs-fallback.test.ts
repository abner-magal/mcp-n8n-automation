/**
 * Tests for Documentation Fallback MCP Tool Definitions.
 *
 * Validates structure, schemas, and annotations of all docs fallback tools.
 */

import { describe, it, expect } from 'vitest';
import { docsFallbackTools } from '../../../src/mcp/tools-docs-fallback';

describe('tools-docs-fallback', () => {
  describe('docsFallbackTools array', () => {
    it('should export 4 tools', () => {
      expect(docsFallbackTools).toHaveLength(4);
    });

    it('should have unique tool names', () => {
      const names = docsFallbackTools.map((t) => t.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe('n8n_search_external_docs', () => {
    const tool = docsFallbackTools.find((t) => t.name === 'n8n_search_external_docs')!;

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should have a description mentioning layered fallback', () => {
      expect(tool.description).toContain('fallback');
    });

    it('should require query field', () => {
      expect(tool.inputSchema.required).toContain('query');
    });

    it('should have source enum with correct values', () => {
      const sourceProp = tool.inputSchema.properties.source;
      expect(sourceProp.enum).toEqual(['auto', 'kapa_ai', 'llms_txt']);
    });

    it('should have readOnlyHint annotation', () => {
      expect(tool.annotations.readOnlyHint).toBe(true);
    });
  });

  describe('n8n_search_kapa_ai', () => {
    const tool = docsFallbackTools.find((t) => t.name === 'n8n_search_kapa_ai')!;

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require query field', () => {
      expect(tool.inputSchema.required).toContain('query');
    });

    it('should have optional includeSources field', () => {
      expect(tool.inputSchema.properties.includeSources).toBeDefined();
      expect(tool.inputSchema.properties.includeSources.type).toBe('boolean');
    });

    it('should mention Layer 1 in description', () => {
      expect(tool.description).toContain('Layer 1');
    });
  });

  describe('n8n_suggest_nodes (docs fallback version)', () => {
    const tool = docsFallbackTools.find((t) => t.name === 'n8n_suggest_nodes')!;

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require task field', () => {
      expect(tool.inputSchema.required).toContain('task');
    });

    it('should have optional maxResults with default 5', () => {
      expect(tool.inputSchema.properties.maxResults.default).toBe(5);
    });

    it('should have optional includeTriggers with default true', () => {
      expect(tool.inputSchema.properties.includeTriggers.default).toBe(true);
    });
  });

  describe('n8n_search_llms_txt', () => {
    const tool = docsFallbackTools.find((t) => t.name === 'n8n_search_llms_txt')!;

    it('should exist', () => {
      expect(tool).toBeDefined();
    });

    it('should require query field', () => {
      expect(tool.inputSchema.required).toContain('query');
    });

    it('should have optional maxResults field', () => {
      expect(tool.inputSchema.properties.maxResults).toBeDefined();
      expect(tool.inputSchema.properties.maxResults.type).toBe('number');
    });

    it('should mention Layer 2 in description', () => {
      expect(tool.description).toContain('Layer 2');
    });

    it('should have idempotentHint annotation', () => {
      expect(tool.annotations.idempotentHint).toBe(true);
    });
  });
});
