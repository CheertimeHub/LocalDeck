export type ServiceStatus = 'stopped' | 'starting' | 'running' | 'external' | 'crashed';

// sub-detail ของ starting — ไว้โชว์ timeline ตอนกำลังรัน
export type StartPhase = 'starting' | 'waiting-port' | 'ready';

export interface ServiceDef {
  id: string;
  name: string;
  type: string;
  group: string;
  cwd: string;
  command: string;
  port: number | null;
  env: Record<string, string>;
  openOnReady?: boolean;
  pinned?: boolean;
  dependsOn?: string[];
}

export interface ServiceStats {
  cpu: number;
  memory: number;
  processCount: number;
}

export interface ServiceView extends ServiceDef {
  status: ServiceStatus;
  phase?: StartPhase;
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


export type ServerMessage =
  | { type: 'init'; services: ServiceView[]; ports: PortInfo[] }
  | { type: 'services'; services: ServiceView[] }
  | { type: 'status'; id: string; status: ServiceStatus; phase?: StartPhase; pid?: number; exitCode?: number | null }
  | { type: 'stats'; stats: Record<string, ServiceStats> }
  | { type: 'ports'; ports: PortInfo[] }
  | ({ type: 'log'; id: string } & LogEntry);
