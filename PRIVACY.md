# Privacy Policy

**Last Updated:** April 3, 2026

## Overview

n8n-MCP is a self-hosted Model Context Protocol (MCP) server. This document describes how the project handles data, credentials, and privacy.

## Data Collection

### No Telemetry by Default

This project **does not collect telemetry data** without explicit opt-in. When running in production:

- No analytics or tracking services are enabled
- No usage statistics are sent to third parties
- No phone-home behavior

### Local Data Storage

The project stores data **locally** on your infrastructure:

- **SQLite Database**: Contains n8n node documentation, schemas, and metadata. No credentials or personal data.
- **Logs**: Application logs stored locally. Sanitized to exclude API keys and sensitive configuration.
- **Environment Variables**: All configuration via `.env` files — never transmitted externally.

## Credential Handling

### API Keys and Secrets

- **Never hardcoded**: All credentials are loaded from environment variables exclusively.
- **Never logged**: Error messages are sanitized — `error.config` (which may contain API keys) is never logged. Only `error.message` and `error.config?.url` are recorded.
- **Never returned in responses**: Environment variable values are **never included in MCP tool responses**. Tools like `n8n_list_variables`, `n8n_create_variable`, and `n8n_update_variable` only return `id` and `key` — never the actual secret value.

### Workflow Exports

When using `n8n_export_workflow` or `n8n_duplicate_workflow`, be aware that exported workflow JSON may contain embedded credentials in node configurations. **Always review exported data before sharing**.

### Workflow Diff Operations

Partial workflow updates (`n8n_update_partial_workflow`) are designed to be token-efficient but may include field values. Review diff output before sharing logs.

## Network Communication

### MCP Protocol

- **Stdio mode**: Communication happens over stdin/stdout — no network exposure.
- **HTTP mode**: Requires Bearer token authentication. All endpoints are protected.
- **SSE mode**: (Deprecated) Also requires authentication.

### n8n API Communication

The MCP server communicates with your n8n instance via its REST API (`/api/v1`). All requests use the `X-N8N-API-KEY` header. This traffic stays within your infrastructure.

## Third-Party Services

### Optional: External Documentation

The project can optionally query external documentation sources (Kapa.ai, docs.n8n.io) for node information. These requests:
- Contain only node type names (e.g., `n8n-nodes-base.httpRequest`)
- Do not include workflow data, credentials, or personal information
- Can be disabled by configuration

### No Third-Party Analytics

This project does **not** integrate with:
- Google Analytics or similar tracking services
- Sentry, Datadog, or other error tracking services
- Mixpanel, Amplitude, or other product analytics

## Compliance

### GDPR / LGPD

Since the project does not collect or process personal data, GDPR/LGPD compliance is straightforward:
- **No personal data is stored or processed**
- **No data is shared with third parties**
- **All data is local to your infrastructure**

### Data Retention

- **SQLite Database**: Persisted until manually deleted or rebuilt
- **Logs**: Retained based on your logging configuration
- **Environment Variables**: Managed by your deployment platform

## Security Best Practices

1. **Use strong AUTH_TOKEN values** when running in HTTP mode
2. **Protect your n8n API key** — it provides full workflow access
3. **Review exported workflows** before sharing (may contain credentials)
4. **Keep dependencies updated** — run `npm audit` regularly
5. **Run as non-root user** — use the provided `Dockerfile.production`

## Contact

For privacy-related questions or concerns:
- Open an issue: https://github.com/czlonkowski/n8n-mcp/issues
- Review the [Security Policy](./SECURITY.md)
- Review the [Contributing Guide](./CONTRIBUTING.md)

---

*This privacy policy applies to the open-source n8n-MCP project. If you are using a hosted or managed version, refer to that provider's privacy policy.*
