import type { ServiceStatus, ServiceView } from '../types';
import { formatBytes } from '../api';

const STATUS_STYLE: Record<ServiceStatus, { dot: string; label: string; text: string }> = {
  running: { dot: 'bg-emerald-400', label: 'Running', text: 'text-emerald-400' },
  external: { dot: 'bg-sky-400', label: 'Running (external)', text: 'text-sky-400' },
  starting: { dot: 'bg-amber-400 animate-pulse', label: 'Starting…', text: 'text-amber-400' },
  crashed: { dot: 'bg-red-500', label: 'Crashed', text: 'text-red-400' },
  stopped: { dot: 'bg-neutral-600', label: 'Stopped', text: 'text-neutral-500' },
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

function IconButton({
  title,
  onClick,
  disabled,
  className = '',
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-8 items-center justify-center rounded-md border border-neutral-800 bg-neutral-900 text-sm text-neutral-300 transition hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-30 ${className}`}
    >
      {children}
    </button>
  );
}

export function ServiceCard({ service, busy, onAction, onLogs, onEdit, onDelete, onOpenFolder, onTogglePin }: Props) {
  const style = STATUS_STYLE[service.status];
  const isUp = service.status === 'running' || service.status === 'starting' || service.status === 'external';
  const canStart = service.status === 'stopped' || service.status === 'crashed';

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 transition hover:border-neutral-700">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
            <h3 className="truncate font-semibold text-neutral-100">{service.name}</h3>
          </div>
          <p className="mt-0.5 truncate text-xs text-neutral-500">{service.type || service.command}</p>
        </div>
        <div className="flex gap-1">
          <IconButton
            title={service.pinned ? 'Unpin' : 'Pin to top'}
            onClick={onTogglePin}
            className={`h-7 w-7 border-transparent bg-transparent ${service.pinned ? 'text-amber-400' : 'text-neutral-600 hover:text-amber-400'}`}
          >
            {service.pinned ? '★' : '☆'}
          </IconButton>
          <IconButton title="Edit" onClick={onEdit} className="h-7 w-7 border-transparent bg-transparent">✎</IconButton>
          <IconButton title="Delete" onClick={onDelete} className="h-7 w-7 border-transparent bg-transparent hover:text-red-400">🗑</IconButton>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className={style.text}>
          {style.label}
          {service.status === 'crashed' && service.exitCode != null && ` (exit ${service.exitCode})`}
        </span>
        {service.port && (
          <a
            href={`http://localhost:${service.port}`}
            target="_blank"
            rel="noreferrer"
            className={`font-mono text-xs ${isUp ? 'text-sky-400 hover:underline' : 'pointer-events-none text-neutral-600'}`}
          >
            localhost:{service.port}
          </a>
        )}
      </div>

      <div className="flex gap-4 font-mono text-xs text-neutral-400">
        <span title="CPU">📊 {isUp && service.stats ? `${service.stats.cpu}%` : '–'}</span>
        <span title="RAM">🧠 {isUp && service.stats ? formatBytes(service.stats.memory) : '–'}</span>
        {isUp && service.stats && (
          <span title="Processes in tree" className="text-neutral-600">{service.stats.processCount} proc</span>
        )}
      </div>

      <div className="flex items-center gap-1.5 border-t border-neutral-800 pt-3">
        {canStart ? (
          <IconButton title="Start" onClick={() => onAction('start')} disabled={!!busy} className="text-emerald-400">
            {busy === 'start' ? '…' : '▶'}
          </IconButton>
        ) : (
          <IconButton title="Stop" onClick={() => onAction('stop')} disabled={!!busy} className="text-red-400">
            {busy === 'stop' ? '…' : '■'}
          </IconButton>
        )}
        <IconButton title="Restart" onClick={() => onAction('restart')} disabled={!!busy || service.status === 'external'}>
          {busy === 'restart' ? '…' : '↻'}
        </IconButton>
        <IconButton title="Logs" onClick={onLogs}>📄</IconButton>
        <IconButton
          title="Open in browser"
          onClick={() => window.open(`http://localhost:${service.port}`, '_blank')}
          disabled={!service.port || !isUp}
        >
          🌐
        </IconButton>
        <IconButton title="Open folder" onClick={() => onOpenFolder()}>📂</IconButton>
        <IconButton title="Open in VS Code" onClick={() => onOpenFolder('code')} className="font-mono text-[10px]">
          {'</>'}
        </IconButton>
      </div>
    </div>
  );
}
