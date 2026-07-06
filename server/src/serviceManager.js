import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import treeKill from 'tree-kill';
import { LogBuffer } from './logBuffer.js';
import { loadServices, saveServices } from './store.js';

// สถานะที่หน้าเว็บเห็น:
//   stopped  – ไม่รัน
//   starting – สั่ง start แล้ว รอ port ขึ้น listen
//   running  – process ที่เราสั่งรันทำงานอยู่
//   external – port ของ service listen อยู่ แต่ไม่ใช่ process ที่เราสั่งรัน (เช่น Redis ที่รันเองอยู่แล้ว)
//   crashed  – process ตายเองโดยไม่ได้สั่ง stop

export class ServiceManager extends EventEmitter {
  constructor(scanner) {
    super();
    this.scanner = scanner;
    this.services = loadServices();
    this.runtime = new Map(); // id → { child, pid, status, exitCode, stopping }
    this.logs = new Map(); // id → LogBuffer
    this.lastStatus = new Map(); // id → สถานะล่าสุดที่ broadcast ไปแล้ว
    scanner.on('scan', () => this._onScan());
  }

  _logBuffer(id) {
    if (!this.logs.has(id)) this.logs.set(id, new LogBuffer());
    return this.logs.get(id);
  }

  getService(id) {
    return this.services.find((s) => s.id === id);
  }

  statusOf(id) {
    const service = this.getService(id);
    const rt = this.runtime.get(id);
    if (rt?.child) return { status: rt.status, pid: rt.pid, phase: rt.status === 'starting' ? rt.phase : undefined };
    if (service?.port && this.scanner.isPortListening(service.port)) {
      return { status: 'external', pid: this.scanner.pidForPort(service.port) };
    }
    if (rt?.status === 'crashed') return { status: 'crashed', exitCode: rt.exitCode };
    return { status: 'stopped' };
  }

  list() {
    return this.services.map((s) => ({ ...s, ...this.statusOf(s.id) }));
  }

  // ---- ทะเบียน service ----

  addService({ name, type, group, cwd, command, port, env, openOnReady, pinned, dependsOn }) {
    this._validate({ name, cwd, command, port });
    const service = {
      id: randomUUID(),
      name: name.trim(),
      type: type?.trim() || '',
      group: group?.trim() || '',
      cwd,
      command: command.trim(),
      port: port ? Number(port) : null,
      env: env ?? {},
      openOnReady: !!openOnReady,
      pinned: !!pinned,
      dependsOn: Array.isArray(dependsOn) ? dependsOn : [],
    };
    this.services.push(service);
    saveServices(this.services);
    this.emit('services');
    return service;
  }

  updateService(id, patch) {
    const service = this.getService(id);
    if (!service) throw httpError(404, 'service not found');
    const next = { ...service, ...patch, id };
    this._validate(next);
    next.port = next.port ? Number(next.port) : null;
    next.group = next.group?.trim() || '';
    next.openOnReady = !!next.openOnReady;
    next.pinned = !!next.pinned;
    next.dependsOn = Array.isArray(next.dependsOn) ? next.dependsOn : [];
    this.services = this.services.map((s) => (s.id === id ? next : s));
    saveServices(this.services);
    this.emit('services');
    return next;
  }

  removeService(id) {
    const rt = this.runtime.get(id);
    if (rt?.child) throw httpError(409, 'stop the service before deleting it');
    this.services = this.services.filter((s) => s.id !== id);
    this.runtime.delete(id);
    this.logs.delete(id);
    this.lastStatus.delete(id);
    saveServices(this.services);
    this.emit('services');
  }

  _validate({ name, cwd, command, port }) {
    if (!name?.trim()) throw httpError(400, 'name is required');
    if (!command?.trim()) throw httpError(400, 'command is required');
    if (!cwd || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
      throw httpError(400, `folder not found: ${cwd}`);
    }
    if (port != null && port !== '' && !(Number(port) > 0 && Number(port) < 65536)) {
      throw httpError(400, 'port must be 1-65535');
    }
  }

  // ---- ควบคุม process ----

  // start service พร้อม dependency: start ตัวที่มัน dependsOn ก่อน (recursive) รอ ready แล้วค่อย start ตัวเอง
  // (Redis → Backend → Frontend). กัน cycle ด้วย visited set
  async startWithDeps(id, visited = new Set()) {
    if (visited.has(id)) return; // กัน circular dependency
    visited.add(id);
    const service = this.getService(id);
    if (!service) throw httpError(404, 'service not found');

    // start dependencies ก่อน แล้วรอแต่ละตัว ready (ข้ามตัวที่รันอยู่แล้ว)
    for (const depId of service.dependsOn ?? []) {
      const depStatus = this.statusOf(depId).status;
      if (depStatus === 'stopped' || depStatus === 'crashed') {
        await this.startWithDeps(depId, visited);
      }
      await this._waitReady(depId, 30000);
    }

    const { status } = this.statusOf(id);
    if (status === 'stopped' || status === 'crashed') await this.start(id);
  }

  // รอจนกว่า service จะ running/external (หรือ timeout) — ใช้ระหว่าง start dependency chain
  async _waitReady(id, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const { status } = this.statusOf(id);
      if (status === 'running' || status === 'external') return;
      if (status === 'stopped' || status === 'crashed') return; // ไม่รอ ตัวที่ตายแล้ว
      await delay(500);
    }
  }

  async start(id) {
    const service = this.getService(id);
    if (!service) throw httpError(404, 'service not found');
    let { status } = this.statusOf(id);
    if (status === 'running' || status === 'starting') throw httpError(409, 'already running');
    if (status === 'external') {
      // ผล scan อาจเก่าไม่เกิน 3 วิ (เช่นเพิ่ง stop ไป port ยังโชว์ค้าง) — scan สดก่อนค่อยปฏิเสธ
      await this.scanner.rescan();
      status = this.statusOf(id).status;
      if (status === 'external') {
        throw httpError(409, `port ${service.port} is already in use by another process`);
      }
    }

    const child = spawn(service.command, {
      cwd: service.cwd,
      shell: true, // จำเป็นบน Windows เพื่อให้คำสั่งอย่าง npm (.cmd) รันได้
      // NO_COLOR: อย่าใช้ FORCE_COLOR=0 — picocolors ถือว่าแค่ "มี" FORCE_COLOR = บังคับเปิดสี
      env: { ...process.env, ...service.env, NO_COLOR: '1' },
      windowsHide: true,
    });

    // เข้าโหมด starting เสมอ — ให้ _onScan หา port (ถ้ายังไม่รู้) แล้ว promote เป็น running
    // phase: sub-detail ของ starting ไว้โชว์ timeline (starting → waiting-port → ready)
    const rt = { child, pid: child.pid, status: 'starting', phase: 'starting', startedAt: Date.now(), exitCode: null, stopping: false };
    this.runtime.set(id, rt);

    const buffer = this._logBuffer(id);
    this._emitLog(id, buffer.pushSystem(`▶ start: ${service.command} (pid ${child.pid})`));
    for (const stream of ['stdout', 'stderr']) {
      child[stream].on('data', (chunk) => {
        for (const entry of buffer.pushChunk(stream, chunk)) this._emitLog(id, entry);
      });
    }

    child.on('error', (err) => {
      this._emitLog(id, buffer.pushSystem(`spawn error: ${err.message}`));
    });

    child.on('exit', (code) => {
      rt.child = null;
      if (rt.stopping || code === 0) {
        rt.status = 'stopped';
        this._emitLog(id, buffer.pushSystem(`■ stopped (exit code ${code ?? 'killed'})`));
      } else {
        rt.status = 'crashed';
        rt.exitCode = code;
        this._emitLog(id, buffer.pushSystem(`💥 crashed (exit code ${code})`));
      }
      this._emitStatus(id);
      // scan ใหม่ทันที ไม่งั้นสถานะจะค้างเป็น external จาก port ที่เพิ่งถูกปล่อย จนกว่าจะถึงรอบ scan หน้า
      this.scanner.rescan().catch(() => {});
    });

    this._emitStatus(id);
  }

  async stop(id) {
    const service = this.getService(id);
    if (!service) throw httpError(404, 'service not found');
    const rt = this.runtime.get(id);

    if (rt?.child) {
      rt.stopping = true;
      const exited = new Promise((resolve) => rt.child.once('exit', resolve));
      await killTree(rt.pid);
      // taskkill /T /F ปกติจบใน ms แต่กันเหนียวไว้ 5 วิ
      await Promise.race([exited, delay(5000)]);
      return;
    }

    const { status, pid } = this.statusOf(id);
    if (status === 'external' && pid) {
      this._emitLog(id, this._logBuffer(id).pushSystem(`■ killing external process pid ${pid}`));
      await killTree(pid);
      return;
    }
    throw httpError(409, 'not running');
  }

  async restart(id) {
    const { status } = this.statusOf(id);
    if (status !== 'stopped' && status !== 'crashed') await this.stop(id);
    await this.start(id);
  }

  // ---- health check จากผล port scan ----

  _onScan() {
    for (const service of this.services) {
      const rt = this.runtime.get(service.id);
      if (rt?.child && rt.status === 'starting') {
        this._promoteStarting(service, rt);
      }
      // broadcast เมื่อสถานะ effective เปลี่ยน (ครอบคลุม external ที่โผล่มา/หายไปเอง)
      this._emitStatus(service.id, true);
    }
  }

  // ระหว่าง starting: หา port ที่ process tree เรา listen อยู่ → auto-detect + promote เป็น running
  _promoteStarting(service, rt) {
    // ถ้ารู้ port อยู่แล้ว (user กรอกเอง) — รอ port นั้นขึ้น listen
    if (service.port) {
      if (this.scanner.isPortListening(service.port)) {
        rt.status = 'running';
        rt.phase = 'ready';
      } else {
        rt.phase = 'waiting-port';
      }
      return;
    }

    // ยังไม่รู้ port — หา listening port ที่ owner อยู่ใน process tree ของเรา
    const treePids = new Set(this.scanner.treePids(rt.pid));
    const owned = this.scanner.ports.find((p) => treePids.has(p.pid));
    if (owned) {
      // เจอแล้ว! จำ port ไว้ (persist) แล้ว promote
      service.port = owned.port;
      saveServices(this.services);
      this.emit('services');
      rt.status = 'running';
      rt.phase = 'ready';
      this._emitLog(service.id, this._logBuffer(service.id).pushSystem(`🔌 detected port ${owned.port}`));
    } else {
      rt.phase = 'waiting-port';
      // service ที่ไม่มี web port (เช่น worker/bot) จะไม่มีวันเจอ — หลัง 8 วิ ถือว่า running เลย
      if (Date.now() - rt.startedAt > 8000) {
        rt.status = 'running';
        rt.phase = 'ready';
      }
    }
  }

  _emitStatus(id, onlyIfChanged = false) {
    const state = this.statusOf(id);
    // dedup ด้วย status + phase (phase เปลี่ยนตอน starting ต้อง broadcast ด้วย)
    const key = `${state.status}:${state.phase ?? ''}`;
    if (onlyIfChanged && this.lastStatus.get(id) === key) return;
    this.lastStatus.set(id, key);
    this.emit('status', { id, ...state });
  }

  _emitLog(id, entry) {
    this.emit('log', { id, ...entry });
  }
}

function killTree(pid) {
  return new Promise((resolve) => treeKill(pid, 'SIGTERM', () => resolve()));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
