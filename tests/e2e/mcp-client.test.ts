import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { McpTestClient, McpToolError } from './mcp-test-client';

// Check if database exists before running E2E tests
const dbPath = resolve(__dirname, '../../data/nodes.db');
const dbExists = existsSync(dbPath);

if (!dbExists) {
  console.warn('⚠️  Skipping E2E tests: nodes.db not found. Run `npm run rebuild` first.');
}

describe('E2E: MCP Client Protocol', () => {
  let client: McpTestClient;

  beforeAll(async () => {
    if (!dbExists) {
      throw new Error('nodes.db not found. Run `npm run rebuild` to create the database before running E2E tests.');
    }

    client = new McpTestClient();
    await client.start();
  }, 30_000);

  afterAll(async () => {
    await client.shutdown();
  }, 10_000);

  // ─── 1. MCP Protocol Handshake ─────────────────────────────────────────

  describe('MCP Handshake', () => {
    it('should complete initialize handshake successfully', async () => {
      const result = await client.initialize();

      expect(result.protocolVersion).toBeDefined();
      expect(typeof result.protocolVersion).toBe('string');
      expect(result.serverInfo).toBeDefined();
      expect(result.serverInfo.name).toBeDefined();
      expect(result.serverInfo.version).toBeDefined();
      expect(result.capabilities).toBeDefined();
    });

    it('should return a valid protocol version', async () => {
      const result = await client.initialize();
      // MCP protocol versions follow date format like '2024-11-05'
      expect(result.protocolVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should include server info with name and version', async () => {
      const result = await client.initialize();

      expect(result.serverInfo.name).toBeTruthy();
      expect(result.serverInfo.version).toBeTruthy();
      expect(result.serverInfo.name).toContain('n8n');
    });
  });

  // ─── 2. Tool Discovery ─────────────────────────────────────────────────

  describe('Tool Discovery', () => {
    let tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;

    beforeAll(async () => {
      await client.initialize();
      tools = await client.listTools();
    });

    it('should return a non-empty list of tools', () => {
      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should have unique tool names', () => {
      const names = tools.map((t) => t.name);
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    });

    it('should include core documentation tools', () => {
      const toolNames = tools.map((t) => t.name);
      // These tools should always be available
      expect(toolNames).toContain('search_nodes');
      expect(toolNames).toContain('get_node');
    });

    it('should have valid inputSchema for each tool', () => {
      tools.forEach((tool) => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      });
    });

    it('should have non-empty descriptions for all tools', () => {
      tools.forEach((tool) => {
        expect(tool.description.length).toBeGreaterThan(10);
      });
    });
  });

  // ─── 3. Tool Execution (Success Cases) ─────────────────────────────────

  describe('Tool Execution — Success', () => {
    beforeAll(async () => {
      await client.initialize();
    });

    it('should execute search_nodes tool successfully', async () => {
      const result = await client.callTool('search_nodes', { query: 'HTTP' });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
    });

    it('should execute get_node tool with valid node type', async () => {
      const result = await client.callTool('get_node', {
        nodeType: 'n8n-nodes-base.httpRequest',
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
    });

    it('should return text content from tool execution', async () => {
      const result = await client.callTool('search_nodes', { query: 'webhook' });

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent).toBeDefined();
      expect(typeof textContent?.text).toBe('string');
    });
  });

  // ─── 4. Tool Execution (Error Cases) ───────────────────────────────────

  describe('Tool Execution — Error Handling', () => {
    beforeAll(async () => {
      await client.initialize();
    });

    it('should return isError for nonexistent tool name', async () => {
      const result = await client.callTool('nonexistent_tool', {});

      // MCP returns tool errors as successful responses with isError: true
      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool');
    });

    it('should include error message in content for tool errors', async () => {
      const result = await client.callTool('nonexistent_tool', {});

      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].text).toContain('nonexistent_tool');
    });

    it('should return isError for missing required parameters', async () => {
      const result = await client.callTool('get_node', {});

      // MCP returns validation errors as isError: true
      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required');
    });

    it('should handle empty query gracefully', async () => {
      const result = await client.callTool('search_nodes', { query: '' });
      // Should not throw — may return empty results
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });
  });

  // ─── 5. Tool Execution (Real Service — Docs Fallback) ──────────────────

  describe('Tool Execution — External Docs Fallback', () => {
    beforeAll(async () => {
      await client.initialize();
    });

    it('should execute tools_documentation tool', async () => {
      const result = await client.callTool('tools_documentation', {
        topic: 'HTTP Request node',
        depth: 'essentials',
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
    });

    it('should return relevant documentation content', async () => {
      const result = await client.callTool('tools_documentation', {
        topic: 'webhook trigger',
        depth: 'essentials',
      });

      const textContent = result.content.find((c) => c.type === 'text');
      expect(textContent).toBeDefined();
      expect(textContent?.text.length).toBeGreaterThan(0);
    });

    it('should handle unknown topic gracefully', async () => {
      const result = await client.callTool('tools_documentation', {
        topic: 'nonexistent_node_xyz_123',
        depth: 'essentials',
      });

      // Should return some response, not crash
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });
  });

  // ─── 6. Server Lifecycle ───────────────────────────────────────────────

  describe('Server Lifecycle', () => {
    it('should report running when server is active', () => {
      expect(client.isRunning()).toBe(true);
    });

    it('should handle multiple tool calls without restart', async () => {
      await client.initialize();

      // Make several calls in sequence
      const r1 = await client.callTool('search_nodes', { query: 'slack' });
      const r2 = await client.callTool('search_nodes', { query: 'telegram' });
      const r3 = await client.callTool('search_nodes', { query: 'email' });

      expect(r1.content.length).toBeGreaterThan(0);
      expect(r2.content.length).toBeGreaterThan(0);
      expect(r3.content.length).toBeGreaterThan(0);
    });
  });
});
