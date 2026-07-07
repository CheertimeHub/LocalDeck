import { useState } from 'react';
import type { ServiceStatus, ServiceView } from '../types';
import { formatBytes } from '../api';
import { Badge, IconButton, StatusDot } from '../ui';
import {
  Play, Square, RotateCw, ScrollText, Globe, FolderOpen, SquareTerminal,
  Star, Pencil, Trash2, Cpu, MemoryStick, Hash,
} from '../ui/icons';

// สี + label ของแต่ละสถานะ — external ใช้ visuals เดียวกับ running (เขียว) แล้วโชว์ badge แยก
const STATUS_STYLE: Record<ServiceStatus, { dot: string; label: string; text: string }> = {
  running:  { dot: 'bg-emerald-400',             label: 'Running',   text: 'text-emerald-400' },
  external: { dot: 'bg-emerald-400',             label: 'Running',   text: 'text-emerald-400' },
  starting: { dot: 'bg-amber-400 animate-pulse', label: 'Starting',  text: 'text-amber-400' },
  crashed:  { dot: 'bg-red-500',                 label: 'Crashed',   text: 'text-red-400' },
  stopped:  { dot: 'bg-neutral-600',             label: 'Stopped',   text: 'text-neutral-500' },
};

export type ServiceAction = 'start' | 'stop' | 'restart';

interface Props {
  service: ServiceView;
  busy: string | null;
  onAction: (action: ServiceAction) => void;
  onLogs: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenFolder: (app?: 'code') => void;
  onTogglePin: () => void;
}

export function ServiceCard({ service, busy, onAction, onLogs, onEdit, onDelete, onOpenFolder, onTogglePin }: Props) {
  const [expanded, setExpanded] = useState(false);
  const style = STATUS_STYLE[service.status];
  const isUp = service.status === 'running' || service.status === 'starting' || service.status === 'external';
  const canStart = service.status === 'stopped' || service.status === 'crashed';

  return (
    <div className="group flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 transition hover:border-neutral-700">
      {/* ---- แถวบน: ชื่อ + status (เห็นตลอด) + ปุ่มจัดการ ---- */}
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => setExpanded((e) => !e)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <StatusDot className={style.dot} pulse={service.status === 'starting'} />
            <h3 className="truncate text-base font-bold tracking-tight text-neutral-100">{service.name}</h3>
            {service.status === 'external' && <Badge tone="info">External</Badge>}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className={`text-[11px] font-medium uppercase tracking-wider ${style.text}`}>
              {style.label}
              {service.status === 'crashed' && service.exitCode != null && ` · exit ${service.exitCode}`}
            </span>
            {service.port && isUp && (
              <a
                href={`http://localhost:${service.port}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-neutral-400 hover:text-sky-400 hover:underline"
              >
                :{service.port}
              </a>
            )}
          </div>
        </button>
        <div className="flex gap-0.5">
          <IconButton
            icon={Star}
            title={service.pinned ? 'Unpin' : 'Pin to top'}
            onClick={onTogglePin}
            className={service.pinned ? 'text-amber-400 hover:text-amber-300' : 'hover:text-amber-400'}
          />
          <IconButton icon={Pencil} title="Edit" onClick={onEdit} />
          <IconButton icon={Trash2} title="Delete" onClick={onDelete} className="hover:text-red-400" />
        </div>
      </div>

      {/* ---- ระดับ 2: CPU/RAM/PID (โผล่ตอน hover หรือตอน expand) ---- */}
      <div
        className={`flex gap-4 font-mono text-xs text-neutral-500 transition-opacity ${
          expanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <span className="flex items-center gap-1" title="CPU">
          <Cpu size={13} /> {isUp && service.stats ? `${service.stats.cpu}%` : '–'}
        </span>
        <span className="flex items-center gap-1" title="RAM">
          <MemoryStick size={13} /> {isUp && service.stats ? formatBytes(service.stats.memory) : '–'}
        </span>
        {isUp && service.pid && (
          <span className="flex items-center gap-1 text-neutral-600" title="PID">
            <Hash size={13} /> {service.pid}
          </span>
        )}
      </div>

      {/* ---- แถวปุ่มหลัก: Start/Stop เด่น + Restart ---- */}
      <div className="flex items-center gap-2">
        {canStart ? (
          <button
            type="button"
            onClick={() => onAction('start')}
            disabled={!!busy}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600/90 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            <Play size={14} /> {busy === 'start' ? 'Starting…' : 'Start'}
          </button>
        ) : service.status === 'external' ? (
          // external = process นอกระบบ — ปุ่มต่างจาก Stop ปกติ (outline) บอกชัดว่าไป kill ของข้างนอก
          <button
            type="button"
            onClick={() => onAction('stop')}
            disabled={!!busy}
            title="Kill this process (running outside LocalDeck)"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-red-500/40 px-3 py-1.5 text-sm font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
          >
            <Square size={13} /> {busy === 'stop' ? 'Killing…' : 'Kill External'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onAction('stop')}
            disabled={!!busy}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
          >
            <Square size={13} /> {busy === 'stop' ? 'Stopping…' : 'Stop'}
          </button>
        )}
        <IconButton
          icon={RotateCw}
          title="Restart"
          onClick={() => onAction('restart')}
          disabled={!!busy || service.status === 'external'}
          className="border border-neutral-800"
        />
      </div>

      {/* ---- ระดับ 3: action รอง (เผยตอนคลิกการ์ด) ---- */}
      {expanded && (
        <div className="flex items-center gap-1 pt-1">
          <IconButton icon={ScrollText} title="Logs" onClick={onLogs} className="border border-neutral-800" />
          <IconButton
            icon={Globe}
            title="Open in browser"
            onClick={() => window.open(`http://localhost:${service.port}`, '_blank')}
            disabled={!service.port || !isUp}
            className="border border-neutral-800"
          />
          <IconButton icon={FolderOpen} title="Open folder" onClick={() => onOpenFolder()} className="border border-neutral-800" />
          <IconButton icon={SquareTerminal} title="Open in VS Code" onClick={() => onOpenFolder('code')} className="border border-neutral-800" />
        </div>
      )}
    </div>
  );
}
