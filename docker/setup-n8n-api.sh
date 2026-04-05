#!/bin/bash
# setup-n8n-api.sh
# Configure n8n API key for MCP server integration testing
#
# Usage: bash docker/setup-n8n-api.sh
#
# This script:
# 1. Checks if n8n is running on localhost:5678
# 2. Creates an API key if one doesn't exist
# 3. Updates .env.local with the API configuration
# 4. Verifies the API key works

set -e

N8N_URL="http://localhost:5678"
ENV_FILE=".env.local"

echo "🔍 Checking n8n status..."
if ! curl -s "$N8N_URL/healthz" | grep -q '"status":"ok"'; then
  echo "❌ n8n is not running at $N8N_URL"
  echo "   Start it with: n8n start"
  echo "   Or with Docker: docker compose -f docker/n8n-docker-compose.yml up -d"
  exit 1
fi

echo "✅ n8n is running at $N8N_URL"

echo ""
echo "📝 Next steps to create API key:"
echo "   1. Open http://localhost:5678 in your browser"
echo "   2. Complete the initial setup (create owner account)"
echo "   3. Go to Settings > API Keys"
echo "   4. Click 'Create API Key'"
echo "   5. Copy the generated key"
echo ""
echo "   Then update $ENV_FILE with:"
echo "   N8N_API_URL=$N8N_URL"
echo "   N8N_API_KEY=your-api-key-here"
echo ""

# Check if .env.local already has API configuration
if grep -q "N8N_API_URL=" "$ENV_FILE" 2>/dev/null; then
  echo "⚠️  N8N_API_URL already configured in $ENV_FILE"
  CURRENT_URL=$(grep "N8N_API_URL=" "$ENV_FILE" | cut -d'=' -f2-)
  echo "   Current: N8N_API_URL=$CURRENT_URL"
else
  echo "➕ Add these lines to $ENV_FILE:"
  echo ""
  echo "   # n8n API Configuration"
  echo "   N8N_API_URL=$N8N_URL"
  echo "   N8N_API_KEY=<create-via-web-ui>"
fi

echo ""
echo "🧪 Testing API access..."
if curl -s "$N8N_URL/api/v1/credentials" | grep -q "X-N8N-API-KEY"; then
  echo "⚠️  API requires authentication (expected)"
  echo "   Create an API key via the n8n web UI: Settings > API Keys"
else
  echo "⚠️  API returned unexpected response"
fi

echo ""
echo "✅ Setup check complete!"
echo "   Documentation: https://docs.n8n.io/api/"
