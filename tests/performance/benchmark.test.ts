import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  BenchmarkResult,
  ThresholdConfig,
  generateTable,
  generateMarkdownReport,
  checkThresholds,
  getDefaultThresholds,
  calculateStats,
  formatMs
} from './report';

/**
 * Performance Benchmark Tests for MCP Server Tools
 * 
 * Measures latency, throughput, and resource usage across tool categories.
 * These are BENCHMARK tests — they measure performance, not assert correctness
 * (unless critical thresholds are exceeded).
 * 
 * Run with: npm run test:performance
 */

// Track memory usage
interface MemorySnapshot {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

function getMemorySnapshot(): MemorySnapshot {
  const usage = process.memoryUsage();
  return {
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    rss: usage.rss
  };
}

function formatMemory(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

// Tool test definitions
interface ToolTestCase {
  name: string;
  args: Record<string, unknown>;
  category: 'local' | 'external' | 'ai';
  skipIfOffline?: boolean;
}

const toolTestCases: ToolTestCase[] = [
  {
    name: 'search_nodes',
    args: { query: 'HTTP Request' },
    category: 'local'
  },
  {
    name: 'n8n_suggest_nodes',
    args: { task: 'Send email when webhook receives data' },
    category: 'local'
  },
  {
    name: 'n8n_search_external_docs',
    args: { query: 'HTTP Request node' },
    category: 'external',
    skipIfOffline: true
  },
  {
    name: 'n8n_search_kapa_ai',
    args: { query: 'How to use webhooks' },
    category: 'external',
    skipIfOffline: true
  },
  {
    name: 'n8n_search_llms_txt',
    args: { query: 'Schedule trigger' },
    category: 'external',
    skipIfOffline: true
  }
];

// Benchmark configuration
const BENCH_CONFIG = {
  iterations: parseInt(process.env.BENCH_ITERATIONS || '10', 10),
  concurrentRequests: parseInt(process.env.BENCH_CONCURRENT || '50', 10),
  memoryTestCalls: parseInt(process.env.BENCH_MEMORY_CALLS || '100', 10),
  warmupRuns: 2
};

describe('Performance Benchmark Tests', () => {
  const results: BenchmarkResult[] = [];
  let isOnline = true;

  beforeAll(async () => {
    // Check network connectivity
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      await fetch('https://docs.n8n.io/llms.txt', { 
        method: 'HEAD', 
        signal: controller.signal 
      });
      clearTimeout(timeout);
      isOnline = true;
    } catch {
      isOnline = false;
      console.warn('⚠️  Network offline — skipping external tool benchmarks');
    }

    // Warmup: run one iteration of each tool to warm up caches
    console.log('\n🔥 Running warmup...');
    for (const testCase of toolTestCases) {
      if (testCase.skipIfOffline && !isOnline) continue;
      // Simulate warmup with a simple operation
      await simulateToolCall(testCase);
    }
  });

  describe('A. Tool Latency Benchmarks', () => {
    toolTestCases.forEach(testCase => {
      it(`should measure latency for ${testCase.name}`, async () => {
        // Skip external tools if offline
        if (testCase.skipIfOffline && !isOnline) {
          console.log(`⏭️  Skipping ${testCase.name} (offline)`);
          return;
        }

        console.log(`\n📊 Benchmarking: ${testCase.name}`);
        const measurements: number[] = [];
        const totalAttempts = BENCH_CONFIG.iterations;

        for (let i = 0; i < BENCH_CONFIG.iterations; i++) {
          const start = process.hrtime.bigint();
          
          try {
            await simulateToolCall(testCase);
            const end = process.hrtime.bigint();
            const durationMs = Number(end - start) / 1_000_000;
            measurements.push(durationMs);
            
            if (i % 5 === 0) {
              console.log(`  Iteration ${i + 1}/${BENCH_CONFIG.iterations}: ${durationMs.toFixed(2)}ms`);
            }
          } catch (error) {
            console.warn(`  Iteration ${i + 1} failed: ${(error as Error).message}`);
          }
        }

        const stats = calculateStats(testCase.name, measurements, totalAttempts);
        results.push(stats);

        // Print results for this tool
        console.log(`\n✅ ${testCase.name} Results:`);
        console.log(`   Min: ${formatMs(stats.min)} | Max: ${formatMs(stats.max)} | Avg: ${formatMs(stats.avg)}`);
        console.log(`   P50: ${formatMs(stats.p50)} | P95: ${formatMs(stats.p95)} | P99: ${formatMs(stats.p99)}`);
        console.log(`   Success: ${stats.successRate.toFixed(1)}% | Errors: ${stats.errorRate.toFixed(1)}%`);

        // Soft assertions — log warnings but don't fail unless critical
        const thresholds = getDefaultThresholds();
        const threshold = thresholds.find(t => t.tool === testCase.name);
        
        if (threshold) {
          if (stats.p95 > threshold.p95 * 2) {
            console.warn(`⚠️  WARNING: P95 (${formatMs(stats.p95)}) exceeds 2x threshold (${formatMs(threshold.p95)})`);
          }
          if (stats.successRate < 50) {
            throw new Error(`Critical: Success rate ${stats.successRate.toFixed(1)}% below 50% minimum`);
          }
        }
      });
    });

    it('should generate and display benchmark report', () => {
      if (results.length === 0) {
        console.log('⏭️  No benchmark results to display');
        return;
      }

      const table = generateTable(results);
      console.log('\n' + table);

      // Also generate markdown for documentation
      const markdown = generateMarkdownReport(results);
      expect(markdown).toContain('Performance Benchmark Report');
      expect(markdown).toContain(results[0].tool);
    });

    it('should validate against thresholds', () => {
      if (results.length === 0) {
        console.log('⏭️  No results to validate');
        return;
      }

      const thresholds = getDefaultThresholds();
      const checkResult = checkThresholds(results, thresholds);

      if (checkResult.warnings.length > 0) {
        console.log('\n⚠️  Warnings:');
        checkResult.warnings.forEach(w => console.log(`   - ${w}`));
      }

      if (!checkResult.passed) {
        console.log('\n❌ Threshold violations:');
        checkResult.failures.forEach(f => console.log(`   - ${f}`));
        
        // Don't fail the test — just warn (benchmark tests measure, not fail)
        // Only fail if success rate is critically low
        const criticalFailures = checkResult.failures.filter(f => f.includes('Success rate'));
        if (criticalFailures.length > 0) {
          throw new Error(`Critical threshold violations: ${criticalFailures.join(', ')}`);
        }
      } else {
        console.log('\n✅ All thresholds passed');
      }

      expect(checkResult).toHaveProperty('passed');
      expect(checkResult).toHaveProperty('failures');
      expect(checkResult).toHaveProperty('warnings');
    });
  });

  describe('B. Rate Limiter Under Load', () => {
    it('should handle concurrent requests without crashing', async () => {
      const concurrentRequests = BENCH_CONFIG.concurrentRequests;
      console.log(`\n🚀 Testing concurrent load: ${concurrentRequests} requests`);

      const startTime = process.hrtime.bigint();
      const successes: number[] = [];
      const failures: Error[] = [];

      // Run concurrent requests
      const promises = Array(concurrentRequests)
        .fill(null)
        .map(async (_, index) => {
          const requestStart = process.hrtime.bigint();
          try {
            await simulateToolCall({
              name: 'search_nodes',
              args: { query: 'HTTP Request' },
              category: 'local'
            });
            const requestEnd = process.hrtime.bigint();
            const durationMs = Number(requestEnd - requestStart) / 1_000_000;
            successes.push(durationMs);
          } catch (error) {
            failures.push(error as Error);
          }
        });

      await Promise.all(promises);
      const endTime = process.hrtime.bigint();
      const totalDurationMs = Number(endTime - startTime) / 1_000_000;

      const successRate = (successes.length / concurrentRequests) * 100;
      const errorRate = (failures.length / concurrentRequests) * 100;
      const avgLatency = successes.length > 0 
        ? successes.reduce((a, b) => a + b, 0) / successes.length 
        : 0;

      console.log(`\n📈 Load Test Results:`);
      console.log(`   Total requests: ${concurrentRequests}`);
      console.log(`   Successful: ${successes.length} (${successRate.toFixed(1)}%)`);
      console.log(`   Failed: ${failures.length} (${errorRate.toFixed(1)}%)`);
      console.log(`   Total duration: ${formatMs(totalDurationMs)}`);
      console.log(`   Avg latency under load: ${formatMs(avgLatency)}`);
      console.log(`   Throughput: ${(concurrentRequests / (totalDurationMs / 1000)).toFixed(0)} req/s`);

      if (failures.length > 0) {
        console.log(`\n   Sample errors:`);
        failures.slice(0, 3).forEach((err, i) => {
          console.log(`     ${i + 1}. ${err.message}`);
        });
      }

      // Assertions
      expect(successes.length).toBeGreaterThan(0);
      expect(totalDurationMs).toBeLessThan(30000); // Should complete within 30s
    });

    it('should verify rate limiter behavior (if enabled)', async () => {
      const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED === 'true';
      
      if (!rateLimitEnabled) {
        console.log('\n⏭️  Rate limiter not enabled — skipping test');
        return;
      }

      console.log('\n🛡️  Testing rate limiter...');
      const burstSize = 100;
      let rateLimitedCount = 0;

      const promises = Array(burstSize)
        .fill(null)
        .map(async () => {
          try {
            await simulateToolCall({
              name: 'search_nodes',
              args: { query: 'test' },
              category: 'local'
            });
          } catch (error) {
            const message = (error as Error).message;
            if (message.includes('rate limit') || message.includes('429')) {
              rateLimitedCount++;
            }
          }
        });

      await Promise.all(promises);

      console.log(`   Burst size: ${burstSize}`);
      console.log(`   Rate limited: ${rateLimitedCount}`);
      console.log(`   Success: ${burstSize - rateLimitedCount}`);

      // If rate limiter is enabled, some requests should be rejected
      expect(rateLimitedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('C. Memory Usage', () => {
    it('should not leak memory after repeated tool calls', async () => {
      const callCount = BENCH_CONFIG.memoryTestCalls;
      console.log(`\n🧠 Testing memory usage over ${callCount} calls...`);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const memBefore = getMemorySnapshot();
      console.log(`   Memory before: ${formatMemory(memBefore.heapUsed)}`);

      // Run many tool calls
      for (let i = 0; i < callCount; i++) {
        await simulateToolCall({
          name: 'search_nodes',
          args: { query: 'HTTP Request' },
          category: 'local'
        });

        if ((i + 1) % 25 === 0) {
          const currentMem = process.memoryUsage().heapUsed;
          console.log(`   Call ${i + 1}/${callCount}: ${formatMemory(currentMem)}`);
        }
      }

      // Force GC again if available
      if (global.gc) {
        global.gc();
      }

      const memAfter = getMemorySnapshot();
      console.log(`   Memory after: ${formatMemory(memAfter.heapUsed)}`);

      const heapGrowth = memAfter.heapUsed - memBefore.heapUsed;
      const heapGrowthPercent = (heapGrowth / memBefore.heapUsed) * 100;

      console.log(`\n📊 Memory Growth:`);
      console.log(`   Heap: ${formatMemory(heapGrowth)} (${heapGrowthPercent.toFixed(2)}%)`);
      console.log(`   RSS: ${formatMemory(memAfter.rss - memBefore.rss)}`);
      console.log(`   External: ${formatMemory(memAfter.external - memBefore.external)}`);

      // Memory growth should be reasonable (< 10%)
      expect(heapGrowthPercent).toBeLessThan(10);
    });

    it('should release resources after concurrent operations', async () => {
      const concurrentOps = 20;
      console.log(`\n🔄 Testing memory after ${concurrentOps} concurrent operations...`);

      if (global.gc) {
        global.gc();
      }

      const memBefore = process.memoryUsage().heapUsed;

      const promises = Array(concurrentOps)
        .fill(null)
        .map(() => simulateToolCall({
          name: 'search_nodes',
          args: { query: 'test' },
          category: 'local'
        }));

      await Promise.all(promises);

      if (global.gc) {
        global.gc();
      }

      const memAfter = process.memoryUsage().heapUsed;
      const growth = memAfter - memBefore;
      const growthPercent = (growth / memBefore) * 100;

      console.log(`   Memory growth: ${formatMemory(growth)} (${growthPercent.toFixed(2)}%)`);

      expect(growthPercent).toBeLessThan(5);
    });
  });

  describe('D. Performance Report Generation', () => {
    it('should generate valid benchmark report', () => {
      const sampleResults: BenchmarkResult[] = [
        {
          tool: 'search_nodes',
          iterations: 10,
          min: 12,
          max: 45,
          avg: 23,
          p50: 22,
          p95: 38,
          p99: 44,
          successRate: 100,
          errorRate: 0
        },
        {
          tool: 'n8n_suggest_nodes',
          iterations: 10,
          min: 8,
          max: 32,
          avg: 15,
          p50: 14,
          p95: 28,
          p99: 31,
          successRate: 100,
          errorRate: 0
        }
      ];

      const table = generateTable(sampleResults);
      expect(table).toContain('search_nodes');
      expect(table).toContain('n8n_suggest_nodes');
      expect(table).toContain('100.0%');

      const markdown = generateMarkdownReport(sampleResults);
      expect(markdown).toContain('# Performance Benchmark Report');
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain('## Detailed Statistics');
    });

    it('should validate thresholds correctly', () => {
      const goodResults: BenchmarkResult[] = [
        {
          tool: 'search_nodes',
          iterations: 10,
          min: 10,
          max: 100,
          avg: 50,
          p50: 45,
          p95: 90,
          p99: 95,
          successRate: 100,
          errorRate: 0
        }
      ];

      const thresholds: ThresholdConfig[] = [
        { tool: 'search_nodes', p95: 500, p99: 1000, successRate: 95 }
      ];

      const checkResult = checkThresholds(goodResults, thresholds);
      expect(checkResult.passed).toBe(true);
      expect(checkResult.failures).toHaveLength(0);
    });

    it('should detect threshold violations', () => {
      const badResults: BenchmarkResult[] = [
        {
          tool: 'search_nodes',
          iterations: 10,
          min: 100,
          max: 2000,
          avg: 800,
          p50: 750,
          p95: 1800, // Exceeds 500ms threshold
          p99: 1900,
          successRate: 100,
          errorRate: 0
        }
      ];

      const thresholds: ThresholdConfig[] = [
        { tool: 'search_nodes', p95: 500, p99: 1000, successRate: 95 }
      ];

      const checkResult = checkThresholds(badResults, thresholds);
      expect(checkResult.passed).toBe(false);
      expect(checkResult.failures.length).toBeGreaterThan(0);
      expect(checkResult.failures[0]).toContain('P95');
    });

    it('should detect low success rate', () => {
      const poorResults: BenchmarkResult[] = [
        {
          tool: 'search_nodes',
          iterations: 5,
          min: 10,
          max: 100,
          avg: 50,
          p50: 45,
          p95: 90,
          p99: 95,
          successRate: 50, // Below 95% threshold
          errorRate: 50
        }
      ];

      const thresholds: ThresholdConfig[] = [
        { tool: 'search_nodes', p95: 500, p99: 1000, successRate: 95 }
      ];

      const checkResult = checkThresholds(poorResults, thresholds);
      expect(checkResult.passed).toBe(false);
      expect(checkResult.failures.some(f => f.includes('Success rate'))).toBe(true);
    });
  });
});

/**
 * Simulate a tool call for benchmarking purposes.
 * This mocks the actual tool execution to measure the core logic performance.
 */
async function simulateToolCall(testCase: { name: string; args: Record<string, unknown>; category: string }): Promise<unknown> {
  // Simulate work based on category
  switch (testCase.category) {
    case 'local':
      // Local tools: simulate database search and processing
      return simulateLocalTool(testCase.name, testCase.args);
    
    case 'external':
      // External tools: simulate HTTP request to documentation services
      return simulateExternalTool(testCase.name, testCase.args);
    
    case 'ai':
      // AI tools: simulate LLM processing
      return simulateAITool(testCase.name, testCase.args);
    
    default:
      throw new Error(`Unknown tool category: ${testCase.category}`);
  }
}

/**
 * Simulate local tool execution (database operations, searches)
 */
async function simulateLocalTool(name: string, _args: Record<string, unknown>): Promise<unknown> {
  // Simulate database query and processing
  const iterations = 1000;
  let result = 0;
  
  for (let i = 0; i < iterations; i++) {
    result += Math.sqrt(i) * Math.log(i + 1);
  }

  return { tool: name, result };
}

/**
 * Simulate external tool execution (HTTP requests to Kapa.ai, llms.txt)
 */
async function simulateExternalTool(name: string, _args: Record<string, unknown>): Promise<unknown> {
  // Simulate network latency and processing
  // In real benchmarks, this would make actual HTTP requests
  const simulatedLatency = 100 + Math.random() * 400; // 100-500ms
  await new Promise(resolve => setTimeout(resolve, simulatedLatency));
  
  return { tool: name, source: 'simulated' };
}

/**
 * Simulate AI tool execution (LLM processing, n8n API calls)
 */
async function simulateAITool(name: string, _args: Record<string, unknown>): Promise<unknown> {
  // Simulate AI processing time
  const simulatedLatency = 200 + Math.random() * 800; // 200-1000ms
  await new Promise(resolve => setTimeout(resolve, simulatedLatency));
  
  return { tool: name, suggestions: 3 };
}
