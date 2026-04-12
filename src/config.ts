import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import type { NcpConfig } from './types.js';

function substituteEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, expr: string) => {
    const sep = expr.indexOf(':-');
    if (sep !== -1) {
      const name = expr.slice(0, sep);
      const fallback = expr.slice(sep + 2);
      return process.env[name] ?? fallback;
    }
    const v = process.env[expr];
    if (v === undefined) {
      console.warn(`[config] Warning: env var ${expr} is not set`);
      return '';
    }
    return v;
  });
}

function deepSubstitute(obj: unknown): unknown {
  if (typeof obj === 'string') return substituteEnvVars(obj);
  if (Array.isArray(obj)) return obj.map(deepSubstitute);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        k,
        deepSubstitute(v),
      ])
    );
  }
  return obj;
}

const DEFAULT_CONFIG: Pick<NcpConfig, 'server'> = {
  server: { port: 8100, host: '0.0.0.0' },
};

export function loadConfig(configPath?: string): NcpConfig {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const path = configPath ?? join(__dirname, '..', 'ncp.config.yaml');
  const raw = readFileSync(path, 'utf-8');
  const parsed = yaml.load(raw) as Partial<NcpConfig>;
  const substituted = deepSubstitute(parsed) as Partial<NcpConfig>;
  const merged: NcpConfig = {
    backends: substituted.backends ?? [],
    server: {
      port: Number(substituted.server?.port ?? DEFAULT_CONFIG.server.port),
      host: String(substituted.server?.host ?? DEFAULT_CONFIG.server.host),
    },
  };
  return merged;
}
