import http from 'node:http';
import { spawn, execFile } from 'node:child_process';
import express from 'express';
import { WebSocketServer } from 'ws';
import treeKill from 'tree-kill';
import { PortScanner } from './portScanner.js';
import { ServiceManager, httpError } from './serviceManager.js';
import { StatsCollector } from './statsCollector.js';

const PORT = process.env.LOCALDECK_PORT ? Number(process.env.LOCALDECK_PORT) : 4600;

const scanner = new PortScanner(3000);
const manager = new ServiceManager(scanner);
const stats = new StatsCollector(scanner, manager);

// ---- ตาราง ports พร้อมชื่อ process และ service ที่ผูกอยู่ ----

function enrichedPorts() {
  const treeCache = new Map();
  const owner = (pid, port) => {
    for (const service of manager.services) {
      const rt = manager.runtime.get(service.id);
      if (rt?.child) {
        if (!treeCache.has(service.id)) treeCache.set(service.id, new Set(scanner.treePids(rt.pid)));
        if (treeCache.get(service.id).has(pid)) return service.name;
      }
      if (service.port === port) return service.name;
    }
    return null;
  };
  return scanner.ports.map((p) => ({
    ...p,
    process: scanner.processes.get(p.pid)?.name ?? '',
    service: owner(p.pid, p.port),
  }));
}

// ---- เปิด native folder picker แล้วคืน absolute path ----

// รัน FolderBrowserDialog ผ่าน STA thread (Windows.Forms ต้องการ STA)
// พิมพ์ path ที่เลือกออก stdout; ถ้ากด Cancel ไม่พิมพ์อะไร → คืน null
const PICK_SCRIPT = (initial) => `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select project folder'
${initial ? `if (Test-Path -LiteralPath '${initial.replace(/'/g, "''")}') { $dialog.SelectedPath = '${initial.replace(/'/g, "''")}' }` : ''}
$dialog.ShowNewFolderButton = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }
`;

function pickFolder(initial) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-STA', '-Command', PICK_SCRIPT(initial)],
      { windowsHide: true },
      (err, stdout) => {
        if (err) return reject(err);
        const cwd = stdout.trim();
        resolve({ cwd: cwd || null });
      },
    );
  });
}

// ---- REST API ----

const app = express();
app.use(express.json());

const wrap = (fn) => async (req, res) => {
  try {
    const result = await fn(req);
    res.json(result ?? { ok: true });
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
};

app.get('/api/services', wrap(() => manager.list()));
app.post('/api/services', wrap((req) => manager.addService(req.body)));
app.put('/api/services/:id', wrap((req) => manager.updateService(req.params.id, req.body)));
app.delete('/api/services/:id', wrap((req) => manager.removeService(req.params.id)));

app.post('/api/services/:id/start', wrap((req) => manager.start(req.params.id)));
app.post('/api/services/:id/stop', wrap((req) => manager.stop(req.params.id)));
app.post('/api/services/:id/restart', wrap((req) => manager.restart(req.params.id)));

app.get('/api/services/:id/logs', wrap((req) => manager.logs.get(req.params.id)?.get() ?? []));
app.delete('/api/services/:id/logs', wrap((req) => manager.logs.get(req.params.id)?.clear()));

app.get('/api/ports', wrap(() => enrichedPorts()));
app.post('/api/ports/:pid/kill', wrap(async (req) => {
  const pid = Number(req.params.pid);
  if (!pid || pid === process.pid) throw httpError(400, 'invalid pid');
  await new Promise((resolve) => treeKill(pid, 'SIGTERM', () => resolve()));
}));

app.post('/api/services/:id/open-folder', wrap((req) => {
  const service = manager.getService(req.params.id);
  if (!service) throw httpError(404, 'service not found');
  if (req.query.app === 'code') {
    spawn('cmd', ['/c', 'code', '.'], { cwd: service.cwd, windowsHide: true, detached: true }).unref();
  } else {
    // explorer คืน exit code 1 เสมอ ไม่ต้องเช็ค
    spawn('explorer', [service.cwd], { windowsHide: true, detached: true }).unref();
  }
}));

// เปิด Windows folder picker บนเครื่องที่ server รันอยู่ แล้วคืน absolute path ที่เลือก
// (dialog เด้งบนเครื่อง server — ใช้ได้เพราะ LocalDeck ออกแบบให้ server = เครื่องผู้ใช้)
app.post('/api/pick-folder', wrap((req) => pickFolder(req.body?.initial)));

// ---- WebSocket: push สถานะ/logs/stats/ports แบบ real-time ----

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(data);
  }
}

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'init', services: manager.list(), ports: enrichedPorts() }));
});

manager.on('status', (payload) => broadcast({ type: 'status', ...payload }));
manager.on('services', () => broadcast({ type: 'services', services: manager.list() }));
manager.on('log', (payload) => broadcast({ type: 'log', ...payload }));
stats.on('stats', (payload) => broadcast({ type: 'stats', stats: payload }));
scanner.on('scan', () => broadcast({ type: 'ports', ports: enrichedPorts() }));
scanner.on('error', (err) => console.error('[scanner]', err.message));

scanner.start();
server.listen(PORT, () => {
  console.log(`LocalDeck server listening on http://localhost:${PORT}`);
});

// ปิด server → หยุดทุก service ที่เราสั่งรันไว้ด้วย จะได้ไม่มี process ค้าง
async function shutdown() {
  console.log('shutting down, stopping managed services...');
  await Promise.allSettled(
    [...manager.runtime.entries()]
      .filter(([, rt]) => rt.child)
      .map(([id]) => manager.stop(id)),
  );
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
