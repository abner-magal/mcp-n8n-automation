#!/usr/bin/env node

import { N8NDocumentationMCPServer } from './server';
import { logger } from '../utils/logger';
import { existsSync } from 'fs';

// Add error details to stderr for Claude Desktop debugging
process.on('uncaughtException', (error) => {
  if (process.env.MCP_MODE !== 'stdio') {
    console.error('Uncaught Exception:', error);
  }
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  if (process.env.MCP_MODE !== 'stdio') {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  }
  logger.error('Unhandled Rejection:', reason);
  process.exit(1);
});

/**
 * Detects if running in a container environment (Docker, Podman, Kubernetes, etc.)
 * Uses multiple detection methods for robustness:
 * 1. Environment variables (IS_DOCKER, IS_CONTAINER with multiple formats)
 * 2. Filesystem markers (/.dockerenv, /run/.containerenv)
 */
function isContainerEnvironment(): boolean {
  // Check environment variables with multiple truthy formats
  const dockerEnv = (process.env.IS_DOCKER || '').toLowerCase();
  const containerEnv = (process.env.IS_CONTAINER || '').toLowerCase();

  if (['true', '1', 'yes'].includes(dockerEnv)) {
    return true;
  }
  if (['true', '1', 'yes'].includes(containerEnv)) {
    return true;
  }

  // Fallback: Check filesystem markers
  // /.dockerenv exists in Docker containers
  // /run/.containerenv exists in Podman containers
  try {
    return existsSync('/.dockerenv') || existsSync('/run/.containerenv');
  } catch (error) {
    // If filesystem check fails, assume not in container
    logger.debug('Container detection filesystem check failed:', error);
    return false;
  }
}

async function main() {
  const mode = process.env.MCP_MODE || 'stdio';

  try {
    // Only show debug messages in HTTP mode to avoid corrupting stdio communication
    if (mode === 'http') {
      console.error(`Starting n8n Documentation MCP Server in ${mode} mode...`);
      console.error('Current directory:', process.cwd());
      console.error('Node version:', process.version);
    }

    if (mode === 'http') {
      // Check if we should use the fixed implementation (DEPRECATED)
      if (process.env.USE_FIXED_HTTP === 'true') {
        // DEPRECATION WARNING: Fixed HTTP implementation is deprecated
        // It does not support SSE streaming required by clients like OpenAI Codex
        logger.warn(
          'DEPRECATION WARNING: USE_FIXED_HTTP=true is deprecated as of v2.31.8. ' +
          'The fixed HTTP implementation does not support SSE streaming required by clients like OpenAI Codex. ' +
          'Please unset USE_FIXED_HTTP to use the modern SingleSessionHTTPServer which supports both JSON-RPC and SSE. ' +
          'This option will be removed in a future version. See: https://github.com/czlonkowski/n8n-mcp/issues/524'
        );
        console.warn('\n⚠️  DEPRECATION WARNING ⚠️');
        console.warn('USE_FIXED_HTTP=true is deprecated as of v2.31.8.');
        console.warn('The fixed HTTP implementation does not support SSE streaming.');
        console.warn('Please unset USE_FIXED_HTTP to use SingleSessionHTTPServer.');
        console.warn('See: https://github.com/czlonkowski/n8n-mcp/issues/524\n');

        // Use the deprecated fixed HTTP implementation
        const { startFixedHTTPServer } = await import('../http-server');
        await startFixedHTTPServer();
      } else {
        // HTTP mode - for remote deployment with single-session architecture
        const { SingleSessionHTTPServer } = await import('../http-server-single-session');
        const server = new SingleSessionHTTPServer();
        
        // Graceful shutdown handlers
        const shutdown = async () => {
          await server.shutdown();
          process.exit(0);
        };
        
        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
        
        await server.start();
      }
    } else {
      // Stdio mode - for local Claude Desktop
      const server = new N8NDocumentationMCPServer();

      // Graceful shutdown handler (fixes Issue #277)
      let isShuttingDown = false;
      const shutdown = async (signal: string = 'UNKNOWN') => {
        if (isShuttingDown) return; // Prevent multiple shutdown calls
        isShuttingDown = true;

        try {
          logger.info(`Shutdown initiated by: ${signal}`);

          await server.shutdown();

          // Close stdin to signal we're done reading
          if (process.stdin && !process.stdin.destroyed) {
            process.stdin.pause();
            process.stdin.destroy();
          }

          // Exit with timeout to ensure we don't hang
          // Increased to 1000ms for slower systems
          setTimeout(() => {
            logger.warn('Shutdown timeout exceeded, forcing exit');
            process.exit(0);
          }, 1000).unref();

          // Let the timeout handle the exit for graceful shutdown
          // (removed immediate exit to allow cleanup to complete)
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      };

      // Handle termination signals (fixes Issue #277)
      // Signal handling strategy:
      // - Claude Desktop (Windows/macOS/Linux): stdin handlers + signal handlers
      //   Primary: stdin close when Claude quits | Fallback: SIGTERM/SIGINT/SIGHUP
      // - Container environments: signal handlers ONLY
      //   stdin closed in detached mode would trigger immediate shutdown
      //   Container detection via IS_DOCKER/IS_CONTAINER env vars + filesystem markers
      // - Manual execution: Both stdin and signal handlers work
      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGHUP', () => shutdown('SIGHUP'));

      // Handle stdio disconnect - PRIMARY shutdown mechanism for Claude Desktop
      // Skip in container environments (Docker, Kubernetes, Podman) to prevent
      // premature shutdown when stdin is closed in detached mode.
      // Containers rely on signal handlers (SIGTERM/SIGINT/SIGHUP) for proper shutdown.
      const isContainer = isContainerEnvironment();

      if (!isContainer && process.stdin.readable && !process.stdin.destroyed) {
        try {
          process.stdin.on('end', () => shutdown('STDIN_END'));
          process.stdin.on('close', () => shutdown('STDIN_CLOSE'));
        } catch (error) {
          logger.error('Failed to register stdin handlers, using signal handlers only:', error);
          // Continue - signal handlers will still work
        }
      }

      await server.run();
    }

    logger.info('Server startup completed successfully');

  } catch (error) {
    // In stdio mode, we cannot output to console at all
    if (mode !== 'stdio') {
      console.error('Failed to start MCP server:', error);
      logger.error('Failed to start MCP server', error);

      // Provide helpful error messages
      if (error instanceof Error && error.message.includes('nodes.db not found')) {
        console.error('\nTo fix this issue:');
        console.error('1. cd to the n8n-mcp directory');
        console.error('2. Run: npm run build');
        console.error('3. Run: npm run rebuild');
      } else if (error instanceof Error && error.message.includes('NODE_MODULE_VERSION')) {
        console.error('\nTo fix this Node.js version mismatch:');
        console.error('1. cd to the n8n-mcp directory');
        console.error('2. Run: npm rebuild better-sqlite3');
        console.error('3. If that doesn\'t work, try: rm -rf node_modules && npm install');
      }
    }

    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}