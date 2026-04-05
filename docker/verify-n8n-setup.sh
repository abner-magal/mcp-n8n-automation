#!/bin/bash
# verify-n8n-setup.sh
# Comprehensive verification of n8n Docker/setup configuration
#
# Usage: bash docker/verify-n8n-setup.sh

# Don't exit on error - we want to check everything
# set -e  # DISABLED

N8N_URL="http://localhost:5678"
ENV_FILE=".env.local"
PASS=0
FAIL=0
WARN=0

echo "═══════════════════════════════════════════════════════"
echo "  n8n Setup Verification Report"
echo "  Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════"
echo ""

# 1. Check n8n process
echo "1️⃣  Checking n8n process..."
if ps aux | grep -v grep | grep -q "n8n start"; then
  PID=$(ps aux | grep -v grep | grep "n8n start" | awk '{print $2}')
  echo "   ✅ n8n is running (PID: $PID)"
  PASS=$((PASS + 1))
else
  echo "   ❌ n8n process not found"
  FAIL=$((FAIL + 1))
fi
echo ""

# 2. Check health endpoint
echo "2️⃣  Checking n8n health endpoint..."
HEALTH=$(curl -s --max-time 5 "$N8N_URL/healthz" 2>/dev/null || echo "FAILED")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo "   ✅ Health check passed: $HEALTH"
  PASS=$((PASS + 1))
else
  echo "   ❌ Health check failed: $HEALTH"
  FAIL=$((FAIL + 1))
fi
echo ""

# 3. Check port binding
echo "3️⃣  Checking port 5678..."
if ss -tlnp 2>/dev/null | grep -q ":5678"; then
  echo "   ✅ Port 5678 is bound"
  PASS=$((PASS + 1))
else
  echo "   ❌ Port 5678 is not bound"
  FAIL=$((FAIL + 1))
fi
echo ""

# 4. Check .env.local exists
echo "4️⃣  Checking .env.local..."
if [ -f "$ENV_FILE" ]; then
  echo "   ✅ .env.local exists"
  PASS=$((PASS + 1))
else
  echo "   ❌ .env.local not found"
  FAIL=$((FAIL + 1))
fi
echo ""

# 5. Check N8N_API_URL configuration
echo "5️⃣  Checking N8N_API_URL..."
if grep -q "^N8N_API_URL=" "$ENV_FILE" 2>/dev/null; then
  API_URL=$(grep "^N8N_API_URL=" "$ENV_FILE" | cut -d'=' -f2-)
  echo "   ✅ N8N_API_URL configured: $API_URL"
  PASS=$((PASS + 1))
else
  echo "   ⚠️  N8N_API_URL not set in .env.local"
  WARN=$((WARN + 1))
fi
echo ""

# 6. Check N8N_API_KEY configuration
echo "6️⃣  Checking N8N_API_KEY..."
if grep -q "^N8N_API_KEY=." "$ENV_FILE" 2>/dev/null; then
  echo "   ✅ N8N_API_KEY is configured"
  PASS=$((PASS + 1))
else
  echo "   ⚠️  N8N_API_KEY not set (required for integration tests)"
  echo "      → Create via: Settings > API Keys in n8n UI"
  WARN=$((WARN + 1))
fi
echo ""

# 7. Check Docker availability
echo "7️⃣  Checking Docker..."
if command -v docker &>/dev/null; then
  DOCKER_VERSION=$(docker --version | awk '{print $3}')
  echo "   ✅ Docker available: $DOCKER_VERSION"
  PASS=$((PASS + 1))
else
  echo "   ⚠️  Docker not found (optional for native setup)"
  WARN=$((WARN + 1))
fi
echo ""

# 8. Check Docker Compose file
echo "8️⃣  Checking Docker Compose config..."
if [ -f "docker/n8n-docker-compose.yml" ]; then
  echo "   ✅ docker/n8n-docker-compose.yml exists"
  PASS=$((PASS + 1))
else
  echo "   ❌ docker/n8n-docker-compose.yml not found"
  FAIL=$((FAIL + 1))
fi
echo ""

# 9. Check setup script
echo "9️⃣  Checking setup script..."
if [ -x "docker/setup-n8n-api.sh" ]; then
  echo "   ✅ docker/setup-n8n-api.sh exists and is executable"
  PASS=$((PASS + 1))
else
  echo "   ⚠️  docker/setup-n8n-api.sh not found or not executable"
  WARN=$((WARN + 1))
fi
echo ""

# 10. Check Node.js version
echo "🔟  Checking Node.js..."
if command -v node &>/dev/null; then
  NODE_VERSION=$(node --version)
  if echo "$NODE_VERSION" | grep -q "v22"; then
    echo "   ✅ Node.js: $NODE_VERSION (correct)"
    PASS=$((PASS + 1))
  else
    echo "   ⚠️  Node.js: $NODE_VERSION (expected v22.x)"
    WARN=$((WARN + 1))
  fi
else
  echo "   ❌ Node.js not found"
  FAIL=$((FAIL + 1))
fi
echo ""

# 11. Check build status
echo "1️⃣1️⃣  Checking build status..."
if [ -d "dist" ] && [ -f "dist/index.js" ]; then
  echo "   ✅ dist/ directory exists (project built)"
  PASS=$((PASS + 1))
else
  echo "   ⚠️  dist/ not found (run: npm run build)"
  WARN=$((WARN + 1))
fi
echo ""

# 12. Check database
echo "1️⃣2️⃣  Checking node database..."
if [ -f "data/nodes.db" ]; then
  DB_SIZE=$(du -sh data/nodes.db 2>/dev/null | awk '{print $1}')
  echo "   ✅ data/nodes.db exists ($DB_SIZE)"
  PASS=$((PASS + 1))
else
  echo "   ⚠️  data/nodes.db not found (will be created on first run)"
  WARN=$((WARN + 1))
fi
echo ""

# Summary
echo "═══════════════════════════════════════════════════════"
echo "  Verification Summary"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  ✅ Passed: $PASS"
echo "  ⚠️  Warnings: $WARN"
echo "  ❌ Failed: $FAIL"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "  🎉 Overall Status: READY FOR DEVELOPMENT"
  echo ""
  if [ $WARN -gt 0 ]; then
    echo "  ⚠️  Action Items:"
    echo "     - Create API key via n8n UI (Settings > API Keys)"
    echo "     - Update .env.local with N8N_API_KEY"
    echo ""
  fi
  echo "  📝 Next Steps:"
  echo "     1. Complete API key setup (see warnings above)"
  echo "     2. Run integration tests: npm run test:integration"
  echo "     3. Verify MCP server: npm run start:http"
  echo ""
else
  echo "  ❌ Overall Status: SETUP INCOMPLETE"
  echo ""
  echo "  🔧 Required Actions:"
  echo "     - Fix failed checks before proceeding"
  echo "     - See output above for details"
  echo ""
fi

echo "═══════════════════════════════════════════════════════"
echo "  Documentation: docker/SETUP-README.md"
echo "  Setup Script: bash docker/setup-n8n-api.sh"
echo "═══════════════════════════════════════════════════════"

exit $FAIL
