import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './config.js';
import { BackendRegistry } from './registry.js';
import { HealthTracker } from './health.js';
import { routeToolCall } from './router.js';

interface ActiveSession {
  server: Server;
  transport: StreamableHTTPServerTransport;
}

const activeSessions = new Map<string, ActiveSession>();

function createMcpServer(registry: BackendRegistry): Server {
  const server = new Server(
    { name: 'ncp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.getTools().map((t) => ({
      name: t.prefixedName,
      description: t.description ?? `${t.originalName} via ${t.backendId}`,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    return routeToolCall(registry, name, args as Record<string, unknown>);
  });

  return server;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const health = new HealthTracker();
  const registry = new BackendRegistry(health);

  console.log('[ncp] Connecting to backends...');
  await registry.connectAll(config.backends);

  const totalTools = registry.getTools().length;
  console.log(`[ncp] Ready — ${totalTools} tools across ${config.backends.length} backends`);

  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // ── Health ──────────────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    const backends = health.getAll();
    const allUp = backends.length > 0 && backends.every((b) => b.status === 'connected');
    res.status(allUp ? 200 : 207).json({
      status: allUp ? 'ok' : 'degraded',
      toolCount: registry.getTools().length,
      backends,
    });
  });

  // ── MCP POST — initialize or dispatch to existing session ──────────────────
  app.post('/mcp', async (req, res) => {
    try {
      const existingId = req.headers['mcp-session-id'] as string | undefined;

      if (existingId) {
        const session = activeSessions.get(existingId);
        if (session) {
          await session.transport.handleRequest(req, res, req.body);
          return;
        }
        // Stale session ID — fall through to create new session
      }

      const sessionId = crypto.randomUUID();
      const server = createMcpServer(registry);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId,
      });

      activeSessions.set(sessionId, { server, transport });
      transport.onclose = () => {
        activeSessions.delete(sessionId);
      };

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ncp] POST /mcp error:', msg);
      if (!res.headersSent) {
        res.status(500).json({ error: msg });
      }
    }
  });

  // ── MCP GET — SSE stream for existing session ──────────────────────────────
  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const session = sessionId ? activeSessions.get(sessionId) : undefined;

    if (!session) {
      res.status(400).json({ error: 'Valid mcp-session-id header required' });
      return;
    }

    try {
      await session.transport.handleRequest(req, res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ncp] GET /mcp error:', msg);
      if (!res.headersSent) res.status(500).json({ error: msg });
    }
  });

  // ── MCP DELETE — terminate session ─────────────────────────────────────────
  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId) {
      const session = activeSessions.get(sessionId);
      if (session) {
        await session.transport.close().catch(() => {});
        activeSessions.delete(sessionId);
      }
    }
    res.status(204).end();
  });

  const { port, host } = config.server;
  app.listen(port, host, () => {
    console.log(`[ncp] Listening on ${host}:${port}`);
  });

  async function shutdown(): Promise<void> {
    console.log('[ncp] Shutting down...');
    await registry.disconnectAll();
    process.exit(0);
  }

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

main().catch((err) => {
  console.error('[ncp] Fatal:', err);
  process.exit(1);
});
