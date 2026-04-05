/**
 * Workflow Spec Generator Service
 * Generates valid n8n workflow JSON from mapped node configurations.
 */

import { z } from 'zod';
import type { MappedNode } from './keyword-mapper';

const WorkflowNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  typeVersion: z.number().int().positive().default(1),
  position: z.tuple([z.number(), z.number()]),
  parameters: z.record(z.unknown()).optional().default({}),
});

const WorkflowConnectionSchema = z.object({
  main: z.array(
    z.array(
      z.object({
        node: z.string(),
        type: z.literal('main'),
        index: z.number().int().nonnegative().default(0),
      }),
    ),
  ),
});

const WorkflowSpecSchema = z.object({
  name: z.string().min(1),
  nodes: z.array(WorkflowNodeSchema),
  connections: z.record(WorkflowConnectionSchema),
  settings: z
    .object({
      saveExecutionData: z.boolean().optional(),
      saveManualExecutions: z.boolean().optional(),
    })
    .optional(),
});

export interface WorkflowSpec {
  name: string;
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    typeVersion: number;
    position: [number, number];
    parameters?: Record<string, unknown>;
  }>;
  connections: Record<
    string,
    {
      main: Array<Array<{ node: string; type: 'main'; index: number }>>;
    }
  >;
  settings?: {
    saveExecutionData?: boolean;
    saveManualExecutions?: boolean;
  };
}

export class WorkflowSpecGenerator {
  private readonly NODE_SPACING_X = 250;
  private readonly NODE_SPACING_Y = 0;
  private readonly START_X = 200;
  private readonly START_Y = 300;

  generateFromNodes(mappedNodes: MappedNode[], name?: string): WorkflowSpec {
    if (mappedNodes.length === 0) {
      return this.createEmptySpec(name || 'Empty Workflow');
    }

    const workflowName = name || this.generateWorkflowName(mappedNodes);
    const nodes = this.buildNodes(mappedNodes);
    const connections = this.buildConnections(nodes);

    const spec: WorkflowSpec = {
      name: workflowName,
      nodes,
      connections,
      settings: {
        saveExecutionData: true,
        saveManualExecutions: true,
      },
    };

    return WorkflowSpecSchema.parse(spec);
  }

  private createEmptySpec(name: string): WorkflowSpec {
    return {
      name,
      nodes: [],
      connections: {},
      settings: {
        saveExecutionData: true,
        saveManualExecutions: true,
      },
    };
  }

  private buildNodes(mappedNodes: MappedNode[]): WorkflowSpec['nodes'] {
    return mappedNodes.map((mappedNode, index) => {
      const id = `node-${index}`;
      const position = this.calculateNodePosition(index);

      return {
        id,
        name: mappedNode.nodeName,
        type: mappedNode.nodeType,
        typeVersion: 1,
        position,
        parameters: mappedNode.suggestedParams || {},
      };
    });
  }

  private calculateNodePosition(index: number): [number, number] {
    const x = this.START_X + index * this.NODE_SPACING_X;
    const y = this.START_Y + index * this.NODE_SPACING_Y;
    return [x, y];
  }

  private buildConnections(
    nodes: WorkflowSpec['nodes'],
  ): WorkflowSpec['connections'] {
    const connections: WorkflowSpec['connections'] = {};

    for (let i = 0; i < nodes.length - 1; i++) {
      const currentNode = nodes[i];
      const nextNode = nodes[i + 1];

      connections[currentNode.id] = {
        main: [
          [
            {
              node: nextNode.id,
              type: 'main' as const,
              index: 0,
            },
          ],
        ],
      };
    }

    return connections;
  }

  private generateWorkflowName(mappedNodes: MappedNode[]): string {
    const triggerNode = mappedNodes.find((n) => n.category === 'Trigger');
    const actionNodes = mappedNodes.filter((n) => n.category !== 'Trigger');

    const parts: string[] = [];

    if (triggerNode) {
      parts.push(triggerNode.nodeName);
    }

    if (actionNodes.length > 0) {
      const actionNames = actionNodes.slice(0, 2).map((n) => n.nodeName);
      parts.push(...actionNames);
    }

    if (parts.length === 0) {
      return 'Generated Workflow';
    }

    const name = parts.join(' → ');
    return name.length > 100 ? `${name.substring(0, 97)}...` : name;
  }
}

// Singleton instance
let _workflowSpecGenerator: WorkflowSpecGenerator | null = null;

/**
 * Get or create the WorkflowSpecGenerator singleton.
 */
export function getWorkflowSpecGenerator(): WorkflowSpecGenerator {
  if (!_workflowSpecGenerator) {
    _workflowSpecGenerator = new WorkflowSpecGenerator();
  }
  return _workflowSpecGenerator;
}

/**
 * Reset the WorkflowSpecGenerator singleton (useful for testing).
 */
export function resetWorkflowSpecGenerator(): void {
  _workflowSpecGenerator = null;
}
