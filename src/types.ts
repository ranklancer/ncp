export interface BackendConfig {
  id: string;
  url: string;
  transport?: 'streamable-http' | 'sse';
  headers?: Record<string, string>;
  timeout?: number;
}

export interface ServerConfig {
  port: number;
  host: string;
}

export interface NcpConfig {
  server: ServerConfig;
  backends: BackendConfig[];
}

export type BackendStatus = 'connected' | 'disconnected' | 'error' | 'connecting';

export interface BackendHealth {
  id: string;
  status: BackendStatus;
  toolCount: number;
  lastError?: string;
  lastChecked: string;
}

export interface ToolEntry {
  prefixedName: string;
  originalName: string;
  backendId: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}
