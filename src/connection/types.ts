import type { MiniProgram, Page } from 'miniprogram-automator';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'degraded';

export type ConnectionAttemptMethod =
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

export interface ProjectConnectionTarget {
  kind: 'project';
  projectPath: string;
  cliPath?: string;
  autoPort?: number;
  autoAudits?: boolean;
}

export interface WsEndpointConnectionTarget {
  kind: 'wsEndpoint';
  endpoint: string;
}

export interface BrowserUrlConnectionTarget {
  kind: 'browserUrl';
  url: string;
}

export interface DiscoverConnectionTarget {
  kind: 'discover';
}

export type ConnectionTarget =
  | ProjectConnectionTarget
  | WsEndpointConnectionTarget
  | BrowserUrlConnectionTarget
  | DiscoverConnectionTarget;

export interface ConnectionRequest {
  target: ConnectionTarget;
  timeoutMs?: number;
  healthCheck?: boolean;
}

export interface ResolvedConnectionRequest {
  target: ConnectionTarget;
  timeoutMs: number;
  healthCheck: boolean;
}

export type ConnectionAttemptSpec =
  | { method: 'launch'; target: ProjectConnectionTarget }
  | { method: 'connect'; target: ProjectConnectionTarget }
  | { method: 'wsEndpoint'; target: WsEndpointConnectionTarget }
  | { method: 'browserUrl'; target: BrowserUrlConnectionTarget }
  | { method: 'discover'; target: DiscoverConnectionTarget };

export interface ResolvedConnectionPlan {
  request: ResolvedConnectionRequest;
  attempts: ConnectionAttemptSpec[];
}

export type ConnectionAttemptOutcome = 'connected' | 'failed';

export interface ConnectionAttemptRecord {
  index: number;
  method: ConnectionAttemptMethod;
  startedAt: string;
  durationMs: number;
  outcome: ConnectionAttemptOutcome;
  endpoint: string | null;
  error: ConnectionErrorSummary | null;
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
  strategyUsed: ConnectionAttemptMethod;
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
  attempts: ConnectionAttemptRecord[];
  warnings: string[];
}

export interface ConnectionStatusSnapshot {
  connectionId: string | null;
  state: ConnectionState;
  strategyUsed: ConnectionAttemptMethod | null;
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
