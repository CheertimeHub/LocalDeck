import { useCallback, useRef, useState } from 'react';
import type { LogEntry, PortInfo, ServerMessage, ServiceView } from './types';
import { api } from './api';
import { useWebSocket } from './hooks/useWebSocket';
import { ServiceCard, type ServiceAction } from './components/ServiceCard';
import { AddServiceModal } from './components/AddServiceModal';
import { LogDrawer } from './components/LogDrawer';
import { PortsPanel } from './components/PortsPanel';
import { Onboarding } from './components/Onboarding';

const MAX_CLIENT_LOGS = 2000;

export default function App() {
  const [services, setServices] = useState<ServiceView[]>([]);
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [logServiceId, setLogServiceId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [modal, setModal] = useState<{ open: boolean; edit: ServiceView | null }>({ open: false, edit: null });
  const [busy, setBusy] = useState<Record<string, string>>({});
  const logIdRef = useRef<string | null>(null);
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
            const next = { ...s, status: msg.status, phase: msg.phase, pid: msg.pid, exitCode: msg.exitCode };
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

  // จัดกลุ่มการ์ดตาม group — service ที่ไม่มี group ไปรวมกลุ่ม '' (แสดงท้ายสุด ไม่มีหัวข้อ)
  const grouped = new Map<string, ServiceView[]>();
  for (const s of services) {
    const key = s.group || '';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(s);
  }
  const groupNames = [...grouped.keys()].filter((g) => g).sort((a, b) => a.localeCompare(b));
  // เรียง: group ที่ตั้งชื่อไว้ (เรียงตามตัวอักษร) ก่อน แล้วค่อยพวกไม่มี group
  const groupOrder = [...groupNames, ...(grouped.has('') ? [''] : [])];

  return (
    <div className="min-h-screen text-neutral-200" style={{ paddingBottom: logService ? '48vh' : 0 }}>
      <header className="sticky top-0 z-20 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-neutral-100">🚀 LocalDeck</h1>
            <span
              className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-500 animate-pulse'}`}
              title={connected ? 'connected' : 'reconnecting…'}
            />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-500">
              <span className="text-emerald-400">{running} running</span>
              {' · '}
              {services.length - running} stopped
            </span>
            <button
              type="button"
              onClick={() => setModal({ open: true, edit: null })}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
            >
              + Add Service
            </button>
          </div>
        </div>
      </header>

      <main className="space-y-8 px-6 py-6">
        {services.length === 0 ? (
          <Onboarding onImported={() => {}} />
        ) : (
          groupOrder.map((group) => {
            const items = grouped.get(group)!;
            const upCount = items.filter((s) => s.status === 'running' || s.status === 'external').length;
            // ตัวที่ start ได้ (stopped/crashed) และตัวที่ stop ได้ (กำลังทำงาน)
            const startable = items.filter((s) => s.status === 'stopped' || s.status === 'crashed').map((s) => s.id);
            const stoppable = items.filter((s) => s.status === 'running' || s.status === 'starting' || s.status === 'external').map((s) => s.id);
            const label = group || 'Ungrouped';
            return (
              <section key={group || '__ungrouped__'} className="group/section space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className={`flex items-center gap-2 text-sm font-semibold ${group ? 'text-neutral-300' : 'text-neutral-500'}`}>
                    <span>{group ? `📁 ${label}` : label}</span>
                    <span className="text-xs font-normal text-neutral-600">{upCount}/{items.length} up</span>
                  </h2>
                  {/* ปุ่มทั้งกลุ่ม — โผล่ตอน hover เท่านั้น ไม่ให้ UI รก */}
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/section:opacity-100">
                    {startable.length > 0 && (
                      <button
                        type="button"
                        onClick={() => groupAction(startable, 'start')}
                        className="rounded px-2 py-0.5 text-xs text-emerald-400 hover:bg-emerald-500/10"
                      >
                        ▶ Start all
                      </button>
                    )}
                    {stoppable.length > 0 && (
                      <button
                        type="button"
                        onClick={() => groupAction(stoppable, 'stop')}
                        className="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-red-500/10"
                      >
                        ■ Stop all
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {items.map((service) => (
                    <ServiceCard
                      key={service.id}
                      service={service}
                      busy={busy[service.id] ?? null}
                      onAction={(action) => doAction(service.id, action)}
                      onLogs={() => openLogs(service.id)}
                      onEdit={() => setModal({ open: true, edit: service })}
                      onDelete={() => deleteService(service)}
                      onOpenFolder={(app) => api.openFolder(service.id, app).catch((err) => alert(err.message))}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}

        <PortsPanel ports={ports} />
      </main>

      {logService && <LogDrawer service={logService} logs={logs} onClear={() => setLogs([])} onClose={closeLogs} />}
      {modal.open && <AddServiceModal edit={modal.edit} groups={groupNames} onClose={() => setModal({ open: false, edit: null })} />}
    </div>
  );
}
