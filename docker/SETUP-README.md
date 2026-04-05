# Docker Configuration for n8n MCP Server

This directory contains Docker configurations and setup scripts for running n8n instances for integration testing with the MCP server.

## 📁 Files

| File | Purpose |
|------|---------|
| `n8n-docker-compose.yml` | Docker Compose configuration for n8n |
| `setup-n8n-api.sh` | Automated script to verify n8n and guide API key setup |
| `docker-entrypoint.sh` | Custom entrypoint for MCP server Docker image |
| `parse-config.js` | Configuration parser for Docker environment |
| `n8n-mcp` | Alpine init script for MCP server in Docker |
| `README.md` | This file |

## 🚀 Quick Start

### Option 1: Native n8n (Current Setup)

The current development environment uses n8n running natively on the host:

```bash
# n8n is already running at http://localhost:5678
# Started with: n8n start
# Process: PID 1314

# Verify it's running:
curl http://localhost:5678/healthz
# Expected: {"status":"ok"}
```

**Advantages:**
- Faster startup
- Easier debugging
- Direct file access to ~/.n8n
- No Docker overhead

### Option 2: Docker Compose (Reproducible)

Use this for clean environments or CI/CD:

```bash
# Start n8n in Docker
docker compose -f n8n-docker-compose.yml up -d

# Check status
docker compose -f n8n-docker-compose.yml ps

# View logs
docker compose -f n8n-docker-compose.yml logs -f

# Stop
docker compose -f n8n-docker-compose.yml down

# Stop and remove data
docker compose -f n8n-docker-compose.yml down -v
```

**Volume:** `n8n_data` persists data across container restarts.

## 🔑 API Key Setup

The MCP server requires an n8n API key for integration tests.

### One-Time Setup

1. **Access n8n UI**: Open http://localhost:5678 in your browser
2. **Create Owner Account**: Complete the initial setup wizard
   - Email: admin@localhost (or your preference)
   - Password: Choose a strong password
3. **Generate API Key**:
   - Go to **Settings** (gear icon in sidebar)
   - Click **API Keys**
   - Click **Create API Key**
   - Give it a name (e.g., "MCP Server Dev")
   - Copy the generated key (starts with `n8n_api_`)
4. **Update .env.local**:
   ```bash
   # Edit the file
   nano .env.local
   
   # Add/update these lines:
   N8N_API_URL=http://localhost:5678
   N8N_API_KEY=n8n_api_your-actual-key-here
   ```

### Verify API Key

```bash
# Test the API key
curl -H "X-N8N-API-KEY: n8n_api_your-key" http://localhost:5678/api/v1/credentials

# Expected: {"data":[],"nextCursor":null}
```

## 🧪 Integration Testing

Once the API key is configured, run integration tests:

```bash
# Run all tests (unit + integration)
npm test

# Run integration tests only
npm run test:integration

# Run with coverage
npm run test:coverage
```

### Test Webhook Setup

Some integration tests require pre-activated webhook workflows:

1. **Create 4 workflows in n8n UI**:
   - Each with a single Webhook node
   - Paths: `mcp-test-get`, `mcp-test-post`, `mcp-test-put`, `mcp-test-delete`
   - Methods: GET, POST, PUT, DELETE respectively

2. **Activate each workflow** (toggle switch in top-right)

3. **Copy Workflow IDs** from the URL or workflow settings

4. **Update .env.local**:
   ```bash
   N8N_TEST_WEBHOOK_GET_ID=your-workflow-id
   N8N_TEST_WEBHOOK_POST_ID=your-workflow-id
   N8N_TEST_WEBHOOK_PUT_ID=your-workflow-id
   N8N_TEST_WEBHOOK_DELETE_ID=your-workflow-id
   ```

## 🔧 Troubleshooting

### n8n Won't Start

```bash
# Check if port 5678 is in use
ss -tlnp | grep 5678

# If another process is using it, either:
# 1. Kill the process: kill <PID>
# 2. Or change n8n port: N8N_PORT=5679 n8n start
```

### Docker Container Fails to Start

```bash
# Check logs
docker logs n8n

# Common issues:
# - Port already in use: Change port in docker-compose.yml
# - Permission denied: chown -R 1000:1000 ~/.n8n
# - Out of disk: docker system prune -a
```

### API Returns 401

```bash
# Verify API key is set
grep N8N_API_KEY .env.local

# Test API key
curl -H "X-N8N-API-KEY: your-key" http://localhost:5678/api/v1/workflows

# Regenerate key if needed: Settings > API Keys > Delete & recreate
```

### Database Corruption

```bash
# Reset n8n database (WARNING: deletes all workflows/credentials)
n8n user-management:reset

# Or with Docker:
docker compose -f n8n-docker-compose.yml down -v
docker compose -f n8n-docker-compose.yml up -d
```

## 📊 Environment Variables

### n8n Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `N8N_PORT` | 5678 | Port for n8n web UI and API |
| `N8N_PROTOCOL` | http | http or https |
| `N8N_SECURE_COOKIE` | false | Set to true for HTTPS |
| `GENERIC_TIMEZONE` | America/Sao_Paulo | Default timezone |
| `TZ` | America/Sao_Paulo | System timezone |

### MCP Server Configuration

| Variable | Description |
|----------|-------------|
| `N8N_API_URL` | URL of n8n instance (http://localhost:5678) |
| `N8N_API_KEY` | API key created via n8n UI |

## 🔒 Security Notes

**For Development Only:**
- `N8N_SECURE_COOKIE=false` allows HTTP
- No authentication enforced for local testing

**For Production:**
- Remove `N8N_SECURE_COOKIE=false`
- Set `N8N_PROTOCOL=https`
- Use strong encryption key
- Enable authentication
- Set proper CORS origins
- Use reverse proxy (nginx/traefik)

## 📚 References

- [n8n API Documentation](https://docs.n8n.io/api/)
- [n8n Docker Setup](https://docs.n8n.io/hosting/docker/)
- [MCP Server Documentation](https://docs.n8n.io/hosting/mcp-server/)
- [Integration Testing Guide](../tests/integration/README.md)

---

**Last Updated:** 05 Apr 2026  
**Maintained By:** mcp-n8n-automation team
