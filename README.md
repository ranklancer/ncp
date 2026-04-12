# NCP — MCP Aggregation Layer

NCP is a single [Model Context Protocol](https://modelcontextprotocol.io) server that aggregates multiple backend MCP servers into one endpoint. It connects to each backend on startup, discovers their tools, and exposes them all under a namespaced prefix (`backendId__toolName`).

## Architecture

```
Claude / MCP Client
       │
       ▼
  NCP :8100 (StreamableHTTP)
  ┌──────────────────────────────────────────┐
  │  tool: dockge__deploy_stack    ─────────►│─► dockge-mcp
  │  tool: truenas__list_datasets  ─────────►│─► truenas-mcp
  │  tool: npm__create_proxy_host  ─────────►│─► npm-mcp
  │  tool: github__create_issue    ─────────►│─► github-mcp
  │  ...                                     │
  └──────────────────────────────────────────┘
```

## Quick start

```sh
cp .env.example .env
# Edit .env with your backend URLs

npm install
npm run build
npm start
```

NCP listens on `0.0.0.0:8100` by default.

## Docker

```sh
cp .env.example .env
# Edit .env

docker compose up -d
```

## Configuration

### ncp.config.yaml

Backend URLs are read from environment variables:

```yaml
backends:
  - id: dockge
    url: ${DOCKGE_MCP_URL}
    transport: streamable-http   # or: sse
```

Supported transport types: `streamable-http` (default), `sse`.

### Environment variables

| Variable | Description |
|---|---|
| `DOCKGE_MCP_URL` | Dockge MCP server endpoint |
| `TRUENAS_MCP_URL` | TrueNAS MCP server endpoint |
| `NPM_MCP_URL` | Nginx Proxy Manager MCP endpoint |
| `GITHUB_MCP_URL` | GitHub MCP server endpoint |
| `VAULTWARDEN_MCP_URL` | Vaultwarden MCP server endpoint |
| `HOMEPAGE_MCP_URL` | Homepage MCP server endpoint |
| `CLOUDFLARE_MCP_URL` | Cloudflare MCP server endpoint |
| `N8N_MCP_URL` | n8n MCP server endpoint |
| `NCP_PORT` | Bind port (default: `8100`) |
| `NCP_HOST` | Bind host (default: `0.0.0.0`) |

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Backend status and tool count |
| `POST` | `/mcp` | MCP StreamableHTTP (initialize / tool calls) |
| `GET` | `/mcp` | MCP SSE stream (requires `mcp-session-id`) |
| `DELETE` | `/mcp` | Terminate MCP session |

### Health response

```json
{
  "status": "ok",
  "toolCount": 42,
  "backends": [
    { "id": "dockge", "status": "connected", "toolCount": 8, "lastChecked": "..." },
    { "id": "truenas", "status": "error", "toolCount": 0, "lastError": "ECONNREFUSED", "lastChecked": "..." }
  ]
}
```

If any backend is down, NCP returns HTTP 207 (Multi-Status) instead of 200 but continues serving tools from healthy backends. Tool calls to an unavailable backend return a structured error rather than crashing the server.

## Connecting from Claude Code

Add to your `claude_mcp_config.json` (or equivalent):

```json
{
  "mcpServers": {
    "ncp": {
      "type": "http",
      "url": "http://127.0.0.1:8100/mcp"
    }
  }
}
```

## Tool naming

Tools are namespaced as `{backendId}__{toolName}`, e.g.:

- `dockge__deploy_stack`
- `truenas__list_datasets`
- `npm__create_proxy_host`

The separator is double-underscore (`__`) to avoid collisions with single-underscore names.
