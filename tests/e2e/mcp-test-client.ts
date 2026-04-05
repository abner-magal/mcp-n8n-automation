import { ChildProcess, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// ─── MCP Protocol Types ────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface InitializeResult {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo: {
    name: string;
    version: string;
  };
}

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface ToolCallResult {
  content: Array<{
    type: string;
    text: string;
    [key: string]: unknown;
  }>;
  isError?: boolean;
  [key: string]: unknown;
}

// ─── MCP Test Client ───────────────────────────────────────────────────────

export class McpTestClient {
  private process: ChildProcess | null = null;
  private messageId = 0;
  private buffer = '';
  private readonly serverDir: string;
  private readonly startupTimeout: number;
  private readonly responseTimeout: number;

  constructor(options?: {
    serverDir?: string;
    startupTimeout?: number;
    responseTimeout?: number;
  }) {
    // Default to the directory containing this test file's parent (mcp-n8n-automation/)
    this.serverDir = options?.serverDir ?? resolve(__dirname, '../..');
    this.startupTimeout = options?.startupTimeout ?? 15_000;
    this.responseTimeout = options?.responseTimeout ?? 10_000;
  }

  /**
   * Start the MCP server process in stdio mode.
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error('Server already started. Call shutdown() first.');
    }

    this.buffer = '';
    this.messageId = 0;

    this.process = spawn('node', ['dist/mcp/index.js'], {
      cwd: this.serverDir,
      env: {
        ...process.env,
        MCP_MODE: 'stdio',
        NODE_ENV: 'test',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      // Server logs go to stderr in stdio mode — capture all for debugging
      const text = data.toString();
      console.error('[MCP STDERR]', text.trim());
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString();
    });

    this.process.on('error', (err: Error) => {
      console.error('MCP server process error:', err);
    });

    // Wait for server to be ready (process should not exit immediately)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.process && !this.process.killed) {
          resolve();
        } else {
          reject(new Error('MCP server failed to start — process exited before timeout'));
        }
      }, this.startupTimeout);

      this.process?.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
        clearTimeout(timeout);
        reject(new Error(`MCP server exited unexpectedly with code ${code}, signal ${signal || 'none'}`));
      });
    });
  }

  /**
   * Send MCP initialize handshake and return the result.
   */
  async initialize(): Promise<InitializeResult> {
    const response = await this.sendRequest({
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'mcp-e2e-test-client',
          version: '1.0.0',
        },
      },
    });

    // After initialize, send initialized notification
    await this.sendNotification({
      method: 'notifications/initialized',
    });

    const result = response.result as InitializeResult | undefined;
    if (!result) {
      throw new Error('Initialize response has no result');
    }
    return result;
  }

  /**
   * List all available MCP tools.
   */
  async listTools(): Promise<Tool[]> {
    const response = await this.sendRequest({
      method: 'tools/list',
      params: {},
    });

    const result = response.result as { tools: Tool[] } | undefined;
    if (!result) {
      throw new Error('tools/list response has no result');
    }
    return result.tools;
  }

  /**
   * Call an MCP tool with the given arguments.
   */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolCallResult> {
    const response = await this.sendRequest({
      method: 'tools/call',
      params: {
        name,
        arguments: args,
      },
    });

    // Error responses
    if (response.error) {
      throw new McpToolError(response.error.message, response.error.code, response.error.data);
    }

    const result = response.result as ToolCallResult | undefined;
    if (!result) {
      throw new Error(`tools/call for '${name}' returned no result`);
    }
    return result;
  }

  /**
   * Gracefully shutdown the server process.
   */
  async shutdown(): Promise<void> {
    if (!this.process || this.process.killed) {
      this.process = null;
      return;
    }

    // Send SIGTERM first
    this.process.kill('SIGTERM');

    // Wait for process to exit (max 5 seconds)
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill if still alive
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
        resolve();
      }, 5000);

      this.process?.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.process = null;
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private sendRequest(message: Omit<JsonRpcRequest, 'jsonrpc' | 'id'>): Promise<JsonRpcResponse> {
    const id = ++this.messageId;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      ...message,
    };
    return this.sendMessage(request);
  }

  private sendNotification(message: Omit<JsonRpcRequest, 'jsonrpc' | 'id'>): Promise<void> {
    const notification: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 0, // Notifications use id: 0
      ...message,
    };
    return this.sendNotificationMessage(notification);
  }

  private sendMessage(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    return new Promise<JsonRpcResponse>((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('Server stdin not available'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout (id=${request.id}, method=${request.method})`));
      }, this.responseTimeout);

      // Append newline-delimited JSON (MCP stdio protocol)
      const json = JSON.stringify(request) + '\n';
      this.process.stdin.write(json, (err: Error | null | undefined) => {
        if (err) {
          clearTimeout(timeout);
          reject(err);
          return;
        }

        // Wait for response with matching id
        this.waitForResponse(request.id, timeout).then(resolve, reject);
      });
    });
  }

  private sendNotificationMessage(_notification: JsonRpcRequest): Promise<void> {
    // Notifications don't expect a response
    return Promise.resolve();
  }

  private waitForResponse(requestId: number, timeout: NodeJS.Timeout): Promise<JsonRpcResponse> {
    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const checkBuffer = () => {
        const lines = this.buffer.split('\n').filter((line) => line.trim().length > 0);

        for (const line of lines) {
          try {
            const message = JSON.parse(line) as JsonRpcResponse;
            // Match by id; ignore notifications (id === 0)
            if (message.id === requestId) {
              clearTimeout(timeout);
              // Remove consumed lines from buffer
              const consumedIndex = this.buffer.indexOf(line);
              this.buffer = this.buffer.slice(consumedIndex + line.length + 1);
              resolve(message);
              return;
            }
          } catch {
            // Not valid JSON yet — more data may be incoming
          }
        }

        // Schedule next check
        setTimeout(checkBuffer, 50);
      };

      checkBuffer();
    });
  }

  /**
   * Returns true if the server process is still running.
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }
}

// ─── Custom Error Class ─────────────────────────────────────────────────────

export class McpToolError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = 'McpToolError';
  }
}
