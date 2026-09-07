import type { ToolProfileSummary } from './config/tool-profile.js';

export type MonitoringFeature = 'console' | 'network';

export type MonitoringState = 'disabled' | 'idle' | 'running' | 'stopped' | 'failed';

export interface MonitoringFeatureStatus {
  enabled: boolean;
  state: MonitoringState;
  startedAt: string | null;
  lastError: string | null;
}

export interface MonitoringPolicy {
  console: boolean;
  network: boolean;
}

export interface MonitoringStatus {
  console: MonitoringFeatureStatus;
  network: MonitoringFeatureStatus;
}

export interface RuntimeStatusMetadata {
  toolProfile: ToolProfileSummary;
  monitoring: MonitoringStatus;
}

export function createMonitoringStatus(policy: MonitoringPolicy): MonitoringStatus {
  const createFeatureStatus = (enabled: boolean): MonitoringFeatureStatus => ({
    enabled,
    state: enabled ? 'idle' : 'disabled',
    startedAt: null,
    lastError: null,
  });

  return {
    console: createFeatureStatus(policy.console),
    network: createFeatureStatus(policy.network),
  };
}

export function cloneMonitoringStatus(status: MonitoringStatus): MonitoringStatus {
  return {
    console: { ...status.console },
    network: { ...status.network },
  };
}
