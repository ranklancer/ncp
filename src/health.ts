import type { BackendHealth, BackendStatus } from './types.js';

export class HealthTracker {
  private readonly statuses = new Map<string, BackendHealth>();

  set(id: string, status: BackendStatus, toolCount = 0, error?: string): void {
    this.statuses.set(id, {
      id,
      status,
      toolCount,
      lastError: error,
      lastChecked: new Date().toISOString(),
    });
  }

  get(id: string): BackendHealth | undefined {
    return this.statuses.get(id);
  }

  getAll(): BackendHealth[] {
    return Array.from(this.statuses.values());
  }

  isHealthy(): boolean {
    if (this.statuses.size === 0) return false;
    return Array.from(this.statuses.values()).some(
      (b) => b.status === 'connected'
    );
  }
}
