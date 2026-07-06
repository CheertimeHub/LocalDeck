export type ServiceStatus = 'stopped' | 'starting' | 'running' | 'external' | 'crashed';

export interface ServiceDef {
  id: string;
  name: string;
  type: string;
  group: string;
  cwd: string;
  command: string;
  port: number | null;
  env: Record<string, string>;
}

export interface ServiceStats {
  cpu: number;
  memory: number;
  processCount: number;
}

export interface ServiceView extends ServiceDef {
  status: ServiceStatus;
  pid?: number;
  exitCode?: number | null;
  stats?: ServiceStats;
}

export interface PortInfo {
  port: number;
  pid: number;
  address: string;
  process: string;
  service: string | null;
}

export interface LogEntry {
  ts: number;
  stream: 'stdout' | 'stderr' | 'system';
  line: string;
}

// ผลจากการสแกนโฟลเดอร์ (POST /api/scan/folder)
export interface ScannedProject {
  name: string;
  cwd: string;
  type: string;
  command: string;
  icon: string;
  port: number | null;
}

// process ที่รันอยู่และ listen port (GET /api/processes/importable)
export interface ImportableProcess {
  pid: number;
  port: number;
  process: string;
  commandLine: string;
  cwd: string;
}

export type ServerMessage =
  | { type: 'init'; services: ServiceView[]; ports: PortInfo[] }
  | { type: 'services'; services: ServiceView[] }
  | { type: 'status'; id: string; status: ServiceStatus; pid?: number; exitCode?: number | null }
  | { type: 'stats'; stats: Record<string, ServiceStats> }
  | { type: 'ports'; ports: PortInfo[] }
  | ({ type: 'log'; id: string } & LogEntry);
