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
          prev.map((s) => (s.id === msg.id ? { ...s, status: msg.status, pid: msg.pid, exitCode: msg.exitCode } : s)),
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
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
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

      <main className="mx-auto max-w-6xl space-y-10 px-6 py-8">
        {services.length === 0 ? (
          <Onboarding onImported={() => {}} />
        ) : (
          groupOrder.map((group) => {
            const items = grouped.get(group)!;
            const upCount = items.filter((s) => s.status === 'running' || s.status === 'external').length;
            return (
              <section key={group || '__ungrouped__'} className="space-y-3">
                {group ? (
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-300">
                    <span>📁 {group}</span>
                    <span className="text-xs font-normal text-neutral-600">{upCount}/{items.length} up</span>
                  </h2>
                ) : (
                  groupNames.length > 0 && (
                    <h2 className="text-sm font-semibold text-neutral-500">Ungrouped</h2>
                  )
                )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
