/**
 * Performance Report Generator
 * 
 * Generates human-readable reports from benchmark results
 * and validates against configurable thresholds.
 */

export interface BenchmarkResult {
  tool: string;
  iterations: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  successRate: number;
  errorRate: number;
}

export interface ThresholdConfig {
  tool: string;
  p95: number;
  p99: number;
  successRate: number;
}

export interface ThresholdCheckResult {
  passed: boolean;
  failures: string[];
  warnings: string[];
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Format milliseconds for display
 */
export function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Generate console table from benchmark results
 */
export function generateTable(results: BenchmarkResult[]): string {
  const headers = ['Tool', 'Iterations', 'Min', 'Max', 'Avg', 'P50', 'P95', 'P99', 'Success %'];
  
  const rows = results.map(r => [
    r.tool,
    r.iterations.toString(),
    formatMs(r.min),
    formatMs(r.max),
    formatMs(r.avg),
    formatMs(r.p50),
    formatMs(r.p95),
    formatMs(r.p99),
    `${r.successRate.toFixed(1)}%`
  ]);

  return renderTable(headers, rows);
}

/**
 * Generate detailed markdown report
 */
export function generateMarkdownReport(results: BenchmarkResult[]): string {
  let report = '# Performance Benchmark Report\n\n';
  report += `Generated: ${new Date().toISOString()}\n\n`;
  
  // Summary table
  report += '## Summary\n\n';
  report += '| Tool | Iterations | Min | Max | Avg | P50 | P95 | P99 | Success % |\n';
  report += '|------|-----------|-----|-----|-----|-----|-----|-----|-----------|\n';
  
  results.forEach(r => {
    report += `| ${r.tool} | ${r.iterations} | ${formatMs(r.min)} | ${formatMs(r.max)} | ${formatMs(r.avg)} | ${formatMs(r.p50)} | ${formatMs(r.p95)} | ${formatMs(r.p99)} | ${r.successRate.toFixed(1)}% |\n`;
  });

  // Detailed statistics
  report += '\n## Detailed Statistics\n\n';
  
  results.forEach(r => {
    report += `### ${r.tool}\n\n`;
    report += `- **Iterations:** ${r.iterations}\n`;
    report += `- **Min:** ${formatMs(r.min)}\n`;
    report += `- **Max:** ${formatMs(r.max)}\n`;
    report += `- **Average:** ${formatMs(r.avg)}\n`;
    report += `- **P50:** ${formatMs(r.p50)}\n`;
    report += `- **P95:** ${formatMs(r.p95)}\n`;
    report += `- **P99:** ${formatMs(r.p99)}\n`;
    report += `- **Success Rate:** ${r.successRate.toFixed(1)}%\n`;
    report += `- **Error Rate:** ${r.errorRate.toFixed(1)}%\n\n`;
  });

  return report;
}

/**
 * Check results against threshold configuration
 */
export function checkThresholds(
  results: BenchmarkResult[],
  thresholds: ThresholdConfig[]
): ThresholdCheckResult {
  const failures: string[] = [];
  const warnings: string[] = [];

  results.forEach(result => {
    const threshold = thresholds.find(t => t.tool === result.tool);
    
    if (!threshold) {
      warnings.push(`No threshold configured for ${result.tool}`);
      return;
    }

    if (result.p95 > threshold.p95) {
      failures.push(
        `${result.tool}: P95 ${formatMs(result.p95)} exceeds threshold ${formatMs(threshold.p95)}`
      );
    }

    if (result.p99 > threshold.p99) {
      failures.push(
        `${result.tool}: P99 ${formatMs(result.p99)} exceeds threshold ${formatMs(threshold.p99)}`
      );
    }

    if (result.successRate < threshold.successRate) {
      failures.push(
        `${result.tool}: Success rate ${result.successRate.toFixed(1)}% below threshold ${threshold.successRate}%`
      );
    }
  });

  return {
    passed: failures.length === 0,
    failures,
    warnings
  };
}

/**
 * Generate default thresholds from environment variables or sensible defaults
 */
export function getDefaultThresholds(): ThresholdConfig[] {
  const parseMs = (envVar: string, defaultValue: number): number => {
    const value = process.env[envVar];
    if (!value) return defaultValue;
    return parseFloat(value);
  };

  return [
    {
      tool: 'search_nodes',
      p95: parseMs('BENCH_THRESHOLD_SEARCH_NODES_P95', 500),
      p99: parseMs('BENCH_THRESHOLD_SEARCH_NODES_P99', 1000),
      successRate: parseMs('BENCH_THRESHOLD_SEARCH_NODES_SUCCESS', 95)
    },
    {
      tool: 'n8n_suggest_nodes',
      p95: parseMs('BENCH_THRESHOLD_SUGGEST_NODES_P95', 500),
      p99: parseMs('BENCH_THRESHOLD_SUGGEST_NODES_P99', 1000),
      successRate: parseMs('BENCH_THRESHOLD_SUGGEST_NODES_SUCCESS', 95)
    },
    {
      tool: 'n8n_search_external_docs',
      p95: parseMs('BENCH_THRESHOLD_EXTERNAL_DOCS_P95', 5000),
      p99: parseMs('BENCH_THRESHOLD_EXTERNAL_DOCS_P99', 10000),
      successRate: parseMs('BENCH_THRESHOLD_EXTERNAL_DOCS_SUCCESS', 80)
    },
    {
      tool: 'n8n_search_kapa_ai',
      p95: parseMs('BENCH_THRESHOLD_KAPA_AI_P95', 5000),
      p99: parseMs('BENCH_THRESHOLD_KAPA_AI_P99', 10000),
      successRate: parseMs('BENCH_THRESHOLD_KAPA_AI_SUCCESS', 80)
    },
    {
      tool: 'n8n_search_llms_txt',
      p95: parseMs('BENCH_THRESHOLD_LLMS_TXT_P95', 5000),
      p99: parseMs('BENCH_THRESHOLD_LLMS_TXT_P99', 10000),
      successRate: parseMs('BENCH_THRESHOLD_LLMS_TXT_SUCCESS', 80)
    }
  ];
}

/**
 * Render ASCII table for console output
 */
function renderTable(headers: string[], rows: string[][]): string {
  // Calculate column widths
  const colWidths = headers.map((h, i) => {
    const maxWidth = Math.max(
      h.length,
      ...rows.map(r => r[i]?.length || 0)
    );
    return Math.min(maxWidth, 20); // Cap at 20 chars
  });

  const pad = (str: string, width: number): string => {
    if (str.length > width) return str.substring(0, width - 1) + '…';
    return str.padEnd(width);
  };

  // Build table
  const border = `┌${colWidths.map(w => '─'.repeat(w + 2)).join('┬')}┐`;
  const headerRow = `│ ${headers.map((h, i) => pad(h, colWidths[i])).join(' │ ')} │`;
  const separator = `├${colWidths.map(w => '─'.repeat(w + 2)).join('┼')}┤`;
  
  const dataRows = rows.map(
    row => `│ ${row.map((cell, i) => pad(cell, colWidths[i])).join(' │ ')} │`
  );
  const footer = `└${colWidths.map(w => '─'.repeat(w + 2)).join('┴')}┘`;

  return [border, headerRow, separator, ...dataRows, footer].join('\n');
}

/**
 * Calculate statistics from raw measurements
 */
export function calculateStats(tool: string, measurements: number[], totalAttempts: number): BenchmarkResult {
  if (measurements.length === 0) {
    return {
      tool,
      iterations: 0,
      min: 0,
      max: 0,
      avg: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      successRate: 0,
      errorRate: 100
    };
  }

  const sorted = [...measurements].sort((a, b) => a - b);
  const total = measurements.reduce((sum, m) => sum + m, 0);
  const successCount = measurements.length;
  const errorCount = totalAttempts - successCount;

  return {
    tool,
    iterations: successCount,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: total / successCount,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    successRate: (successCount / totalAttempts) * 100,
    errorRate: (errorCount / totalAttempts) * 100
  };
}
