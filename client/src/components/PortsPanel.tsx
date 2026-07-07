import { useState } from 'react';
import type { PortInfo } from '../types';
import { api } from '../api';

// PID ระบบที่ไม่ควรให้ kill จากหน้าเว็บ
const PROTECTED = new Set([0, 4]);
const PROTECTED_NAMES = new Set(['svchost.exe', 'lsass.exe', 'services.exe', 'wininit.exe', 'System']);

export function PortsPanel({ ports }: { ports: PortInfo[] }) {
  const [killing, setKilling] = useState<number | null>(null);

  const kill = async (p: PortInfo) => {
    if (!confirm(`Kill ${p.process || 'pid ' + p.pid} (port ${p.port})?`)) return;
    setKilling(p.pid);
    try {
      await api.killPid(p.pid);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setKilling(null);
    }
  };

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
        Listening Ports <span className="ml-1 font-normal text-neutral-600">({ports.length})</span>
      </h2>
      <div className="no-scrollbar max-h-[40vh] overflow-auto rounded-lg border border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-neutral-800 bg-neutral-900 text-xs uppercase tracking-wider text-neutral-500">
              <th className="px-4 py-2.5 font-medium">Port</th>
              <th className="px-4 py-2.5 font-medium">Process</th>
              <th className="px-4 py-2.5 font-medium">PID</th>
              <th className="px-4 py-2.5 font-medium">Service</th>
              <th className="px-4 py-2.5 font-medium">Address</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {ports.map((p) => {
              const protectedPid = PROTECTED.has(p.pid) || PROTECTED_NAMES.has(p.process);
              return (
                <tr key={`${p.port}-${p.pid}`} className="border-b border-neutral-800/60 last:border-0 hover:bg-neutral-900/50">
                  <td className="px-4 py-2 font-mono text-sky-400">
                    <a href={`http://localhost:${p.port}`} target="_blank" rel="noreferrer" className="hover:underline">
                      {p.port}
                    </a>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-neutral-300">{p.process || '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs text-neutral-500">{p.pid}</td>
                  <td className="px-4 py-2 text-xs">
                    {p.service ? (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-400">{p.service}</span>
                    ) : (
                      <span className="text-neutral-600">external</span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-neutral-600">{p.address}</td>
                  <td className="px-4 py-2 text-right">
                    {!protectedPid && (
                      <button
                        type="button"
                        onClick={() => kill(p)}
                        disabled={killing === p.pid}
                        className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                      >
                        {killing === p.pid ? '…' : 'kill'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
