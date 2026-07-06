import { useState } from 'react';
import type { ServiceView } from '../types';
import { api } from '../api';

interface Props {
  edit: ServiceView | null;
  groups: string[];
  onClose: () => void;
}

const FIELD =
  'w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-sky-500';

export function AddServiceModal({ edit, groups, onClose }: Props) {
  const [form, setForm] = useState({
    name: edit?.name ?? '',
    type: edit?.type ?? '',
    group: edit?.group ?? '',
    cwd: edit?.cwd ?? '',
    command: edit?.command ?? '',
    port: edit?.port ? String(edit.port) : '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const browseFolder = async () => {
    setPicking(true);
    setError('');
    try {
      const { cwd } = await api.pickFolder(form.cwd);
      if (cwd) setForm((f) => ({ ...f, cwd }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPicking(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const input = { ...form, port: form.port ? Number(form.port) : null };
      if (edit) await api.updateService(edit.id, input);
      else await api.addService(input);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-neutral-100">{edit ? 'Edit Service' : 'Add Service'}</h2>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-neutral-400">Name *</span>
            <input className={FIELD} value={form.name} onChange={set('name')} placeholder="Frontend" required />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-neutral-400">Type</span>
            <input className={FIELD} value={form.type} onChange={set('type')} placeholder="React + Vite" />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs text-neutral-400">Project / Group</span>
          <input className={FIELD} value={form.group} onChange={set('group')} placeholder="Project A" list="localdeck-groups" />
          <datalist id="localdeck-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-neutral-400">Folder *</span>
          <div className="flex gap-2">
            <input className={`${FIELD} font-mono`} value={form.cwd} onChange={set('cwd')} placeholder="C:\Projects\my-app" required />
            <button
              type="button"
              onClick={browseFolder}
              disabled={picking}
              className="shrink-0 rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:border-sky-500 hover:text-neutral-100 disabled:opacity-50"
            >
              {picking ? '…' : 'Browse'}
            </button>
          </div>
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-neutral-400">Command *</span>
          <input className={`${FIELD} font-mono`} value={form.command} onChange={set('command')} placeholder="npm run dev" required />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-neutral-400">Port (ใช้เช็คสถานะ + เปิด browser)</span>
          <input className={`${FIELD} font-mono`} value={form.port} onChange={set('port')} placeholder="5173" type="number" min="1" max="65535" />
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {saving ? 'Saving…' : edit ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  );
}
