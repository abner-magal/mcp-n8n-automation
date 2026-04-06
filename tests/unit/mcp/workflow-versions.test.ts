/**
 * Tests for n8n_workflow_versions MCP tool handler.
 *
 * Covers all six modes: list, get, rollback, delete, prune, truncate.
 * Tests schema validation, happy paths, error handling, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleWorkflowVersions } from '../../../src/mcp/handlers-n8n-manager';
import { WorkflowVersioningService } from '../../../src/services/workflow-versioning-service';
import type { NodeRepository } from '../../../src/database/node-repository';
import type { N8nApiClient } from '../../../src/services/n8n-api-client';
import type { InstanceContext } from '../../../src/types/instance-context';
import type { McpToolResponse } from '../../../src/types/n8n-api';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const mockGetWorkflowVersions = vi.fn();
const mockGetWorkflowVersion = vi.fn();
const mockGetLatestWorkflowVersion = vi.fn();
const mockCreateWorkflowVersion = vi.fn();
const mockDeleteWorkflowVersion = vi.fn();
const mockDeleteWorkflowVersionsByWorkflowId = vi.fn();
const mockPruneWorkflowVersions = vi.fn();
const mockTruncateWorkflowVersions = vi.fn();
const mockGetWorkflowVersionCount = vi.fn();
const mockGetVersionStorageStats = vi.fn();

const mockGetWorkflow = vi.fn();
const mockUpdateWorkflow = vi.fn();

function buildMockRepository(): unknown {
  return {
    getWorkflowVersions: mockGetWorkflowVersions,
    getWorkflowVersion: mockGetWorkflowVersion,
    getLatestWorkflowVersion: mockGetLatestWorkflowVersion,
    createWorkflowVersion: mockCreateWorkflowVersion,
    deleteWorkflowVersion: mockDeleteWorkflowVersion,
    deleteWorkflowVersionsByWorkflowId: mockDeleteWorkflowVersionsByWorkflowId,
    pruneWorkflowVersions: mockPruneWorkflowVersions,
    truncateWorkflowVersions: mockTruncateWorkflowVersions,
    getWorkflowVersionCount: mockGetWorkflowVersionCount,
    getVersionStorageStats: mockGetVersionStorageStats,
  };
}

function buildMockApiClient(): unknown {
  return {
    getWorkflow: mockGetWorkflow,
    updateWorkflow: mockUpdateWorkflow,
  };
}

// Sample version data used across tests
const sampleWorkflowId = 'wf-abc123';

const sampleVersions = [
  {
    id: 3,
    workflowId: sampleWorkflowId,
    versionNumber: 3,
    workflowName: 'Test Workflow',
    workflowSnapshot: {
      name: 'Test Workflow',
      nodes: [{ id: 'node1', type: 'n8n-nodes-base.webhook', name: 'Webhook' }],
      connections: {},
      settings: {},
    },
    trigger: 'partial_update' as const,
    operations: [{ op: 'update', path: '/nodes/0/parameters/url', value: 'https://example.com' }],
    fixTypes: ['expression_format'],
    metadata: { reason: 'Before node update' },
    createdAt: '2026-04-03T14:00:00.000Z',
  },
  {
    id: 2,
    workflowId: sampleWorkflowId,
    versionNumber: 2,
    workflowName: 'Test Workflow',
    workflowSnapshot: {
      name: 'Test Workflow',
      nodes: [{ id: 'node1', type: 'n8n-nodes-base.webhook', name: 'Webhook' }],
      connections: {},
      settings: {},
    },
    trigger: 'full_update' as const,
    operations: undefined,
    fixTypes: undefined,
    metadata: undefined,
    createdAt: '2026-04-02T10:00:00.000Z',
  },
  {
    id: 1,
    workflowId: sampleWorkflowId,
    versionNumber: 1,
    workflowName: 'Test Workflow',
    workflowSnapshot: {
      name: 'Test Workflow',
      nodes: [],
      connections: {},
      settings: {},
    },
    trigger: 'partial_update' as const,
    operations: undefined,
    fixTypes: undefined,
    metadata: undefined,
    createdAt: '2026-04-01T08:00:00.000Z',
  },
];

const sampleVersion = sampleVersions[0];

function buildContext(): InstanceContext {
  return {
    n8nApiUrl: 'http://localhost:5678',
    n8nApiKey: 'test-api-key',
    instanceId: 'default',
    sessionTimeout: 1800000,
  } as InstanceContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('n8n_workflow_versions', () => {
  let mockRepository: NodeRepository;
  let mockApiClient: N8nApiClient;
  let context: InstanceContext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepository = buildMockRepository() as unknown as NodeRepository;
    mockApiClient = buildMockApiClient() as unknown as N8nApiClient;
    context = buildContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ========================================================================
  // 1. Tool Schema Validation
  // ========================================================================

  describe('Tool Schema', () => {
    it('should accept valid input with mode only', async () => {
      mockGetWorkflowVersions.mockReturnValue([]);

      const result = await handleWorkflowVersions(
        { mode: 'list', workflowId: sampleWorkflowId },
        mockRepository,
        context
      );

      expect(result.success).toBe(true);
    });

    it('should accept valid input with all optional fields', async () => {
      mockGetWorkflowVersion.mockReturnValue(sampleVersion);

      const result = await handleWorkflowVersions(
        {
          mode: 'get',
          versionId: 3,
          limit: 5,
          validateBefore: true,
          deleteAll: false,
          maxVersions: 10,
          confirmTruncate: false,
        },
        mockRepository,
        context
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should reject invalid mode value', async () => {
      const result = await handleWorkflowVersions(
        { mode: 'invalid_mode', workflowId: sampleWorkflowId },
        mockRepository,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
    });

    it('should reject when mode is missing', async () => {
      const result = await handleWorkflowVersions(
        {},
        mockRepository,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
    });

    it('should reject invalid type for versionId', async () => {
      const result = await handleWorkflowVersions(
        { mode: 'get', versionId: 'not-a-number' as unknown as number },
        mockRepository,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
    });
  });

  // ========================================================================
  // 2. List Mode — Happy Path
  // ========================================================================

  describe('List Mode', () => {
    it('should return versions array for valid workflowId', async () => {
      mockGetWorkflowVersions.mockReturnValue(sampleVersions);

      const result = await handleWorkflowVersions(
        { mode: 'list', workflowId: sampleWorkflowId },
        mockRepository,
        context
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect(data).toBeDefined();
      expect(data?.workflowId).toBe(sampleWorkflowId);
      expect(Array.isArray(data?.versions)).toBe(true);
      expect((data?.versions as Array<Record<string, unknown>>).length).toBe(3);
      expect(data?.count).toBe(3);
      expect(data?.message).toContain('3 version(s)');
    });

    it('should respect the limit parameter', async () => {
      mockGetWorkflowVersions.mockReturnValue(sampleVersions.slice(0, 2));

      const result = await handleWorkflowVersions(
        { mode: 'list', workflowId: sampleWorkflowId, limit: 2 },
        mockRepository,
        context
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect((data?.versions as Array<Record<string, unknown>>).length).toBe(2);
      expect(mockGetWorkflowVersions).toHaveBeenCalledWith(sampleWorkflowId, 2);
    });

    it('should return empty versions array for new workflow', async () => {
      mockGetWorkflowVersions.mockReturnValue([]);

      const result = await handleWorkflowVersions(
        { mode: 'list', workflowId: 'wf-new' },
        mockRepository,
        context
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect(data?.count).toBe(0);
      expect((data?.versions as Array<Record<string, unknown>>).length).toBe(0);
    });

    it('should include version metadata (timestamp, trigger, operations)', async () => {
      mockGetWorkflowVersions.mockReturnValue(sampleVersions);

      const result = await handleWorkflowVersions(
        { mode: 'list', workflowId: sampleWorkflowId },
        mockRepository,
        context
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      const versions = data?.versions as Array<Record<string, unknown>> | undefined;
      expect(versions).toBeDefined();

      const latestVersion = versions![0];
      expect(latestVersion.trigger).toBe('partial_update');
      expect(latestVersion.createdAt).toBeDefined();
      expect(latestVersion.operationCount).toBe(1);
      expect(latestVersion.fixTypesApplied).toEqual(['expression_format']);
    });
  });

  // ========================================================================
  // 3. Get Mode — Happy Path
  // ========================================================================

  describe('Get Mode', () => {
    it('should return specific version details for valid versionId', async () => {
      mockGetWorkflowVersion.mockReturnValue(sampleVersion);

      const result = await handleWorkflowVersions(
        { mode: 'get', versionId: 3 },
        mockRepository,
        context
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect(data).toBeDefined();
      expect(data?.id).toBe(3);
      expect(data?.versionNumber).toBe(3);
      expect(data?.workflowName).toBe('Test Workflow');
    });

    it('should return full workflow snapshot in version details', async () => {
      mockGetWorkflowVersion.mockReturnValue(sampleVersion);

      const result = await handleWorkflowVersions(
        { mode: 'get', versionId: 3 },
        mockRepository,
        context
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect(data?.workflowSnapshot).toBeDefined();
      const snapshot = data?.workflowSnapshot as Record<string, unknown>;
      expect(snapshot.nodes).toBeDefined();
      expect(Array.isArray(snapshot.nodes as unknown[])).toBe(true);
    });
  });

  // ========================================================================
  // 4. Error Handling
  // ========================================================================

  describe('Error Handling', () => {
    it('should return error when workflowId is missing for list mode', async () => {
      const result = await handleWorkflowVersions(
        { mode: 'list' },
        mockRepository,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('workflowId is required');
    });

    it('should return error when versionId is missing for get mode', async () => {
      const result = await handleWorkflowVersions(
        { mode: 'get' },
        mockRepository,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('versionId is required');
    });

    it('should return error when version not found', async () => {
      mockGetWorkflowVersion.mockReturnValue(null);

      const result = await handleWorkflowVersions(
        { mode: 'get', versionId: 999 },
        mockRepository,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error when workflowId is missing for rollback mode', async () => {
      const result = await handleWorkflowVersions(
        { mode: 'rollback' },
        mockRepository,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('workflowId is required');
    });

    it('should return error when n8n API not configured for rollback', async () => {
      const result = await handleWorkflowVersions(
        { mode: 'rollback', workflowId: sampleWorkflowId },
        mockRepository,
        undefined
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
    });

    it('should return error when workflowId is missing for delete all mode', async () => {
      const result = await handleWorkflowVersions(
        { mode: 'delete', deleteAll: true },
        mockRepository,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('workflowId is required');
    });

    it('should return error when versionId is missing for single version delete', async () => {
      const result = await handleWorkflowVersions(
        { mode: 'delete', deleteAll: false },
        mockRepository,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('versionId is required');
    });

    it('should return error when workflowId is missing for prune mode', async () => {
      const result = await handleWorkflowVersions(
        { mode: 'prune' },
        mockRepository,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('workflowId is required');
    });

    it('should return error when confirmTruncate is false for truncate mode', async () => {
      const result = await handleWorkflowVersions(
        { mode: 'truncate', confirmTruncate: false },
        mockRepository,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('confirmTruncate must be true');
    });

    it('should reject unknown mode via Zod validation', async () => {
      const result = await handleWorkflowVersions(
        { mode: 'unknown' as Record<string, never> },
        mockRepository,
        context
      );

      // Zod validates the enum before the handler sees it, so error is "Invalid input"
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
    });
  });

  // ========================================================================
  // 5. Delete Mode
  // ========================================================================

  describe('Delete Mode', () => {
    it('should delete single version successfully', async () => {
      mockGetWorkflowVersion.mockReturnValue(sampleVersion);
      mockDeleteWorkflowVersion.mockReturnValue(undefined);

      const result = await handleWorkflowVersions(
        { mode: 'delete', versionId: 3 },
        mockRepository,
        context
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect(data?.message).toContain('Deleted version 3');
      expect(mockDeleteWorkflowVersion).toHaveBeenCalledWith(3);
    });

    it('should return error when single version not found', async () => {
      mockGetWorkflowVersion.mockReturnValue(null);

      const result = await handleWorkflowVersions(
        { mode: 'delete', versionId: 999 },
        mockRepository,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should delete all versions for workflow successfully', async () => {
      mockGetWorkflowVersionCount.mockReturnValue(3);
      mockDeleteWorkflowVersionsByWorkflowId.mockReturnValue(3);

      const result = await handleWorkflowVersions(
        { mode: 'delete', workflowId: sampleWorkflowId, deleteAll: true },
        mockRepository,
        context
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect(data?.deleted).toBe(3);
      expect(data?.message).toContain('Deleted 3 version(s)');
      expect(mockDeleteWorkflowVersionsByWorkflowId).toHaveBeenCalledWith(sampleWorkflowId);
    });

    it('should return zero deleted when no versions exist for workflow', async () => {
      mockGetWorkflowVersionCount.mockReturnValue(0);

      const result = await handleWorkflowVersions(
        { mode: 'delete', workflowId: sampleWorkflowId, deleteAll: true },
        mockRepository,
        context
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect(data?.deleted).toBe(0);
      expect(data?.message).toContain('No versions found');
    });
  });

  // ========================================================================
  // 6. Prune Mode
  // ========================================================================

  describe('Prune Mode', () => {
    it('should prune old versions successfully', async () => {
      mockPruneWorkflowVersions.mockReturnValue(5);
      mockGetWorkflowVersionCount.mockReturnValue(10);

      const result = await handleWorkflowVersions(
        { mode: 'prune', workflowId: sampleWorkflowId, maxVersions: 10 },
        mockRepository,
        context
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect(data?.pruned).toBe(5);
      expect(data?.remaining).toBe(10);
      expect(data?.message).toContain('Pruned 5 old version(s)');
    });

    it('should use default maxVersions of 10 when not provided', async () => {
      mockPruneWorkflowVersions.mockReturnValue(0);
      mockGetWorkflowVersionCount.mockReturnValue(8);

      const result = await handleWorkflowVersions(
        { mode: 'prune', workflowId: sampleWorkflowId },
        mockRepository,
        context
      );

      expect(result.success).toBe(true);
      expect(mockPruneWorkflowVersions).toHaveBeenCalledWith(sampleWorkflowId, 10);
    });

    it('should return zero pruned when workflow has fewer versions than max', async () => {
      mockPruneWorkflowVersions.mockReturnValue(0);
      mockGetWorkflowVersionCount.mockReturnValue(3);

      const result = await handleWorkflowVersions(
        { mode: 'prune', workflowId: sampleWorkflowId, maxVersions: 10 },
        mockRepository,
        context
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect(data?.pruned).toBe(0);
      expect(data?.remaining).toBe(3);
    });
  });

  // ========================================================================
  // 7. Truncate Mode
  // ========================================================================

  describe('Truncate Mode', () => {
    it('should truncate all versions when confirmed', async () => {
      mockTruncateWorkflowVersions.mockReturnValue(50);

      const result = await handleWorkflowVersions(
        { mode: 'truncate', confirmTruncate: true },
        mockRepository,
        context
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect(data?.deleted).toBe(50);
      expect(data?.message).toContain('deleted 50 version(s)');
      expect(mockTruncateWorkflowVersions).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // 8. Edge Cases
  // ========================================================================

  describe('Edge Cases', () => {
    it('should handle workflow with single version', async () => {
      mockGetWorkflowVersions.mockReturnValue([sampleVersions[2]]);

      const result = await handleWorkflowVersions(
        { mode: 'list', workflowId: sampleWorkflowId },
        mockRepository,
        context
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect(data?.count).toBe(1);
      expect((data?.versions as Array<Record<string, unknown>>).length).toBe(1);
    });

    it('should handle workflow with many versions (pagination via limit)', async () => {
      const manyVersions = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        workflowId: sampleWorkflowId,
        versionNumber: i + 1,
        workflowName: 'Test Workflow',
        workflowSnapshot: { name: 'Test', nodes: [], connections: {} },
        trigger: 'partial_update' as const,
        createdAt: `2026-04-01T${String(i).padStart(2, '0')}:00:00.000Z`,
      }));

      mockGetWorkflowVersions.mockReturnValue(manyVersions.slice(0, 10));

      const result = await handleWorkflowVersions(
        { mode: 'list', workflowId: sampleWorkflowId, limit: 10 },
        mockRepository,
        context
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect((data?.versions as Array<Record<string, unknown>>).length).toBe(10);
      expect(data?.count).toBe(10);
    });

    it('should handle ZodError gracefully with detailed errors', async () => {
      const result = await handleWorkflowVersions(
        { mode: 'list', workflowId: 123 as unknown as string },
        mockRepository,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
      expect(result.details).toBeDefined();
    });

    it('should handle unexpected errors gracefully', async () => {
      mockGetWorkflowVersions.mockImplementation(() => {
        throw new Error('Database connection lost');
      });

      const result = await handleWorkflowVersions(
        { mode: 'list', workflowId: sampleWorkflowId },
        mockRepository,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection lost');
    });
  });

  // ========================================================================
  // 9. Rollback Mode (requires API client)
  // ========================================================================

  describe('Rollback Mode', () => {
    it('should call restoreVersion with correct parameters', async () => {
      const mockRestoreVersion = vi.fn().mockResolvedValue({
        success: true,
        message: 'Successfully restored workflow to version 2',
        workflowId: sampleWorkflowId,
        fromVersion: 3,
        toVersionId: 2,
        backupCreated: true,
        backupVersionId: 4,
      });

      vi.spyOn(WorkflowVersioningService.prototype, 'restoreVersion').mockImplementation(
        mockRestoreVersion
      );

      mockGetWorkflow.mockResolvedValue({
        id: sampleWorkflowId,
        name: 'Test Workflow',
        nodes: [],
        connections: {},
      });

      const result = await handleWorkflowVersions(
        { mode: 'rollback', workflowId: sampleWorkflowId, versionId: 2, validateBefore: true },
        mockRepository,
        context
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown> | undefined;
      expect(data?.workflowId).toBe(sampleWorkflowId);
      expect(data?.toVersionId).toBe(2);
      expect(data?.backupCreated).toBe(true);
    });

    it('should return error when version not found for rollback', async () => {
      const mockRestoreVersion = vi.fn().mockResolvedValue({
        success: false,
        message: 'Version 999 not found',
        workflowId: sampleWorkflowId,
        toVersionId: 999,
        backupCreated: false,
      });

      vi.spyOn(WorkflowVersioningService.prototype, 'restoreVersion').mockImplementation(
        mockRestoreVersion
      );

      const result = await handleWorkflowVersions(
        { mode: 'rollback', workflowId: sampleWorkflowId, versionId: 999 },
        mockRepository,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Version 999 not found');
    });

    it('should return error when rollback fails due to API error', async () => {
      const mockRestoreVersion = vi.fn().mockResolvedValue({
        success: false,
        message: 'Failed to create backup before restore: n8n API error',
        workflowId: sampleWorkflowId,
        toVersionId: 2,
        backupCreated: false,
      });

      vi.spyOn(WorkflowVersioningService.prototype, 'restoreVersion').mockImplementation(
        mockRestoreVersion
      );

      const result = await handleWorkflowVersions(
        { mode: 'rollback', workflowId: sampleWorkflowId, versionId: 2 },
        mockRepository,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create backup');
    });
  });
});
