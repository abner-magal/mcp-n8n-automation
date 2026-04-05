/**
 * Tests for WorkflowSpecGenerator service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowSpecGenerator } from '../../../src/services/workflow-spec-generator';
import type { MappedNode } from '../../../src/services/keyword-mapper';

describe('WorkflowSpecGenerator', () => {
  let generator: WorkflowSpecGenerator;

  beforeEach(() => {
    generator = new WorkflowSpecGenerator();
  });

  const createMockNode = (
    type: string,
    name: string,
    category: string,
    confidence = 0.8,
  ): MappedNode => ({
    nodeType: type,
    nodeName: name,
    category,
    confidence,
    suggestedParams: {},
  });

  describe('generateFromNodes', () => {
    it('should return empty spec for empty input', () => {
      const result = generator.generateFromNodes([]);
      expect(result.nodes).toHaveLength(0);
      expect(result.connections).toEqual({});
      expect(result.name).toBe('Empty Workflow');
    });

    it('should return empty spec with custom name for empty input', () => {
      const result = generator.generateFromNodes([], 'Custom Name');
      expect(result.name).toBe('Custom Name');
      expect(result.nodes).toHaveLength(0);
    });

    it('should generate spec with single node', () => {
      const nodes = [
        createMockNode(
          'n8n-nodes-base.webhook',
          'Trigger Webhook',
          'Trigger',
        ),
      ];
      const result = generator.generateFromNodes(nodes);

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].type).toBe('n8n-nodes-base.webhook');
      expect(result.nodes[0].name).toBe('Trigger Webhook');
      expect(result.nodes[0].position).toEqual([200, 300]);
    });

    it('should generate spec with multiple nodes in sequence', () => {
      const nodes = [
        createMockNode(
          'n8n-nodes-base.webhook',
          'Trigger Webhook',
          'Trigger',
        ),
        createMockNode(
          'n8n-nodes-base.httpRequest',
          'Action HTTP Request',
          'Core',
        ),
        createMockNode(
          'n8n-nodes-base.emailSend',
          'Send Email',
          'Communication',
        ),
      ];

      const result = generator.generateFromNodes(nodes);

      expect(result.nodes).toHaveLength(3);
      expect(result.nodes[0].type).toBe('n8n-nodes-base.webhook');
      expect(result.nodes[1].type).toBe('n8n-nodes-base.httpRequest');
      expect(result.nodes[2].type).toBe('n8n-nodes-base.emailSend');
    });

    it('should position nodes in left-to-right flow', () => {
      const nodes = [
        createMockNode('n8n-nodes-base.webhook', 'Trigger', 'Trigger'),
        createMockNode('n8n-nodes-base.httpRequest', 'Action', 'Core'),
        createMockNode('n8n-nodes-base.set', 'Transform', 'Transform'),
      ];

      const result = generator.generateFromNodes(nodes);

      expect(result.nodes[0].position[0]).toBe(200);
      expect(result.nodes[1].position[0]).toBe(450);
      expect(result.nodes[2].position[0]).toBe(700);

      expect(result.nodes[0].position[1]).toBe(300);
      expect(result.nodes[1].position[1]).toBe(300);
      expect(result.nodes[2].position[1]).toBe(300);

      expect(result.nodes[0].position[0]).toBeLessThan(
        result.nodes[1].position[0],
      );
      expect(result.nodes[1].position[0]).toBeLessThan(
        result.nodes[2].position[0],
      );
    });

    it('should create connections between sequential nodes', () => {
      const nodes = [
        createMockNode('n8n-nodes-base.webhook', 'Trigger', 'Trigger'),
        createMockNode('n8n-nodes-base.httpRequest', 'Action', 'Core'),
      ];

      const result = generator.generateFromNodes(nodes);

      expect(Object.keys(result.connections)).toHaveLength(1);

      const triggerNode = result.nodes[0];
      const connection = result.connections[triggerNode.id];
      expect(connection).toBeDefined();
      expect(connection.main).toHaveLength(1);
      expect(connection.main[0]).toHaveLength(1);
      expect(connection.main[0][0].node).toBe(result.nodes[1].id);
      expect(connection.main[0][0].type).toBe('main');
      expect(connection.main[0][0].index).toBe(0);
    });

    it('should create no connections for single node', () => {
      const nodes = [
        createMockNode('n8n-nodes-base.webhook', 'Trigger', 'Trigger'),
      ];
      const result = generator.generateFromNodes(nodes);
      expect(Object.keys(result.connections)).toHaveLength(0);
    });

    it('should generate workflow name from nodes when not provided', () => {
      const nodes = [
        createMockNode(
          'n8n-nodes-base.webhook',
          'Trigger Webhook',
          'Trigger',
        ),
        createMockNode(
          'n8n-nodes-base.httpRequest',
          'Action HTTP Request',
          'Core',
        ),
      ];

      const result = generator.generateFromNodes(nodes);

      expect(result.name).toContain('Trigger Webhook');
    });

    it('should use provided name over generated name', () => {
      const nodes = [
        createMockNode('n8n-nodes-base.webhook', 'Trigger', 'Trigger'),
      ];

      const result = generator.generateFromNodes(nodes, 'My Custom Workflow');

      expect(result.name).toBe('My Custom Workflow');
    });

    it('should include suggested parameters in nodes', () => {
      const nodes = [
        createMockNode('n8n-nodes-base.emailSend', 'Send Email', 'Communication'),
      ];
      nodes[0].suggestedParams = {
        toEmail: 'test@example.com',
        subject: 'Test',
      };

      const result = generator.generateFromNodes(nodes);

      expect(result.nodes[0].parameters).toEqual({
        toEmail: 'test@example.com',
        subject: 'Test',
      });
    });

    it('should use empty parameters when not provided', () => {
      const nodes = [
        createMockNode('n8n-nodes-base.code', 'Run Code', 'Core'),
      ];

      const result = generator.generateFromNodes(nodes);

      expect(result.nodes[0].parameters).toEqual({});
    });

    it('should include settings in generated spec', () => {
      const nodes = [
        createMockNode('n8n-nodes-base.webhook', 'Trigger', 'Trigger'),
      ];

      const result = generator.generateFromNodes(nodes);

      expect(result.settings).toBeDefined();
      expect(result.settings!.saveExecutionData).toBe(true);
      expect(result.settings!.saveManualExecutions).toBe(true);
    });

    it('should set typeVersion to 1 for all nodes', () => {
      const nodes = [
        createMockNode('n8n-nodes-base.webhook', 'Trigger', 'Trigger'),
        createMockNode('n8n-nodes-base.httpRequest', 'Action', 'Core'),
      ];

      const result = generator.generateFromNodes(nodes);

      for (const node of result.nodes) {
        expect(node.typeVersion).toBe(1);
      }
    });

    it('should generate unique IDs for each node', () => {
      const nodes = [
        createMockNode('n8n-nodes-base.webhook', 'Trigger', 'Trigger'),
        createMockNode('n8n-nodes-base.httpRequest', 'Action', 'Core'),
        createMockNode('n8n-nodes-base.set', 'Transform', 'Transform'),
      ];

      const result = generator.generateFromNodes(nodes);

      const ids = result.nodes.map((n) => n.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should generate valid workflow structure with 5 nodes', () => {
      const nodes = [
        createMockNode('n8n-nodes-base.scheduleTrigger', 'Schedule', 'Trigger'),
        createMockNode('n8n-nodes-base.httpRequest', 'Fetch Data', 'Core'),
        createMockNode('n8n-nodes-base.if', 'Condition', 'Flow'),
        createMockNode('n8n-nodes-base.set', 'Transform', 'Transform'),
        createMockNode('n8n-nodes-base.emailSend', 'Notify', 'Communication'),
      ];

      const result = generator.generateFromNodes(nodes);

      expect(result.nodes).toHaveLength(5);
      expect(Object.keys(result.connections)).toHaveLength(4);

      for (let i = 0; i < 4; i++) {
        const conn = result.connections[result.nodes[i].id];
        expect(conn.main[0][0].node).toBe(result.nodes[i + 1].id);
      }
    });

    it('should handle nodes with suggested params from keyword mapper', () => {
      const nodes: MappedNode[] = [
        {
          nodeType: 'n8n-nodes-base.webhook',
          nodeName: 'Trigger Webhook',
          category: 'Trigger',
          confidence: 0.9,
          suggestedParams: {
            httpMethod: 'POST',
            path: 'webhook-path',
          },
        },
        {
          nodeType: 'n8n-nodes-base.httpRequest',
          nodeName: 'Action HTTP Request',
          category: 'Core',
          confidence: 0.7,
          suggestedParams: {
            method: 'GET',
            url: 'https://api.example.com',
          },
        },
      ];

      const result = generator.generateFromNodes(nodes);

      expect(result.nodes[0].parameters).toEqual({
        httpMethod: 'POST',
        path: 'webhook-path',
      });
      expect(result.nodes[1].parameters).toEqual({
        method: 'GET',
        url: 'https://api.example.com',
      });
    });

    it('should truncate workflow name if too long', () => {
      const nodes = [
        createMockNode(
          'n8n-nodes-base.webhook',
          'Trigger With A Very Very Very Very Very Very Long Name Indeed',
          'Trigger',
        ),
        createMockNode(
          'n8n-nodes-base.httpRequest',
          'Action With Another Very Very Very Very Very Very Long Name',
          'Core',
        ),
        createMockNode(
          'n8n-nodes-base.emailSend',
          'Send Email With Yet Another Very Very Very Very Long Name Here',
          'Communication',
        ),
      ];

      const result = generator.generateFromNodes(nodes);

      expect(result.name.length).toBeLessThanOrEqual(103);
    });
  });
});
