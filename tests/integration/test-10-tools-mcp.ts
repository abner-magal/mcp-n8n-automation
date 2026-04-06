/**
 * Integration Test: 10 MCP Tools via n8n API
 * Tests all tools that were failing integration due to missing API key
 */

import { spawn } from 'node:child_process';

const MCP_SERVER = '/home/bn/Documentos/Folders/Tool/automation/n8n/flow-create-n8n/mcp-n8n-automation/dist/mcp/index.js';

interface TestResult {
  tool: string;
  success: boolean;
  error?: string;
  data?: unknown;
}

const results: TestResult[] = [];

// Valid n8n workflow structure
function createTestWorkflow(name: string) {
  return {
    name,
    nodes: [
      {
        id: 'webhook-node',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [240, 300],
        parameters: {
          httpMethod: 'POST',
          path: 'test-integration',
          responseMode: 'onReceived',
          options: {},
        },
      },
      {
        id: 'set-node',
        name: 'Set',
        type: 'n8n-nodes-base.set',
        typeVersion: 3.4,
        position: [500, 300],
        parameters: {
          options: {},
          values: {
            string: [{ name: 'status', value: 'test' }],
          },
        },
      },
    ],
    connections: {
      Webhook: {
        main: [[{ node: 'Set', type: 'main', index: 0 }]],
      },
    },
    settings: {
      saveExecutionData: false,
      saveManualExecutions: false,
    },
    tags: [],
    pinData: {},
  };
}

async function callMCPTool(
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs = 15000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'node',
      [MCP_SERVER],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          MCP_MODE: 'stdio',
          N8N_API_URL: 'http://localhost:5678',
          N8N_API_KEY:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjZGMxNDhiYi0yZGQ0LTQ3ZDItYjVkZi0yMjZiZGU1ZDU1NDMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMzZmOGEwYTgtMzcwNS00NTRiLWJjODItNWQyNzYxYzJhOTVlIiwiaWF0IjoxNzc1MDc5ODg3fQ.WAjGEW-DrXU2FaNOKx7S3tprtB0rhVC8qmtONKNi8Uo',
        },
      },
    );

    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    // Send initialize
    const initMsg =
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'integration-test', version: '1.0.0' },
        },
      }) + '\n';

    // Send tool call
    const toolMsg =
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }) + '\n';

    child.stdin.write(initMsg);
    setTimeout(() => {
      child.stdin.write(toolMsg);
      child.stdin.end();
    }, 300);

    child.on('close', () => {
      try {
        // Find the tool response (second JSON-RPC response, id: 2)
        const lines = output
          .trim()
          .split('\n')
          .filter((l) => l.startsWith('{'));
        const toolResponse = lines.find((l) => {
          try {
            const parsed = JSON.parse(l);
            return parsed.id === 2;
          } catch {
            return false;
          }
        });
        if (toolResponse) {
          resolve(JSON.parse(toolResponse));
        } else {
          resolve({ error: 'No tool response found', raw: output.substring(0, 300) });
        }
      } catch (e) {
        resolve({ error: 'Parse error', raw: output.substring(0, 300) });
      }
    });

    // Timeout
    setTimeout(() => {
      child.kill();
      resolve({ error: `Timeout (${timeoutMs}ms)` });
    }, timeoutMs);
  });
}

function parseToolContent(result: any): { success: boolean; data?: any; error?: string } {
  if (result.error) return { success: false, error: result.error };
  if (!result.result?.content) return { success: false, error: 'No content' };

  const textContent = result.result.content.find((c: any) => c.type === 'text')?.text || '';
  try {
    return JSON.parse(textContent);
  } catch {
    return { success: false, error: textContent.substring(0, 200) };
  }
}

function extractWorkflowId(result: any): string | null {
  const parsed = parseToolContent(result);
  if (parsed.data?.id) return parsed.data.id;
  if (parsed.data?.workflowId) return parsed.data.workflowId;

  // Try to extract from text
  const textContent = result.result?.content?.find((c: any) => c.type === 'text')?.text || '';
  const match = textContent.match(/"id":\s*"([^"]+)"/);
  return match ? match[1] : null;
}

async function runTests() {
  console.log('🧪 Testing 10 MCP Tools via n8n-mcp Integration\n');
  console.log('='.repeat(70));

  let workflowId: string | null = null;

  // Test 1: n8n_list_workflows
  console.log('\n[Test 1] n8n_list_workflows');
  const listResult = await callMCPTool('n8n_list_workflows', {});
  const listParsed = parseToolContent(listResult);
  console.log('Status:', listParsed.success ? '✅ PASS' : '❌ FAIL');
  console.log('Data:', JSON.stringify(listParsed).substring(0, 150));
  results.push({ tool: 'n8n_list_workflows', success: listParsed.success, data: listParsed });

  // Test 2: n8n_create_workflow
  console.log('\n[Test 2] n8n_create_workflow');
  const testWorkflow = createTestWorkflow('[TEST] Integration Test Workflow');
  const createResult = await callMCPTool('n8n_create_workflow', {
    name: testWorkflow.name,
    nodes: testWorkflow.nodes,
    connections: testWorkflow.connections,
    settings: testWorkflow.settings,
  });
  const createParsed = parseToolContent(createResult);
  workflowId = extractWorkflowId(createResult);
  console.log('Status:', createParsed.success ? '✅ PASS' : '❌ FAIL');
  console.log('Workflow ID:', workflowId || 'NOT CREATED');
  console.log('Data:', JSON.stringify(createParsed).substring(0, 150));
  results.push({ tool: 'n8n_create_workflow', success: createParsed.success, data: createParsed });

  // Test 3: n8n_get_workflow
  console.log('\n[Test 3] n8n_get_workflow');
  if (workflowId) {
    const getResult = await callMCPTool('n8n_get_workflow', { workflowId });
    const getParsed = parseToolContent(getResult);
    console.log('Status:', getParsed.success ? '✅ PASS' : '❌ FAIL');
    results.push({ tool: 'n8n_get_workflow', success: getParsed.success, data: getParsed });
  } else {
    console.log('⏭️ Skipped (no workflowId)');
    results.push({ tool: 'n8n_get_workflow', success: false, error: 'Skipped - no workflowId' });
  }

  // Test 4: n8n_update_full_workflow
  console.log('\n[Test 4] n8n_update_full_workflow');
  if (workflowId) {
    const updateWorkflow = createTestWorkflow('[TEST] Updated Integration Test');
    const updateResult = await callMCPTool('n8n_update_full_workflow', {
      workflowId,
      name: updateWorkflow.name,
      nodes: updateWorkflow.nodes,
      connections: updateWorkflow.connections,
    });
    const updateParsed = parseToolContent(updateResult);
    console.log('Status:', updateParsed.success ? '✅ PASS' : '❌ FAIL');
    results.push({ tool: 'n8n_update_full_workflow', success: updateParsed.success, data: updateParsed });
  } else {
    console.log('⏭️ Skipped (no workflowId)');
    results.push({ tool: 'n8n_update_full_workflow', success: false, error: 'Skipped - no workflowId' });
  }

  // Test 5: n8n_validate_workflow
  console.log('\n[Test 5] n8n_validate_workflow');
  if (workflowId) {
    const validateResult = await callMCPTool('n8n_validate_workflow', { workflowId });
    const validateParsed = parseToolContent(validateResult);
    console.log('Status:', validateParsed.success ? '✅ PASS' : '❌ FAIL');
    results.push({ tool: 'n8n_validate_workflow', success: validateParsed.success, data: validateParsed });
  } else {
    console.log('⏭️ Skipped (no workflowId)');
    results.push({ tool: 'n8n_validate_workflow', success: false, error: 'Skipped - no workflowId' });
  }

  // Test 6: n8n_autofix_workflow
  console.log('\n[Test 6] n8n_autofix_workflow');
  if (workflowId) {
    const autofixResult = await callMCPTool('n8n_autofix_workflow', { workflowId });
    const autofixParsed = parseToolContent(autofixResult);
    console.log('Status:', autofixParsed.success ? '✅ PASS' : '❌ FAIL');
    results.push({ tool: 'n8n_autofix_workflow', success: autofixParsed.success, data: autofixParsed });
  } else {
    console.log('⏭️ Skipped (no workflowId)');
    results.push({ tool: 'n8n_autofix_workflow', success: false, error: 'Skipped - no workflowId' });
  }

  // Test 7: n8n_executions
  console.log('\n[Test 7] n8n_executions');
  const execResult = await callMCPTool('n8n_executions', { action: 'list', workflowId: workflowId || undefined, limit: 5 });
  const execParsed = parseToolContent(execResult);
  console.log('Status:', execParsed.success ? '✅ PASS' : '❌ FAIL');
  results.push({ tool: 'n8n_executions', success: execParsed.success, data: execParsed });

  // Test 8: n8n_update_partial_workflow
  console.log('\n[Test 8] n8n_update_partial_workflow');
  if (workflowId) {
    const partialResult = await callMCPTool('n8n_update_partial_workflow', {
      workflowId,
      operations: [
        {
          op: 'addNode',
          node: {
            id: 'debug-node',
            name: 'Debug',
            type: 'n8n-nodes-base.noOp',
            typeVersion: 1,
            position: [760, 300],
            parameters: {},
          },
        },
      ],
    });
    const partialParsed = parseToolContent(partialResult);
    console.log('Status:', partialParsed.success ? '✅ PASS' : '❌ FAIL');
    results.push({ tool: 'n8n_update_partial_workflow', success: partialParsed.success, data: partialParsed });
  } else {
    console.log('⏭️ Skipped (no workflowId)');
    results.push({ tool: 'n8n_update_partial_workflow', success: false, error: 'Skipped - no workflowId' });
  }

  // Test 9: n8n_suggest_nodes
  console.log('\n[Test 9] n8n_suggest_nodes');
  const suggestResult = await callMCPTool('n8n_suggest_nodes', {
    existingNodes: ['n8n-nodes-base.webhook', 'n8n-nodes-base.httpRequest'],
    taskDescription: 'Send email when webhook receives data',
  });
  const suggestParsed = parseToolContent(suggestResult);
  console.log('Status:', suggestParsed.success ? '✅ PASS' : '❌ FAIL');
  results.push({ tool: 'n8n_suggest_nodes', success: suggestParsed.success, data: suggestParsed });

  // Test 10: n8n_delete_workflow
  console.log('\n[Test 10] n8n_delete_workflow');
  if (workflowId) {
    const deleteResult = await callMCPTool('n8n_delete_workflow', { workflowId });
    const deleteParsed = parseToolContent(deleteResult);
    console.log('Status:', deleteParsed.success ? '✅ PASS' : '❌ FAIL');
    results.push({ tool: 'n8n_delete_workflow', success: deleteParsed.success, data: deleteParsed });
  } else {
    console.log('⏭️ Skipped (no workflowId)');
    results.push({ tool: 'n8n_delete_workflow', success: false, error: 'Skipped - no workflowId' });
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(70));

  const passCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  console.log(`\nTotal: ${results.length} tests`);
  console.log(`✅ Pass: ${passCount}`);
  console.log(`❌ Fail: ${failCount}`);

  console.log('\nDetailed Results:');
  results.forEach((r, i) => {
    const status = r.success ? '✅' : '❌';
    console.log(`${status} [${i + 1}] ${r.tool}${r.error ? ` — ${r.error}` : ''}`);
  });

  if (failCount > 0) {
    console.log('\n⚠️ Some tests failed. Check errors above.');
  } else {
    console.log('\n🎉 All 10 integration tests passed!');
  }

  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
