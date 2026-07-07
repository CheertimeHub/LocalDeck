import { useEffect, useRef, useState } from 'react';
import type { LogEntry, ServiceView, StartPhase } from '../types';
import { api } from '../api';
import { ScrollText, ArrowDown, X, Circle, CircleDot, ArrowRight } from '../ui/icons';

const STREAM_COLOR: Record<LogEntry['stream'], string> = {
  stdout: 'text-neutral-300',
  stderr: 'text-red-300',
  system: 'text-sky-400',
};

// timeline ตอน start — 3 step เรียง: starting → waiting-port → ready
const PHASE_STEPS: { key: StartPhase; label: string }[] = [
  { key: 'starting', label: 'Starting' },
  { key: 'waiting-port', label: 'Waiting for port' },
  { key: 'ready', label: 'Ready' },
];

function StartTimeline({ phase }: { phase: StartPhase }) {
  const activeIdx = PHASE_STEPS.findIndex((s) => s.key === phase);
  return (
    <div className="flex items-center gap-2 text-xs">
      {PHASE_STEPS.map((step, i) => {
        const done = i < activeIdx;
        const active = i === activeIdx;
        return (
          <div key={step.key} className="flex items-center gap-2">
            <span className="flex items-center gap-1.5">
              <span className={done ? 'text-emerald-400' : active ? 'text-amber-400' : 'text-neutral-600'}>
                {active ? <CircleDot size={12} className="animate-pulse" /> : <Circle size={12} className={done ? 'fill-emerald-400' : ''} />}
              </span>
              <span className={active ? 'text-amber-300' : done ? 'text-neutral-400' : 'text-neutral-600'}>
                {step.label}
                {active && step.key !== 'ready' && <span className="animate-pulse">…</span>}
              </span>
            </span>
            {i < PHASE_STEPS.length - 1 && <ArrowRight size={12} className="text-neutral-700" />}
          </div>
        );
      })}
    </div>
  );
}

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
    if (!stick) return;
    // รอ DOM paint บรรทัดใหม่ก่อน ไม่งั้น scrollHeight ยังเป็นค่าเก่า → เลื่อนไม่สุด
    const raf = requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [logs, stick]);

  const onScroll = () => {
    const el = bodyRef.current;
    if (el) setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex h-[45vh] flex-col border-t border-neutral-800 bg-neutral-950 shadow-2xl">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
        <div className="flex items-center gap-4">
          <div className="flex flex-col text-sm">
            <span className="flex items-center gap-1.5 font-semibold text-neutral-100">
              <ScrollText size={14} className="text-neutral-500" /> {service.name}
            </span>
            <span className="font-mono text-xs text-neutral-500">{service.command}</span>
          </div>
          {service.status === 'starting' && service.phase && <StartTimeline phase={service.phase} />}
        </div>
        <div className="flex items-center gap-2">
          {!stick && (
            <button
              type="button"
              onClick={() => setStick(true)}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-400 hover:bg-neutral-800"
            >
              <ArrowDown size={12} /> กลับไปล่างสุด
            </button>
          )}
          <button
            type="button"
            onClick={() => { api.clearLogs(service.id); onClear(); }}
            className="rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800"
          >
            Clear
          </button>
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800">
            <X size={12} /> Close
          </button>
        </div>
      </div>
      <div ref={bodyRef} onScroll={onScroll} className="flex-1 overflow-auto p-3 font-mono text-xs leading-5">
        {logs.length === 0 && <p className="text-neutral-600">ยังไม่มี log — กด Start เพื่อรัน service</p>}
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
