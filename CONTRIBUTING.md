# Contributing to n8n-MCP

Thank you for your interest in contributing! This guide covers how to contribute to the project.

## Table of Contents

- [Development Setup](#development-setup)
- [Commit Message Convention](#commit-message-convention)
- [Adding New MCP Tools](#adding-new-mcp-tools)
- [Testing Standards](#testing-standards)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)

---

## Development Setup

### Prerequisites

- **Node.js 22+** (or any version — automatic fallback if needed)
- **npm** or **yarn**
- **Git**

### Quick Start

```bash
# 1. Fork and clone
git clone https://github.com/YOUR-USERNAME/n8n-mcp.git
cd n8n-mcp

# 2. Add upstream remote
git remote add upstream https://github.com/czlonkowski/n8n-mcp.git

# 3. Install dependencies
npm install

# 4. Build
npm run build

# 5. Run tests
npm test

# 6. Start dev server
npm run dev:http
```

### Useful Commands

```bash
npm run build          # Compile TypeScript
npm test               # Run all tests
npm run test:coverage  # Tests with coverage report
npm run lint           # Type check (tsc --noEmit)
npm audit              # Check dependency vulnerabilities
npm run rebuild        # Rebuild node database
```

---

## Commit Message Convention

We use **Conventional Commits**. Every commit message must follow this format:

```
<type>: <description>

[optional body]
```

### Types

| Type | When to Use |
|------|-------------|
| `feat` | New feature or MCP tool |
| `fix` | Bug fix or code review fix |
| `docs` | Documentation changes |
| `test` | Adding or modifying tests |
| `chore` | Maintenance tasks, dependencies |
| `security` | Security-related changes |
| `perf` | Performance improvements |

### Examples

```bash
feat: add n8n_list_tags and n8n_create_tag MCP tools
fix: add Zod validation to all new handlers
docs: update README with custom extensions section
test: add schema validation tests for variables tools
chore: update dependencies
security: remove secret values from variable responses
```

---

## Adding New MCP Tools

Adding a new MCP tool requires changes in **5 locations**:

### 1. Tool Schema Definition

Create or update a tool definition file in `src/mcp/tools-*.ts`:

```typescript
import { ToolDefinition } from '../types';

export const n8nMyNewTool: ToolDefinition = {
  name: 'n8n_my_new_tool',
  description: 'Description of what this tool does.',
  inputSchema: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: 'Description of param1',
      },
    },
    required: ['param1'],
    additionalProperties: false,
  },
};

export const myCustomTools = [n8nMyNewTool];
```

### 2. Handler Implementation

Add a handler function in `src/mcp/handlers-n8n-manager.ts`:

```typescript
// Use Zod for input validation!
const myNewToolSchema = z.object({
  param1: z.string().min(1),
});

export async function handleMyNewTool(args: unknown, context?: InstanceContext): Promise<McpToolResponse> {
  const parsed = myNewToolSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  const { param1 } = parsed.data;
  const client = ensureApiConfigured(context);

  try {
    const result = await client.someApiCall(param1);
    return {
      success: true,
      message: `Successfully did something: ${result.name}`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to do something: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
```

### 3. Register in Server

In `src/mcp/server.ts`:
- Import the tool array
- Add to `allTools` spread array
- Add switch case in the tool call handler

```typescript
// Import
import { myCustomTools } from './tools-my-custom';

// In allTools array
const allTools = [...existingTools, ...myCustomTools];

// In switch statement
case 'n8n_my_new_tool':
  return n8nHandlers.handleMyNewTool(args, this.instanceContext);
```

### 4. Tool Documentation

Create documentation in `src/mcp/tool-docs/my_category/`:
- `index.ts` — exports
- `n8n-my-new-tool.ts` — `ToolDocumentation` with essentials and full sections

Register in `src/mcp/tool-docs/index.ts`.

### 5. Tests

Create a test file in `tests/unit/mcp/handlers-*.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { n8nMyNewTool } from '@/mcp/tools-my-custom';

describe('n8n_my_new_tool', () => {
  it('should have correct tool name', () => {
    expect(n8nMyNewTool.name).toBe('n8n_my_new_tool');
  });

  it('should require param1 parameter', () => {
    expect(n8nMyNewTool.inputSchema.required).toContain('param1');
  });
});
```

---

## Testing Standards

### Requirements

- **Coverage**: ≥ 80% for all new code
- **Pattern**: Arrange → Act → Assert
- **Framework**: Vitest

### What to Test

1. **Schema validation** — required params, types, constraints
2. **Success path** — handler returns correct response on valid input
3. **Error path** — handler returns error on invalid input or API failure
4. **Edge cases** — empty values, missing optional params, API unavailability

### Running Tests

```bash
npm test                    # All tests
npm test -- --coverage      # With coverage
npm test -- path/to/test    # Specific file
```

---

## Pull Request Process

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feat/my-new-feature
   ```

2. **Make your changes** following the [Adding New MCP Tools](#adding-new-mcp-tools) guide.

3. **Ensure tests pass**:
   ```bash
   npm test
   npm run build
   ```

4. **Commit with Conventional Commits**:
   ```bash
   git add -A
   git commit -m "feat: add n8n_my_new_tool MCP tool"
   ```

5. **Push and create PR**:
   ```bash
   git push origin feat/my-new-feature
   ```

6. **PR Description** should include:
   - What was changed
   - Why the change was needed
   - How to test the changes
   - Screenshots/examples if applicable

### PR Review Checklist

- [ ] All tests passing
- [ ] Build succeeds (`npm run build`)
- [ ] No lint errors (`npm run lint`)
- [ ] No `any` types used
- [ ] Zod validation on all new handlers
- [ ] Error responses use `error` field (not `message`)
- [ ] No secrets or credentials in responses
- [ ] Documentation updated
- [ ] Commit messages follow convention

---

## Code Style

### TypeScript

- **Strict mode** enabled — no implicit `any`
- **ESM imports** only — no CommonJS `require()`
- **Zod validation** for all tool inputs
- **Custom error classes** for error handling

### Naming

| Artifact | Convention | Example |
|----------|-----------|---------|
| Files | `kebab-case` | `tools-tags.ts` |
| Classes | `PascalCase` | `N8nApiClient` |
| Functions | `camelCase` | `handleListTags` |
| Constants | `UPPER_SNAKE_CASE` | `N8N_BASE_URL` |
| MCP tools | `snake_case` | `n8n_list_tags` |

### Formatting

- 2-space indentation
- Single quotes for strings
- Semicolons required
- Max line length: 100 characters
- Trailing commas in multi-line objects

### Error Handling

```typescript
// ✅ GOOD — sanitized logs, proper error response
try {
  const result = await client.doSomething();
  return { success: true, message: `Success: ${result.name}` };
} catch (error) {
  // Never log error.config — it may contain API keys!
  return {
    success: false,
    error: `Failed: ${error instanceof Error ? error.message : String(error)}`,
  };
}
```

---

## Questions?

- Check existing issues: https://github.com/czlonkowski/n8n-mcp/issues
- Security concerns: See [SECURITY.md](./SECURITY.md)
- Architecture questions: See [AGENTS.md](./AGENTS.md)

Thank you for contributing! 🎉
