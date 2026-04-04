import { describe, it, expect } from 'vitest';
import {
  n8nSearchWorkflowsTool,
  n8nDuplicateWorkflowTool,
  n8nExportWorkflowTool,
  n8nGetWorkflowConnectionsTool,
  n8nBatchCreateWorkflowsTool,
  advancedWorkflowTools,
} from '@/mcp/tools-advanced';

describe('Advanced Workflow Tools Schema Definitions', () => {
  describe('n8n_search_workflows', () => {
    it('should have correct tool name', () => {
      expect(n8nSearchWorkflowsTool.name).toBe('n8n_search_workflows');
    });
    it('should require query parameter', () => {
      expect(n8nSearchWorkflowsTool.inputSchema.required).toContain('query');
      expect(n8nSearchWorkflowsTool.inputSchema.properties.query.type).toBe('string');
    });
    it('should have optional active parameter', () => {
      expect(n8nSearchWorkflowsTool.inputSchema.properties.active.type).toBe('boolean');
    });
  });

  describe('n8n_duplicate_workflow', () => {
    it('should have correct tool name', () => {
      expect(n8nDuplicateWorkflowTool.name).toBe('n8n_duplicate_workflow');
    });
    it('should require id parameter', () => {
      expect(n8nDuplicateWorkflowTool.inputSchema.required).toContain('id');
      expect(n8nDuplicateWorkflowTool.inputSchema.properties.id.type).toBe('string');
    });
    it('should have optional newName parameter', () => {
      expect(n8nDuplicateWorkflowTool.inputSchema.properties.newName.type).toBe('string');
    });
  });

  describe('n8n_export_workflow', () => {
    it('should have correct tool name', () => {
      expect(n8nExportWorkflowTool.name).toBe('n8n_export_workflow');
    });
    it('should require id parameter', () => {
      expect(n8nExportWorkflowTool.inputSchema.required).toContain('id');
    });
  });

  describe('n8n_get_workflow_connections', () => {
    it('should have correct tool name', () => {
      expect(n8nGetWorkflowConnectionsTool.name).toBe('n8n_get_workflow_connections');
    });
    it('should require id parameter', () => {
      expect(n8nGetWorkflowConnectionsTool.inputSchema.required).toContain('id');
    });
  });

  describe('n8n_batch_create_workflows', () => {
    it('should have correct tool name', () => {
      expect(n8nBatchCreateWorkflowsTool.name).toBe('n8n_batch_create_workflows');
    });
    it('should require workflows parameter', () => {
      expect(n8nBatchCreateWorkflowsTool.inputSchema.required).toContain('workflows');
      expect(n8nBatchCreateWorkflowsTool.inputSchema.properties.workflows.type).toBe('array');
    });
  });

  describe('advancedWorkflowTools export', () => {
    it('should export all 5 tools', () => {
      expect(advancedWorkflowTools).toHaveLength(5);
      const names = advancedWorkflowTools.map(t => t.name);
      expect(names).toContain('n8n_search_workflows');
      expect(names).toContain('n8n_duplicate_workflow');
      expect(names).toContain('n8n_export_workflow');
      expect(names).toContain('n8n_get_workflow_connections');
      expect(names).toContain('n8n_batch_create_workflows');
    });
  });
});
