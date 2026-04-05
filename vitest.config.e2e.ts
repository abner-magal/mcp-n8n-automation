import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * E2E test configuration for MCP protocol testing.
 *
 * Key differences from main config:
 * - Single-threaded (pool: 'forks' with 1 worker) to avoid port/process conflicts
 * - Longer timeouts (E2E tests spawn real processes)
 * - No coverage (too slow for E2E)
 * - Sequential execution (no parallelism)
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    // Single worker — E2E tests spawn real processes
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 1,
        minForks: 1,
      },
    },
    // Longer timeouts for process-based tests
    testTimeout: 30_000,
    hookTimeout: 30_000,
    teardownTimeout: 15_000,
    // No retries for E2E
    retry: 0,
    // No coverage for E2E
    coverage: {
      enabled: false,
    },
    reporters: ['verbose'],
    // Test isolation
    isolate: true,
    // Force exit to prevent orphaned processes
    forceRerunTriggers: ['**/tests/e2e/**/*.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests'),
    },
  },
  esbuild: {
    target: 'node18',
  },
});
