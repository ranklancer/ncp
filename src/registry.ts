import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { BackendConfig, ToolEntry } from './types.js';
import { HealthTracker } from './health.js';

export class BackendRegistry {
  private readonly clients = new Map<string, Client>();
  private readonly tools = new Map<string, ToolEntry>();
  private readonly health: HealthTracker;

  constructor(health: HealthTracker) {
    this.health = health;
  }

  async connectAll(backends: BackendConfig[]): Promise<void> {
    await Promise.allSettled(backends.map((b) => this.connect(b)));
  }

  private async connect(config: BackendConfig): Promise<void> {
    const { id, url, headers = {}, transport: transportType = 'streamable-http' } = config;

    if (!url) {
      const msg = `URL is empty — check that ${id.toUpperCase().replace(/-/g, '_')}_MCP_URL is set`;
      this.health.set(id, 'error', 0, msg);
      console.warn(`[registry] ${id}: skipped — ${msg}`);
      return;
    }

    this.health.set(id, 'connecting');

    try {
      const client = new Client({ name: `ncp-${id}`, version: '1.0.0' });

      const transport =
        transportType === 'sse'
          ? new SSEClientTransport(new URL(url), { requestInit: { headers } })
          : new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });

      await client.connect(transport);
      this.clients.set(id, client);

      const { tools } = await client.listTools();

      for (const tool of tools) {
        const prefixedName = `${id}__${tool.name}`;
        this.tools.set(prefixedName, {
          prefixedName,
          originalName: tool.name,
          backendId: id,
          description: tool.description,
          inputSchema: (tool.inputSchema as Record<string, unknown>) ?? {
            type: 'object',
            properties: {},
          },
        });
      }

      this.health.set(id, 'connected', tools.length);
      console.log(`[registry] ${id}: connected (${tools.length} tools)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.health.set(id, 'error', 0, msg);
      console.error(`[registry] ${id}: failed — ${msg}`);
    }
  }

  getTools(): ToolEntry[] {
    return Array.from(this.tools.values());
  }

  getClient(backendId: string): Client | undefined {
    return this.clients.get(backendId);
  }

  findTool(prefixedName: string): ToolEntry | undefined {
    return this.tools.get(prefixedName);
  }

  async disconnectAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.clients.entries()).map(async ([id, client]) => {
        try {
          await client.close();
          this.health.set(id, 'disconnected');
          console.log(`[registry] ${id}: disconnected`);
        } catch {
          // ignore close errors during shutdown
        }
      })
    );
  }
}
