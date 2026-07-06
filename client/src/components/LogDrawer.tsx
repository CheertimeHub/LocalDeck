import { useEffect, useRef, useState } from 'react';
import type { LogEntry, ServiceView } from '../types';
import { api } from '../api';

const STREAM_COLOR: Record<LogEntry['stream'], string> = {
  stdout: 'text-neutral-300',
  stderr: 'text-red-300',
  system: 'text-sky-400',
};

interface Props {
  service: ServiceView;
  logs: LogEntry[];
  onClear: () => void;
  onClose: () => void;
}

export function LogDrawer({ service, logs, onClear, onClose }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);

  useEffect(() => {
    if (stick && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [logs, stick]);

  const onScroll = () => {
    const el = bodyRef.current;
    if (el) setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex h-[45vh] flex-col border-t border-neutral-800 bg-neutral-950 shadow-2xl">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
        <div className="flex flex-col text-sm">
          <span className="font-semibold text-neutral-100">📄 {service.name}</span>
          <span className="font-mono text-xs text-neutral-500">{service.command}</span>
        </div>
        <div className="flex items-center gap-2">
          {!stick && (
            <button
              type="button"
              onClick={() => setStick(true)}
              className="rounded px-2 py-1 text-xs text-amber-400 hover:bg-neutral-800"
            >
              ↓ กลับไปล่างสุด
            </button>
          )}
          <button
            type="button"
            onClick={() => { api.clearLogs(service.id); onClear(); }}
            className="rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800"
          >
            Clear
          </button>
          <button type="button" onClick={onClose} className="rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800">
            ✕ Close
          </button>
        </div>
      </div>
      <div ref={bodyRef} onScroll={onScroll} className="flex-1 overflow-auto p-3 font-mono text-xs leading-5">
        {logs.length === 0 && <p className="text-neutral-600">ยังไม่มี log — กด ▶ Start เพื่อรัน service</p>}
        {logs.map((entry, i) => (
          <div key={i} className="flex gap-3 hover:bg-neutral-900">
            <span className="shrink-0 select-none text-neutral-600">
              {new Date(entry.ts).toLocaleTimeString('th-TH', { hour12: false })}
            </span>
            <span className={`whitespace-pre-wrap break-all ${STREAM_COLOR[entry.stream]}`}>{entry.line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
