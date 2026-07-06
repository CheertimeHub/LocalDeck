import { useEffect, useState } from 'react';
import type { ImportableProcess, ServiceView } from '../types';
import { api } from '../api';

interface Props {
  edit: ServiceView | null;
  groups: string[];
  onClose: () => void;
}

const FIELD =
  'w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-sky-500';

type Step = 'choose' | 'form' | 'process';

export function AddServiceModal({ edit, groups, onClose }: Props) {
  // edit → เข้าฟอร์มเลย; add ใหม่ → เริ่มที่เมนูเลือกวิธี
  const [step, setStep] = useState<Step>(edit ? 'form' : 'choose');
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
        {step === 'choose' && <ChooseStep onScan={scanFolder} onCustom={() => setStep('form')} onProcess={() => setStep('process')} picking={picking} error={error} />}

        {step === 'process' && (
          <ProcessStep
            onBack={() => setStep('choose')}
            onPick={(p) => {
              setForm((f) => ({
                ...f,
                name: p.process.replace(/\.exe$/i, ''),
                cwd: p.cwd,
                command: '',
                port: String(p.port),
              }));
              setStep('form');
            }}
          />
        )}

        {step === 'form' && (
          <form onSubmit={submit} className="space-y-4">
            <div className="flex items-center gap-2">
              {!edit && (
                <button type="button" onClick={() => setStep('choose')} className="text-sm text-neutral-500 hover:text-neutral-300">
                  ←
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
  onProcess,
  picking,
  error,
}: {
  onScan: () => void;
  onCustom: () => void;
  onProcess: () => void;
  picking: boolean;
  error: string;
}) {
  const Option = ({ icon, title, desc, onClick }: { icon: string; title: string; desc: string; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={picking}
      className="flex w-full items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-left hover:border-sky-500/60 hover:bg-neutral-800/60 disabled:opacity-50"
    >
      <span className="text-2xl">{icon}</span>
      <div>
        <div className="font-semibold text-neutral-100">{title}</div>
        <div className="text-xs text-neutral-500">{desc}</div>
      </div>
    </button>
  );

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-neutral-100">Add Service</h2>
      <p className="text-sm text-neutral-500">อยากเพิ่มยังไง?</p>
      <Option icon="🔍" title={picking ? 'กำลังสแกน…' : 'Scan Folder'} desc="เลือกโฟลเดอร์ เราเดา command ให้เอง" onClick={onScan} />
      <Option icon="⚙️" title="Custom Command" desc="กรอกเอง (ชื่อ, โฟลเดอร์, คำสั่ง)" onClick={onCustom} />
      <Option icon="🔗" title="Existing Process" desc="import process ที่รันอยู่แล้ว" onClick={onProcess} />
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

// ---- Step: import จาก process ที่รันอยู่ ----

function ProcessStep({ onBack, onPick }: { onBack: () => void; onPick: (p: ImportableProcess) => void }) {
  const [procs, setProcs] = useState<ImportableProcess[] | null>(null);
  const [error, setError] = useState('');

  // โหลด list ครั้งแรก
  useEffect(() => {
    api
      .importableProcesses()
      .then(setProcs)
      .catch((err) => setError((err as Error).message));
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="text-sm text-neutral-500 hover:text-neutral-300">
          ←
        </button>
        <h2 className="text-lg font-semibold text-neutral-100">Existing Process</h2>
      </div>
      <p className="text-xs text-neutral-500">
        เลือก process ที่รันอยู่ (จะยังไม่มี log จนกว่าจะ Stop แล้ว Start ใหม่ผ่าน LocalDeck)
      </p>

      {!procs && !error && <p className="text-sm text-neutral-500">กำลังโหลด…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="max-h-72 space-y-1.5 overflow-auto">
        {procs?.map((p) => (
          <button
            key={p.pid}
            type="button"
            onClick={() => onPick(p)}
            className="flex w-full items-center gap-3 rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-left hover:border-sky-500/60"
          >
            <span className="font-mono text-xs text-sky-400">:{p.port}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-neutral-200">{p.process}</div>
              <div className="truncate font-mono text-[10px] text-neutral-600">{p.cwd || p.commandLine}</div>
            </div>
            <span className="text-xs text-neutral-600">pid {p.pid}</span>
          </button>
        ))}
        {procs?.length === 0 && <p className="text-sm text-neutral-500">ไม่มี process ที่ import ได้</p>}
      </div>
    </div>
  );
}
