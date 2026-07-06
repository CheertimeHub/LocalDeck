import { useState } from 'react';
import type { ScannedProject } from '../types';
import { api } from '../api';

interface Props {
  onImported: () => void;
}

// หน้าจอต้อนรับตอนยังไม่มี service — กด Scan ปุ่มเดียว เจอโปรเจกต์ ติ๊ก import จบ
export function Onboarding({ onImported }: Props) {
  const [scanning, setScanning] = useState(false);
  const [projects, setProjects] = useState<ScannedProject[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [group, setGroup] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const scan = async () => {
    setError('');
    const { cwd } = await api.pickFolder();
    if (!cwd) return; // กด cancel
    setScanning(true);
    try {
      const { projects } = await api.scanFolder(cwd);
      setProjects(projects);
      setSelected(new Set(projects.map((p) => p.cwd))); // เลือกทั้งหมดไว้ก่อน
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const toggle = (cwd: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(cwd)) next.delete(cwd);
      else next.add(cwd);
      return next;
    });

  const importSelected = async () => {
    if (!projects) return;
    setImporting(true);
    setError('');
    try {
      const chosen = projects.filter((p) => selected.has(p.cwd));
      await api.importServices(
        chosen.map((p) => ({
          name: p.name,
          type: p.type,
          group: group.trim(),
          cwd: p.cwd,
          command: p.command,
          port: p.port,
        })),
      );
      onImported();
    } catch (err) {
      setError((err as Error).message);
      setImporting(false);
    }
  };

  // ยังไม่ได้ scan — จอต้อนรับ
  if (!projects) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900/60 p-10 text-center">
        <p className="text-5xl">👋</p>
        <h2 className="mt-4 text-xl font-bold text-neutral-100">Welcome to LocalDeck</h2>
        <p className="mt-2 text-sm text-neutral-400">
          ให้เราค้นหาโปรเจกต์ในเครื่องให้อัตโนมัติ — เลือกโฟลเดอร์หลัก (เช่น <span className="font-mono text-neutral-300">C:\Projects</span>) แล้วเราจัดการที่เหลือเอง
        </p>
        <button
          type="button"
          onClick={scan}
          disabled={scanning}
          className="mt-6 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {scanning ? 'กำลังสแกน…' : '🔍 Scan My Computer'}
        </button>
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  // scan แล้วไม่เจออะไร
  if (projects.length === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-neutral-800 p-10 text-center text-neutral-400">
        <p className="text-4xl">🕳️</p>
        <p className="mt-3">ไม่เจอโปรเจกต์ในโฟลเดอร์นี้</p>
        <button type="button" onClick={() => setProjects(null)} className="mt-4 text-sm text-sky-400 hover:underline">
          ← ลองโฟลเดอร์อื่น
        </button>
      </div>
    );
  }

  // เจอโปรเจกต์ — ให้ติ๊กเลือก
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-bold text-neutral-100">🎉 เจอ {projects.length} โปรเจกต์</h2>
        <p className="mt-1 text-sm text-neutral-500">ติ๊กเลือกตัวที่อยากเพิ่ม แล้วกด Import</p>
      </div>

      <div className="space-y-2">
        {projects.map((p) => (
          <label
            key={p.cwd}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-3 hover:border-neutral-700"
          >
            <input
              type="checkbox"
              checked={selected.has(p.cwd)}
              onChange={() => toggle(p.cwd)}
              className="h-4 w-4 accent-sky-500"
            />
            <span className="text-xl">{p.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold text-neutral-100">{p.name}</span>
                <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">{p.type}</span>
              </div>
              <p className="truncate font-mono text-xs text-neutral-500">{p.command}</p>
            </div>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3 border-t border-neutral-800 pt-4">
        <input
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          placeholder="Project / Group (ไม่บังคับ)"
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-sky-500"
        />
        <button type="button" onClick={() => setProjects(null)} className="text-sm text-neutral-400 hover:text-neutral-200">
          ← ยกเลิก
        </button>
        <button
          type="button"
          onClick={importSelected}
          disabled={importing || selected.size === 0}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {importing ? 'กำลังเพิ่ม…' : `Import Selected (${selected.size})`}
        </button>
      </div>
      {error && <p className="text-center text-sm text-red-400">{error}</p>}
    </div>
  );
}
