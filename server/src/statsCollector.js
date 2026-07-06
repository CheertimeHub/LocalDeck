import { EventEmitter } from 'node:events';
import os from 'node:os';

// คำนวณ CPU% / RAM ของแต่ละ service จาก snapshot process ที่ PortScanner ดึงมาแล้ว
// CPU% = delta ของ cpu time ระหว่าง scan สองรอบ หารด้วยเวลาจริง แล้ว normalize ด้วยจำนวน core
// (แบบเดียวกับ Task Manager)
export class StatsCollector extends EventEmitter {
  constructor(scanner, manager) {
    super();
    this.scanner = scanner;
    this.manager = manager;
    this.prev = new Map(); // pid → { cpuMs, at }
    this.cores = os.cpus().length || 1;
    scanner.on('scan', ({ processes, at }) => this._onScan(processes, at));
  }

  _onScan(processes, at) {
    const stats = {};
    const nextPrev = new Map();

    for (const service of this.manager.services) {
      const { status, pid } = this.manager.statusOf(service.id);
      if (!pid || (status !== 'running' && status !== 'starting' && status !== 'external')) continue;

      let cpuPercent = 0;
      let memory = 0;
      let count = 0;
      for (const treePid of this.scanner.treePids(pid)) {
        const proc = processes.get(treePid);
        if (!proc) continue;
        count++;
        memory += proc.memory;
        const prev = this.prev.get(treePid);
        if (prev && at > prev.at) {
          cpuPercent += ((proc.cpuMs - prev.cpuMs) / (at - prev.at)) * 100;
        }
        nextPrev.set(treePid, { cpuMs: proc.cpuMs, at });
      }
      stats[service.id] = {
        cpu: Math.max(0, Math.round((cpuPercent / this.cores) * 10) / 10),
        memory,
        processCount: count,
      };
    }

    this.prev = nextPrev;
    this.emit('stats', stats);
  }
}
