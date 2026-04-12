import type { BackendRegistry } from './registry.js';

export interface CallResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export async function routeToolCall(
  registry: BackendRegistry,
  prefixedName: string,
  args: Record<string, unknown>
): Promise<CallResult> {
  const entry = registry.findTool(prefixedName);

  if (!entry) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${prefixedName}` }],
      isError: true,
    };
  }

  const client = registry.getClient(entry.backendId);

  if (!client) {
    return {
      content: [
        {
          type: 'text',
          text: `Backend unavailable: ${entry.backendId} (not connected)`,
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await client.callTool({
      name: entry.originalName,
      arguments: args,
    });
    return result as CallResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: 'text',
          text: `Error from backend ${entry.backendId}: ${msg}`,
        },
      ],
      isError: true,
    };
  }
}
