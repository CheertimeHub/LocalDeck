import type { ImportableProcess, LogEntry, PortInfo, ScannedProject, ServiceDef, ServiceView } from './types';

async function req<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as T;
}

const post = (path: string) => req(path, { method: 'POST' });

export type ServiceInput = Omit<ServiceDef, 'id' | 'env'> & { env?: Record<string, string> };

export const api = {
  listServices: () => req<ServiceView[]>('/services'),
  addService: (input: ServiceInput) =>
    req<ServiceDef>('/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  updateService: (id: string, input: ServiceInput) =>
    req<ServiceDef>(`/services/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  deleteService: (id: string) => req(`/services/${id}`, { method: 'DELETE' }),
  start: (id: string) => post(`/services/${id}/start`),
  stop: (id: string) => post(`/services/${id}/stop`),
  restart: (id: string) => post(`/services/${id}/restart`),
  logs: (id: string) => req<LogEntry[]>(`/services/${id}/logs`),
  clearLogs: (id: string) => req(`/services/${id}/logs`, { method: 'DELETE' }),
  ports: () => req<PortInfo[]>('/ports'),
  killPid: (pid: number) => post(`/ports/${pid}/kill`),
  openFolder: (id: string, app?: 'code') => post(`/services/${id}/open-folder${app ? `?app=${app}` : ''}`),
  pickFolder: (initial?: string) =>
    req<{ cwd: string | null }>('/pick-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initial: initial || undefined }),
    }),
  scanFolder: (root: string) =>
    req<{ projects: ScannedProject[] }>('/scan/folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root }),
    }),
  importServices: (services: ServiceInput[]) =>
    req<{ added: ServiceDef[]; errors: { name: string; error: string }[] }>('/services/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ services }),
    }),
  importableProcesses: () => req<ImportableProcess[]>('/processes/importable'),
};

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
