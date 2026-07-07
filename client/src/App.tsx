import { useCallback, useRef, useState } from 'react';
import type { LogEntry, PortInfo, ServerMessage, ServiceView } from './types';
import { api } from './api';
import { useWebSocket } from './hooks/useWebSocket';
import { ServiceCard, type ServiceAction } from './components/ServiceCard';
import { AddServiceModal } from './components/AddServiceModal';
import { LogDrawer } from './components/LogDrawer';
import { PortsPanel } from './components/PortsPanel';
import { Onboarding } from './components/Onboarding';
import { Input, StatusDot } from './ui';
import { Terminal, Search, Plus, Star, Folder, Play, Square } from './ui/icons';

const MAX_CLIENT_LOGS = 2000;

export default function App() {
  const [services, setServices] = useState<ServiceView[]>([]);
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [logServiceId, setLogServiceId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [modal, setModal] = useState<{ open: boolean; edit: ServiceView | null; prefill?: Partial<ServiceView> }>({ open: false, edit: null });
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState(false);
  const logIdRef = useRef<string | null>(null);
  const dragDepth = useRef(0); // นับ dragenter/leave กัน overlay กระพริบตอนลากผ่าน element ลูก
  const openedRef = useRef<Set<string>>(new Set()); // service ที่ auto-open browser ไปแล้ว (กันเปิดซ้ำ)

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'init':
        setServices(msg.services);
        setPorts(msg.ports);
        break;
      case 'services':
        setServices((prev) =>
          msg.services.map((s) => ({ ...s, stats: prev.find((p) => p.id === s.id)?.stats })),
        );
        break;
      case 'status':
        setServices((prev) =>
          prev.map((s) => {
            if (s.id !== msg.id) return s;
            const next = { ...s, status: msg.status, phase: msg.phase, pid: msg.pid, exitCode: msg.exitCode, port: msg.port ?? s.port };
            // auto-open browser: พอ running + ติ๊กไว้ + มี port + ยังไม่เคยเปิดในรอบนี้
            // (port ถูก auto-detect แล้ว persist ผ่าน services message ก่อนหน้า)
            if (next.status === 'running' && next.openOnReady && next.port && !openedRef.current.has(s.id)) {
              openedRef.current.add(s.id);
              window.open(`http://localhost:${next.port}`, '_blank');
            }
            // reset ตอนหยุด เพื่อให้รอบ start หน้าเปิดได้อีก
            if (next.status === 'stopped' || next.status === 'crashed') openedRef.current.delete(s.id);
            return next;
          }),
        );
        break;
      case 'stats':
        setServices((prev) => prev.map((s) => ({ ...s, stats: msg.stats[s.id] })));
        break;
      case 'ports':
        setPorts(msg.ports);
        break;
      case 'log':
        if (msg.id === logIdRef.current) {
          setLogs((prev) => [...prev.slice(-MAX_CLIENT_LOGS + 1), { ts: msg.ts, stream: msg.stream, line: msg.line }]);
        }
        break;
    }
  }, []);

  const connected = useWebSocket(handleMessage);

  const doAction = async (id: string, action: ServiceAction) => {
    setBusy((b) => ({ ...b, [id]: action }));
    try {
      await api[action](id);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy((b) => {
        const { [id]: _, ...rest } = b;
        return rest;
      });
    }
  };

  // start/stop ทั้งกลุ่มทีเดียว — mark ทุกตัว busy แล้วยิง bulk
  const groupAction = async (ids: string[], action: 'start' | 'stop') => {
    setBusy((b) => ({ ...b, ...Object.fromEntries(ids.map((id) => [id, action])) }));
    try {
      const { errors } = await api.bulkAction(ids, action);
      if (errors.length) alert(errors.map((e) => e.error).join('\n'));
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy((b) => {
        const rest = { ...b };
        for (const id of ids) delete rest[id];
        return rest;
      });
    }
  };

  // ปัก/ถอนหมุด — ส่ง patch แค่ pinned, server merge กับ service เดิม (state อัปเดตผ่าน services message)
  const togglePin = async (service: ServiceView) => {
    try {
      await api.updateService(service.id, { ...service, pinned: !service.pinned });
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // ลากโฟลเดอร์เข้ามา → หา path → scan → เปิด modal เติมให้ (ลาก package.json ก็เอา dir แม่)
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files[0] as (File & { path?: string }) | undefined;
    // browser ปกติไม่ให้ absolute path ของ drop — ถ้าไม่มี path ให้เปิด folder picker แทน
    let dropped = file?.path ?? '';
    if (dropped && /\.[a-z]+$/i.test(dropped)) dropped = dropped.replace(/[\\/][^\\/]+$/, ''); // ไฟล์ → dir แม่
    try {
      if (!dropped) {
        const picked = await api.pickFolder();
        dropped = picked.cwd ?? '';
        if (!dropped) return;
      }
      const { projects } = await api.scanFolder(dropped);
      const p = projects[0];
      if (p) {
        // เปิด modal (add ใหม่) พร้อม prefill ข้อมูลโปรเจกต์ที่ scan เจอ ให้ user ยืนยัน/แก้ก่อน add
        setModal({ open: true, edit: null, prefill: { name: p.name, type: p.type, cwd: p.cwd, command: p.command } });
      } else {
        alert('ไม่เจอโปรเจกต์ในโฟลเดอร์ที่ลากมา');
      }
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const openLogs = async (id: string) => {
    logIdRef.current = id;
    setLogServiceId(id);
    setLogs(await api.logs(id));
  };

  const closeLogs = () => {
    logIdRef.current = null;
    setLogServiceId(null);
    setLogs([]);
  };

  const deleteService = async (service: ServiceView) => {
    if (!confirm(`ลบ "${service.name}" ออกจาก dashboard?`)) return;
    try {
      await api.deleteService(service.id);
      if (logServiceId === service.id) closeLogs();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const running = services.filter((s) => s.status === 'running' || s.status === 'external').length;
  const logService = services.find((s) => s.id === logServiceId) ?? null;

  // filter ตามช่องค้นหา (name / group / type)
  const q = query.trim().toLowerCase();
  const filtered = q
    ? services.filter((s) => `${s.name} ${s.group} ${s.type}`.toLowerCase().includes(q))
    : services;

  // pinned ขึ้น section ⭐ Favorites (ไม่ซ้ำในกลุ่ม); ที่เหลือจัดกลุ่มตาม group
  const favorites = filtered.filter((s) => s.pinned);
  const grouped = new Map<string, ServiceView[]>();
  for (const s of filtered) {
    if (s.pinned) continue;
    const key = s.group || '';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(s);
  }
  const groupNames = [...grouped.keys()].filter((g) => g).sort((a, b) => a.localeCompare(b));
  // เรียง: group ที่ตั้งชื่อไว้ (เรียงตามตัวอักษร) ก่อน แล้วค่อยพวกไม่มี group
  const groupOrder = [...groupNames, ...(grouped.has('') ? [''] : [])];

  const renderCard = (service: ServiceView) => (
    <ServiceCard
      key={service.id}
      service={service}
      busy={busy[service.id] ?? null}
      onAction={(action) => doAction(service.id, action)}
      onLogs={() => openLogs(service.id)}
      onEdit={() => setModal({ open: true, edit: service })}
      onDelete={() => deleteService(service)}
      onOpenFolder={(app) => api.openFolder(service.id, app).catch((err) => alert(err.message))}
      onTogglePin={() => togglePin(service)}
    />
  );

  return (
    <div
      className="min-h-screen text-neutral-200"
      style={{ paddingBottom: logService ? '48vh' : 0 }}
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          dragDepth.current++;
          setDragging(true);
        }
      }}
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current--;
        if (dragDepth.current <= 0) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-sky-950/40 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-sky-400 bg-neutral-900/90 px-10 py-8 text-center">
            <Folder size={36} className="mx-auto text-sky-400" />
            <p className="mt-3 font-semibold text-sky-300">วางโฟลเดอร์โปรเจกต์ที่นี่</p>
            <p className="mt-1 text-xs text-neutral-400">เราจะสแกนแล้วเดา command ให้เอง</p>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-20 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2.5">
            <Terminal size={20} className="text-sky-400" />
            <h1 className="font-mono text-lg font-black text-neutral-100">LocalDeck</h1>
            <StatusDot
              className={connected ? 'bg-emerald-400' : 'bg-red-500'}
              pulse={!connected}
            />
          </div>
          <div className="flex items-center gap-4">
            {services.length > 0 && (
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-600" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search services, ports…"
                  className="w-56 pl-8"
                />
              </div>
            )}
            <span className="font-mono text-sm text-neutral-500">
              <span className="text-emerald-400">{running} running</span>
              {' · '}
              {services.length - running} stopped
            </span>
            <button
              type="button"
              onClick={() => setModal({ open: true, edit: null })}
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
            >
              <Plus size={16} /> New
            </button>
          </div>
        </div>
      </header>

      <main className="space-y-8 px-6 py-6">
        {services.length === 0 ? (
          <Onboarding onImported={() => {}} />
        ) : (
          <>
            {q && filtered.length === 0 && (
              <p className="text-center text-sm text-neutral-500">ไม่เจอ service ที่ตรงกับ "{query}"</p>
            )}
            {favorites.length > 0 && (
              <section className="space-y-3">
                <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-400">
                  <Star size={13} className="fill-amber-400" /> Favorites
                  <span className="font-normal normal-case tracking-normal text-neutral-600">{favorites.length}</span>
                </h2>
                <div className="grid grid-flow-row-dense items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {favorites.map(renderCard)}
                </div>
              </section>
            )}
            {groupOrder.map((group) => {
            const items = grouped.get(group)!;
            const upCount = items.filter((s) => s.status === 'running' || s.status === 'external').length;
            // ตัวที่ start ได้ (stopped/crashed) และตัวที่ stop ได้ (กำลังทำงาน)
            const startable = items.filter((s) => s.status === 'stopped' || s.status === 'crashed').map((s) => s.id);
            const stoppable = items.filter((s) => s.status === 'running' || s.status === 'starting' || s.status === 'external').map((s) => s.id);
            const label = group || 'Ungrouped';
            return (
              <section key={group || '__ungrouped__'} className="group/section space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    {group && <Folder size={13} className="text-neutral-600" />}
                    {label}
                    <span className="font-normal normal-case tracking-normal text-neutral-600">{upCount}/{items.length} up</span>
                  </h2>
                  {/* ปุ่มทั้งกลุ่ม — โผล่ตอน hover เท่านั้น ไม่ให้ UI รก */}
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/section:opacity-100">
                    {startable.length > 0 && (
                      <button
                        type="button"
                        onClick={() => groupAction(startable, 'start')}
                        className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-emerald-400 hover:bg-emerald-500/10"
                      >
                        <Play size={11} /> Start all
                      </button>
                    )}
                    {stoppable.length > 0 && (
                      <button
                        type="button"
                        onClick={() => groupAction(stoppable, 'stop')}
                        className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-red-400 hover:bg-red-500/10"
                      >
                        <Square size={10} /> Stop all
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-flow-row-dense items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {items.map(renderCard)}
                </div>
              </section>
            );
            })}
          </>
        )}

        <PortsPanel ports={ports} />
      </main>

      {logService && <LogDrawer service={logService} logs={logs} onClear={() => setLogs([])} onClose={closeLogs} />}
      {modal.open && <AddServiceModal edit={modal.edit} prefill={modal.prefill} groups={groupNames} allServices={services} onClose={() => setModal({ open: false, edit: null })} />}
    </div>
  );
}
