import { useState } from 'react';
import type { ServiceView } from '../types';
import { api } from '../api';
import { ArrowLeft, Globe, FolderSearch, Settings2 } from '../ui/icons';

interface Props {
  edit: ServiceView | null;
  prefill?: Partial<ServiceView>;
  groups: string[];
  allServices: ServiceView[];
  onClose: () => void;
}

const FIELD =
  'w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-sky-500';

type Step = 'choose' | 'form';

export function AddServiceModal({ edit, prefill, groups, allServices, onClose }: Props) {
  // edit หรือ prefill (จาก drag&drop) → เข้าฟอร์มเลย; add เปล่า → เริ่มที่เมนูเลือกวิธี
  const init = edit ?? prefill;
  const [step, setStep] = useState<Step>(edit || prefill ? 'form' : 'choose');
  const [form, setForm] = useState({
    name: init?.name ?? '',
    type: init?.type ?? '',
    group: init?.group ?? '',
    cwd: init?.cwd ?? '',
    command: init?.command ?? '',
    port: init?.port ? String(init.port) : '',
    openOnReady: init?.openOnReady ?? false,
    dependsOn: init?.dependsOn ?? [],
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  // เลือก "Scan Folder" — เปิด picker, สแกน แล้วเติมฟอร์มจากโปรเจกต์ตัวแรก
  const scanFolder = async () => {
    setError('');
    const { cwd } = await api.pickFolder();
    if (!cwd) return;
    setPicking(true);
    try {
      const { projects } = await api.scanFolder(cwd);
      const p = projects[0];
      if (!p) {
        setError('ไม่เจอโปรเจกต์ในโฟลเดอร์นี้ — ลองใส่เอง');
        setForm((f) => ({ ...f, cwd }));
      } else {
        setForm((f) => ({ ...f, name: p.name, type: p.type, cwd: p.cwd, command: p.command }));
      }
      setStep('form');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPicking(false);
    }
  };

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
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
      >
        {step === 'choose' && <ChooseStep onScan={scanFolder} onCustom={() => setStep('form')} picking={picking} error={error} />}

        {step === 'form' && (
          <form onSubmit={submit} className="space-y-4">
            <div className="flex items-center gap-2">
              {!edit && (
                <button type="button" onClick={() => setStep('choose')} className="text-neutral-500 hover:text-neutral-300" aria-label="Back">
                  <ArrowLeft size={16} />
                </button>
              )}
              <h2 className="text-lg font-semibold text-neutral-100">{edit ? 'Edit Service' : 'Add Service'}</h2>
            </div>

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

            {/* Port: โชว์เฉพาะตอน edit — ตอน add จะ auto-detect ตอน start (Phase 2) */}
            {edit && (
              <label className="block space-y-1">
                <span className="text-xs text-neutral-400">Port (ใช้เช็คสถานะ + เปิด browser)</span>
                <input className={`${FIELD} font-mono`} value={form.port} onChange={set('port')} placeholder="5173" type="number" min="1" max="65535" />
              </label>
            )}

            <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={form.openOnReady}
                onChange={(e) => setForm((f) => ({ ...f, openOnReady: e.target.checked }))}
                className="h-4 w-4 accent-sky-500"
              />
              <Globe size={14} className="text-neutral-500" /> เปิด browser อัตโนมัติเมื่อ service พร้อม
            </label>

            {/* depends-on: โชว์เฉพาะตอน edit และมี service อื่นให้เลือก — start ตัวพวกนี้ก่อน */}
            {edit && allServices.some((s) => s.id !== edit.id) && (
              <div className="space-y-1">
                <span className="text-xs text-neutral-400">เริ่มก่อน (dependencies) — start ตัวพวกนี้ให้พร้อมก่อน</span>
                <div className="max-h-28 space-y-1 overflow-auto rounded-md border border-neutral-800 p-2">
                  {allServices
                    .filter((s) => s.id !== edit.id)
                    .map((s) => (
                      <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm text-neutral-300">
                        <input
                          type="checkbox"
                          checked={form.dependsOn.includes(s.id)}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              dependsOn: e.target.checked
                                ? [...f.dependsOn, s.id]
                                : f.dependsOn.filter((d) => d !== s.id),
                            }))
                          }
                          className="h-4 w-4 accent-sky-500"
                        />
                        {s.group && <span className="text-xs text-neutral-600">{s.group} /</span>}
                        {s.name}
                      </label>
                    ))}
                </div>
              </div>
            )}

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
        )}
      </div>
    </div>
  );
}

// ---- Step 1: เลือกวิธีเพิ่ม service ----

function ChooseStep({
  onScan,
  onCustom,
  picking,
  error,
}: {
  onScan: () => void;
  onCustom: () => void;
  picking: boolean;
  error: string;
}) {
  const Card = ({ icon: Icon, title, desc, onClick }: { icon: typeof FolderSearch; title: string; desc: string; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={picking}
      className="flex flex-1 flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-5 text-left transition hover:border-sky-500/60 hover:bg-neutral-800/60 disabled:opacity-50"
    >
      <Icon size={22} className="text-sky-400" />
      <div className="font-semibold text-neutral-100">{title}</div>
      <div className="text-xs leading-relaxed text-neutral-500">{desc}</div>
    </button>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-neutral-100">Add Service</h2>
        <p className="mt-0.5 text-sm text-neutral-500">Choose how you'd like to add your service.</p>
      </div>
      <div className="flex gap-3">
        <Card
          icon={FolderSearch}
          title={picking ? 'Scanning…' : 'Import Project'}
          desc="Import an existing project and configure it automatically."
          onClick={onScan}
        />
        <Card
          icon={Settings2}
          title="Manual Setup"
          desc="Add a custom service with your own startup command."
          onClick={onCustom}
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
