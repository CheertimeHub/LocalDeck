import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';

const EXEC_OPTS = { maxBuffer: 16 * 1024 * 1024, windowsHide: true };

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, EXEC_OPTS, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}

// netstat -ano → [{ port, pid, address }] เฉพาะ TCP LISTENING (dedupe IPv4/IPv6 ที่ port เดียวกัน)
function parseNetstat(output) {
  const byPort = new Map();
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(/^\s*TCP\s+(\S+)\s+\S+\s+LISTENING\s+(\d+)\s*$/);
    if (!m) continue;
    const local = m[1];
    const port = Number(local.slice(local.lastIndexOf(':') + 1));
    if (!byPort.has(port)) byPort.set(port, { port, pid: Number(m[2]), address: local });
  }
  return [...byPort.values()].sort((a, b) => a.port - b.port);
}

// อ่านรายการ process ทั้งเครื่องรอบเดียว: ได้ชื่อ, parent PID (ไว้หา tree), RAM, CPU time
// ใช้ CIM ผ่าน PowerShell แทน wmic เพราะ Windows 11 รุ่นใหม่ถอด wmic ออกแล้ว
const CIM_SCRIPT =
  'Get-CimInstance Win32_Process | ' +
  'Select-Object ProcessId,ParentProcessId,Name,WorkingSetSize,UserModeTime,KernelModeTime | ' +
  'ConvertTo-Csv -NoTypeInformation';

function parseProcessCsv(output) {
  const lines = output.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return new Map();
  const header = lines[0].replace(/^"|"$/g, '').split('","');
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const processes = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].replace(/^"|"$/g, '').split('","');
    const pid = Number(cols[idx.ProcessId]);
    if (!Number.isFinite(pid)) continue;
    processes.set(pid, {
      pid,
      ppid: Number(cols[idx.ParentProcessId]) || 0,
      name: cols[idx.Name] ?? '',
      memory: Number(cols[idx.WorkingSetSize]) || 0,
      // หน่วย 100 นาโนวินาที → มิลลิวินาที
      cpuMs: (Number(cols[idx.UserModeTime]) + Number(cols[idx.KernelModeTime])) / 10000 || 0,
    });
  }
  return processes;
}

export class PortScanner extends EventEmitter {
  constructor(intervalMs = 3000) {
    super();
    this.intervalMs = intervalMs;
    this.ports = [];
    this.processes = new Map();
    this.scannedAt = 0;
    this._busy = false;
    this._timer = null;
  }

  start() {
    this._tick();
    this._timer = setInterval(() => this._tick(), this.intervalMs);
    this._timer.unref?.();
  }

  stop() {
    clearInterval(this._timer);
  }

  // บังคับ scan ใหม่เดี๋ยวนี้ (รอตัวที่ค้างอยู่จบก่อน) — ใช้ตอนต้องการข้อมูลสดจริง ๆ เช่นหลัง stop service
  async rescan() {
    while (this._busy) await new Promise((resolve) => setTimeout(resolve, 100));
    await this._tick();
  }

  async _tick() {
    if (this._busy) return;
    this._busy = true;
    try {
      const [netstatOut, cimOut] = await Promise.all([
        run('netstat', ['-ano']),
        run('powershell', ['-NoProfile', '-NonInteractive', '-Command', CIM_SCRIPT]),
      ]);
      this.ports = parseNetstat(netstatOut);
      this.processes = parseProcessCsv(cimOut);
      this.scannedAt = Date.now();
      this.emit('scan', { ports: this.ports, processes: this.processes, at: this.scannedAt });
    } catch (err) {
      this.emit('error', err);
    } finally {
      this._busy = false;
    }
  }

  isPortListening(port) {
    return this.ports.some((p) => p.port === port);
  }

  pidForPort(port) {
    return this.ports.find((p) => p.port === port)?.pid ?? null;
  }

  // pid ทั้งหมดใน process tree ที่มี rootPid เป็นราก (BFS จาก ppid map)
  treePids(rootPid) {
    const children = new Map();
    for (const proc of this.processes.values()) {
      if (!children.has(proc.ppid)) children.set(proc.ppid, []);
      children.get(proc.ppid).push(proc.pid);
    }
    const result = [];
    const queue = [rootPid];
    const seen = new Set();
    while (queue.length > 0) {
      const pid = queue.shift();
      if (seen.has(pid)) continue;
      seen.add(pid);
      if (this.processes.has(pid) || pid === rootPid) result.push(pid);
      for (const child of children.get(pid) ?? []) queue.push(child);
    }
    return result;
  }
}
