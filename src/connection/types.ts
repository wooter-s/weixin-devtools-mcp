import type { MiniProgram, Page } from 'miniprogram-automator';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'degraded';

export type ConnectionStrategy =
  | 'auto'
  | 'launch'
  | 'connect'
  | 'wsEndpoint'
  | 'browserUrl'
  | 'discover';

export type ConnectionPhase =
  | 'resolve'
  | 'startup'
  | 'connect'
  | 'health_check'
  | 'disconnect';

export type MetadataValue = string | number | boolean | null;

export interface ConnectionErrorSummary {
  code: string;
  phase: ConnectionPhase;
  message: string;
  suggestions: string[];
  metadata?: Record<string, MetadataValue>;
  timestamp: string;
}

export interface ConnectionRequest {
  strategy?: ConnectionStrategy;
  projectPath?: string;
  cliPath?: string;
  autoPort?: number;
  browserUrl?: string;
  wsEndpoint?: string;
  wsHeaders?: Record<string, string>;
  timeoutMs?: number;
  fallback?: ConnectionStrategy[];
  healthCheck?: boolean;
  verbose?: boolean;
  autoAudits?: boolean;
  autoDiscover?: boolean;
}

export interface ResolvedConnectionRequest {
  strategy: ConnectionStrategy;
  projectPath?: string;
  cliPath?: string;
  autoPort?: number;
  browserUrl?: string;
  wsEndpoint?: string;
  wsHeaders?: Record<string, string>;
  timeoutMs: number;
  fallback: ConnectionStrategy[];
  healthCheck: boolean;
  verbose: boolean;
  autoAudits?: boolean;
  autoDiscover: boolean;
}

export interface ResolvedConnectionPlan {
  request: ResolvedConnectionRequest;
  attempts: ConnectionStrategy[];
}

export type HealthCheckName = 'transport' | 'session' | 'page';
export type HealthCheckStatus = 'pass' | 'fail';

export interface HealthCheckItem {
  name: HealthCheckName;
  status: HealthCheckStatus;
  message: string;
  durationMs: number;
}

export type HealthLevel = 'healthy' | 'degraded' | 'unhealthy';

export interface ConnectionHealth {
  level: HealthLevel;
  checks: HealthCheckItem[];
  checkedAt: string;
}

export interface AdapterConnectionResult {
  strategyUsed: ConnectionStrategy;
  endpoint: string | null;
  miniProgram: MiniProgram;
  currentPage: Page;
  pagePath: string;
}

export interface ConnectionTiming {
  totalMs: number;
  connectMs: number;
  healthMs: number;
}

export interface ConnectionConnectResult extends AdapterConnectionResult {
  connectionId: string;
  health: ConnectionHealth;
  status: Extract<ConnectionState, 'connected' | 'degraded'>;
  timing: ConnectionTiming;
  warnings: string[];
}

export interface ConnectionStatusSnapshot {
  connectionId: string | null;
  state: ConnectionState;
  strategyUsed: ConnectionStrategy | null;
  endpoint: string | null;
  connected: boolean;
  hasCurrentPage: boolean;
  pagePath: string | null;
  health: ConnectionHealth | null;
  lastError: ConnectionErrorSummary | null;
  lastConnectedAt: string | null;
  lastHealthCheckAt: string | null;
}

export function createDisconnectedStatus(): ConnectionStatusSnapshot {
  return {
    connectionId: null,
    state: 'disconnected',
    strategyUsed: null,
    endpoint: null,
    connected: false,
    hasCurrentPage: false,
    pagePath: null,
    health: null,
    lastError: null,
    lastConnectedAt: null,
    lastHealthCheckAt: null,
  };
}
