import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Performance Test Configuration
 * 
 * Optimized for accurate timing measurements:
 * - Single-threaded execution (no interference)
 * - Sequential test runs
 * - Extended timeouts for long-running benchmarks
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/performance/**/*.test.ts'],
    testTimeout: 120000, // 2 minutes for benchmarks
    hookTimeout: 30000,
    
    // Run sequentially for accurate timing (no parallel interference)
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true // Run all tests in single process
      }
    },
    
    // No retries - benchmarks should be deterministic
    retry: 0,
    
    // Single thread to avoid resource contention
    maxConcurrency: 1,
    
    // Performance-specific setup
    setupFiles: ['./tests/setup/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      BENCHMARK_MODE: 'true'
    },
    
    // Reporters
    reporters: ['verbose'],
    
    // Allow tests to access source files
    deps: {
      interopDefault: true
    },
    
    // Coverage not needed for benchmarks
    coverage: {
      enabled: false
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests')
    }
  },
  esbuild: {
    target: 'node18'
  }
});
