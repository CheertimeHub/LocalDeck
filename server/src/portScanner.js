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

// อ่านรายการ process ทั้งเครื่องรอบเดียว: ได้ชื่อ, parent PID (ไว้หา tree), RAM, CPU time, command line
// ใช้ CIM ผ่าน PowerShell แทน wmic เพราะ Windows 11 รุ่นใหม่ถอด wmic ออกแล้ว
// ใช้ ConvertTo-Json (ไม่ใช่ CSV) เพราะ CommandLine มี comma/quote ที่ทำให้ CSV split พัง
const CIM_SCRIPT =
  'Get-CimInstance Win32_Process | ' +
  'Select-Object ProcessId,ParentProcessId,Name,WorkingSetSize,UserModeTime,KernelModeTime,CommandLine | ' +
  'ConvertTo-Json -Compress -Depth 2';

function parseProcessJson(output) {
  const processes = new Map();
  let rows;
  try {
    rows = JSON.parse(output);
  } catch {
    return processes;
  }
  // PowerShell คืน object เดี่ยว (ไม่ใช่ array) ถ้ามีแค่ 1 element
  if (!Array.isArray(rows)) rows = rows ? [rows] : [];
  for (const row of rows) {
    const pid = Number(row.ProcessId);
    if (!Number.isFinite(pid)) continue;
    processes.set(pid, {
      pid,
      ppid: Number(row.ParentProcessId) || 0,
      name: row.Name ?? '',
      memory: Number(row.WorkingSetSize) || 0,
      // หน่วย 100 นาโนวินาที → มิลลิวินาที
      cpuMs: (Number(row.UserModeTime) + Number(row.KernelModeTime)) / 10000 || 0,
      commandLine: row.CommandLine ?? '',
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
      this.processes = parseProcessJson(cimOut);
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

  // ย้อนหา listening port ที่ owner อยู่ใน process tree ของ rootPid (ไว้รู้ port ของ external service)
  portForPid(rootPid) {
    if (!rootPid) return null;
    const tree = new Set(this.treePids(rootPid));
    return this.ports.find((p) => tree.has(p.pid))?.port ?? null;
  }

  // process ที่ "รันโปรแกรมจริง" (dev server/runtime) ไม่ใช่ shell/editor/เครื่องมือที่แค่พาดพิงถึง path
  // ป้องกัน false positive: bash ที่ cd เข้าโฟลเดอร์, VS Code ที่เปิดไฟล์ ฯลฯ
  static RUNTIME_NAMES = /^(node|java|python|python3|py|php|ruby|dotnet|deno|bun|go|cargo|rust|nginx|redis-server|mongod|postgres|mysqld)/i;

  // หา pid ของ process ที่ commandLine มี path cwd ฝังอยู่ (ไว้ detect service ที่รันนอกแอป)
  // คืน pid ที่เป็น "ราก" ของ tree มากที่สุด (ppid ไม่ได้อยู่ในกลุ่มที่ match) เพื่อให้ treePids ครอบคลุม
  pidForCwd(cwd) {
    if (!cwd) return null;
    // normalize: เทียบแบบ case-insensitive และรับได้ทั้ง \ และ /
    const needle = cwd.replace(/\//g, '\\').toLowerCase();
    const matched = [];
    for (const proc of this.processes.values()) {
      // เอาเฉพาะ runtime จริง ไม่เอา shell/editor ที่แค่มี path ปนใน command line
      if (!PortScanner.RUNTIME_NAMES.test(proc.name || '')) continue;
      const cmd = (proc.commandLine || '').replace(/\//g, '\\').toLowerCase();
      if (cmd.includes(needle)) matched.push(proc);
    }
    if (matched.length === 0) return null;
    // เลือกตัวที่ ppid ไม่ได้อยู่ในกลุ่ม matched (ใกล้รากสุด) — ให้ treePids จับลูกได้ครบ
    const matchedPids = new Set(matched.map((p) => p.pid));
    const root = matched.find((p) => !matchedPids.has(p.ppid)) ?? matched[0];
    return root.pid;
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
