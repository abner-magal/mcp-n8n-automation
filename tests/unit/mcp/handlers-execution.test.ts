import { describe, it, expect } from 'vitest';
import { executionTools } from '@/mcp/tools-execution';

describe('Execution Tools Schema Definitions', () => {
  const getToolByName = (name: string) =>
    executionTools.find((t) => t.name === name);

  describe('n8n_execute_workflow', () => {
    const tool = getToolByName('n8n_execute_workflow')!;

    it('should have correct tool name', () => {
      expect(tool.name).toBe('n8n_execute_workflow');
    });

    it('should have a description', () => {
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(10);
    });

    it('should have valid inputSchema with required workflowId', () => {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toHaveProperty('workflowId');
      expect(tool.inputSchema.properties!.workflowId.type).toBe('string');
      expect(tool.inputSchema.required).toContain('workflowId');
    });

    it('should have optional inputData and mode parameters', () => {
      expect(tool.inputSchema.properties).toHaveProperty('inputData');
      expect(tool.inputSchema.properties).toHaveProperty('mode');
      expect(tool.inputSchema.properties!.inputData.type).toBe('object');
      expect(tool.inputSchema.properties!.mode.type).toBe('string');
    });

    it('should have mode enum with run and error values', () => {
      expect(tool.inputSchema.properties!.mode).toHaveProperty('enum');
      expect(tool.inputSchema.properties!.mode.enum).toEqual(['run', 'error']);
    });

    it('should have additionalProperties false', () => {
      expect(tool.inputSchema.additionalProperties).toBe(false);
    });

    it('should have openWorldHint annotation', () => {
      expect(tool.annotations!.openWorldHint).toBe(true);
    });
  });

  describe('n8n_retry_execution', () => {
    const tool = getToolByName('n8n_retry_execution')!;

    it('should have correct tool name', () => {
      expect(tool.name).toBe('n8n_retry_execution');
    });

    it('should have a description', () => {
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(10);
    });

    it('should have valid inputSchema with required executionId', () => {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toHaveProperty('executionId');
      expect(tool.inputSchema.properties!.executionId.type).toBe('string');
      expect(tool.inputSchema.required).toContain('executionId');
    });

    it('should have additionalProperties false', () => {
      expect(tool.inputSchema.additionalProperties).toBe(false);
    });

    it('should have openWorldHint annotation', () => {
      expect(tool.annotations!.openWorldHint).toBe(true);
    });
  });

  describe('executionTools export', () => {
    it('should export both execution tools', () => {
      expect(executionTools).toHaveLength(2);
      const names = executionTools.map((t) => t.name);
      expect(names).toContain('n8n_execute_workflow');
      expect(names).toContain('n8n_retry_execution');
    });

    it('should have unique tool names', () => {
      const names = executionTools.map((t) => t.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('should have inputSchema for every tool', () => {
      executionTools.forEach((tool) => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      });
    });
  });
});
