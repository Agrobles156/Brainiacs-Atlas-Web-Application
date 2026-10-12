'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

/** Shared types with Chat page */
type LoopTool = 'Paragraph' | 'Table' | 'Bulleted list' | 'Checklist' | 'Task list' | 'Numbered list';
type ChecklistItem = { text: string; done: boolean };
type TaskRow = { task: string; assignee: string; due: string; bucket: string };

type LoopPayload = {
  docId?: string;
  title: string;
  activeTool: LoopTool;
  paragraph: string;
  table: string[][];
  bulleted: string[];
  checklist: ChecklistItem[];
  tasks: TaskRow[];
  numbered: string[];
};

const EMPTY_LOOP: LoopPayload = {
  docId: undefined,
  title: '',
  activeTool: 'Paragraph',
  paragraph: '',
  table: [['Column 1', 'Column 2']],
  bulleted: [],
  checklist: [],
  tasks: [],
  numbered: [],
};

const API = '/flask-api';
const LOOPS_API = `${API}/loops`;
const LS_LOOPS = 'loop_docs.v1';

/* Local storage helpers */
function ensureLoop(l: any): LoopPayload {
  return { ...EMPTY_LOOP, ...(l || {}) };
}
function readLocalLoops(): Record<string, LoopPayload> {
  try {
    return JSON.parse(localStorage.getItem(LS_LOOPS) || '{}') || {};
  } catch {
    return {};
  }
}
function writeLocalLoops(map: Record<string, LoopPayload>) {
  try {
    localStorage.setItem(LS_LOOPS, JSON.stringify(map));
  } catch {}
}
function getLocalLoop(id: string): LoopPayload | null {
  const map = readLocalLoops();
  return map[id] ? ensureLoop(map[id]) : null;
}
function putLocalLoop(id: string, patch: Partial<LoopPayload>) {
  const map = readLocalLoops();
  const prev = map[id] || { ...EMPTY_LOOP, docId: id };
  map[id] = { ...prev, ...patch, docId: id };
  writeLocalLoops(map);
}

async function fetchRemoteDoc(id: string): Promise<LoopPayload | null> {
  try {
    const res = await fetch(`${LOOPS_API}/${encodeURIComponent(id)}`, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const loop = data?.loop || data;
    return ensureLoop({ ...loop, docId: id });
  } catch {
    return null;
  }
}

async function saveRemoteDoc(id: string, loop: Partial<LoopPayload>): Promise<boolean> {
  try {
    const res = await fetch(`${LOOPS_API}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: loop.title, loop }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok || !!data?.ok;
  } catch {
    return false;
  }
}

export default function LoopDocPage() {
  const params = useParams();
  const router = useRouter();
  const id = useMemo(() => decodeURIComponent(String((params as any)?.id || '')), [params]);

  const [data, setData] = useState<LoopPayload>({ ...EMPTY_LOOP, docId: id });
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('loading');

  const timerRef = useRef<number | null>(null);
  const firstRef = useRef(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setStatus('loading');
      const remote = await fetchRemoteDoc(id);
      if (!cancelled) {
        if (remote) setData(remote);
        else {
          const local = getLocalLoop(id);
          setData(local ? local : { ...EMPTY_LOOP, docId: id });
        }
        setStatus('idle');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Debounced autosave
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    if (!id) return;
    setStatus('saving');
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      // always keep a local copy
      putLocalLoop(id, data);
      // try remote
      const ok = await saveRemoteDoc(id, data);
      setStatus(ok ? 'saved' : 'error');
      timerRef.current = null;
    }, 700);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [data, id]);

  const tableSafe = data.table?.length ? data.table : EMPTY_LOOP.table;

  return (
    <div className="min-h-screen bg-[#f9fafb] text-[#0b1220]">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <Link href="/loops" className="text-sm px-3 py-1.5 rounded border border-black/10 hover:bg-black/5">
            ← All Loop docs
          </Link>
          <div className="text-sm text-black/60">
            {status === 'loading' ? 'Loading…' : status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Saved locally (server unavailable)' : ''}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <input
            value={data.title}
            onChange={(e) => setData((d) => ({ ...d, title: e.target.value }))}
            placeholder="Add a title"
            className="w-full text-[22px] font-semibold outline-none bg-transparent"
          />

          {/* TOOLBAR */}
          <div className="flex flex-wrap gap-2">
            {(['Paragraph','Table','Bulleted list','Checklist','Task list','Numbered list'] as LoopTool[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`px-3 py-2 rounded-md border text-sm ${data.activeTool === t ? 'border-indigo-300 bg-indigo-50' : 'border-black/10 hover:bg-black/5'}`}
                onClick={() => setData((d) => ({ ...d, activeTool: t }))}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Editors */}
          {data.activeTool === 'Paragraph' && (
            <textarea
              value={data.paragraph}
              onChange={(e) => setData((d) => ({ ...d, paragraph: e.target.value }))}
              className="w-full min-h-[160px] outline-none bg-white rounded border border-black/10 p-3"
              placeholder="Share ideas with Loop. Just start typing…"
            />
          )}

          {data.activeTool === 'Table' && (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 rounded-lg overflow-hidden">
                <thead>
                  <tr>
                    {tableSafe[0].map((h, ci) => (
                      <th key={ci} className="bg-black/5 text-left px-3 py-2 border border-black/10">
                        <input
                          value={h}
                          onChange={(e) => {
                            const next = tableSafe.map((r) => [...r]);
                            next[0][ci] = e.target.value;
                            setData((d) => ({ ...d, table: next }));
                          }}
                          className="w-full bg-transparent outline-none"
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableSafe.slice(1).map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-2 border border-black/10">
                          <input
                            value={cell}
                            onChange={(e) => {
                              const next = tableSafe.map((r) => [...r]);
                              next[ri + 1][ci] = e.target.value;
                              setData((d) => ({ ...d, table: next }));
                            }}
                            className="w-full bg-transparent outline-none"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex gap-2 mt-3">
                <button
                  className="px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
                  onClick={() => setData((d) => ({ ...d, table: [...tableSafe, new Array(tableSafe[0].length).fill('')] }))}
                >
                  + Row
                </button>
                <button
                  className="px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
                  onClick={() =>
                    setData((d) => ({
                      ...d,
                      table: tableSafe.map((r, i) => (i === 0 ? [...r, `Column ${r.length + 1}`] : [...r, ''])),
                    }))
                  }
                >
                  + Column
                </button>
              </div>
            </div>
          )}

          {data.activeTool === 'Bulleted list' && (
            <div>
              <ul className="space-y-2">
                {(data.bulleted ?? []).map((it, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span>•</span>
                    <input
                      value={it ?? ''}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          bulleted: (d.bulleted ?? []).map((v, idx) => (idx === i ? e.target.value : v)),
                        }))
                      }
                      className="flex-1 bg-transparent outline-none border border-black/10 rounded px-2 py-1"
                    />
                    <button
                      className="text-xs px-2 py-1 border border-black/10 rounded hover:bg-black/5"
                      onClick={() =>
                        setData((d) => ({ ...d, bulleted: (d.bulleted ?? []).filter((_, idx) => idx !== i) }))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <button
                className="mt-3 px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
                onClick={() => setData((d) => ({ ...d, bulleted: [...(d.bulleted ?? []), ''] }))}
              >
                + Add item
              </button>
            </div>
          )}

          {data.activeTool === 'Checklist' && (
            <div>
              <ul className="space-y-2">
                {(data.checklist ?? []).map((it, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!it.done}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          checklist: (d.checklist ?? []).map((v, idx) =>
                            idx === i ? { ...v, done: e.target.checked } : v,
                          ),
                        }))
                      }
                    />
                    <input
                      value={it.text ?? ''}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          checklist: (d.checklist ?? []).map((v, idx) =>
                            idx === i ? { ...v, text: e.target.value } : v,
                          ),
                        }))
                      }
                      className="flex-1 bg-transparent outline-none border border-black/10 rounded px-2 py-1"
                    />
                    <button
                      className="text-xs px-2 py-1 border border-black/10 rounded hover:bg-black/5"
                      onClick={() =>
                        setData((d) => ({ ...d, checklist: (d.checklist ?? []).filter((_, idx) => idx !== i) }))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <button
                className="mt-3 px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
                onClick={() => setData((d) => ({ ...d, checklist: [...(d.checklist ?? []), { text: '', done: false }] }))}
              >
                + Add item
              </button>
            </div>
          )}

          {data.activeTool === 'Task list' && (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 rounded-lg overflow-hidden">
                <thead>
                  <tr>
                    {['Task', 'Assigned to', 'Due date', 'Bucket'].map((h) => (
                      <th key={h} className="bg-black/5 text-left px-3 py-2 border border-black/10">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.tasks ?? []).map((row, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 border border-black/10">
                        <input
                          value={row.task ?? ''}
                          onChange={(e) =>
                            setData((d) => ({
                              ...d,
                              tasks: (d.tasks ?? []).map((r, idx) => (idx === i ? { ...r, task: e.target.value } : r)),
                            }))
                          }
                          className="w-full bg-transparent outline-none"
                        />
                      </td>
                      <td className="px-3 py-2 border border-black/10">
                        <input
                          value={row.assignee ?? ''}
                          onChange={(e) =>
                            setData((d) => ({
                              ...d,
                              tasks: (d.tasks ?? []).map((r, idx) =>
                                idx === i ? { ...r, assignee: e.target.value } : r,
                              ),
                            }))
                          }
                          className="w-full bg-transparent outline-none"
                        />
                      </td>
                      <td className="px-3 py-2 border border-black/10">
                        <input
                          type="date"
                          value={row.due ?? ''}
                          onChange={(e) =>
                            setData((d) => ({
                              ...d,
                              tasks: (d.tasks ?? []).map((r, idx) => (idx === i ? { ...r, due: e.target.value } : r)),
                            }))
                          }
                          className="w-full bg-transparent outline-none"
                        />
                      </td>
                      <td className="px-3 py-2 border border-black/10">
                        <input
                          value={row.bucket ?? ''}
                          onChange={(e) =>
                            setData((d) => ({
                              ...d,
                              tasks: (d.tasks ?? []).map((r, idx) =>
                                idx === i ? { ...r, bucket: e.target.value } : r,
                              ),
                            }))
                          }
                          className="w-full bg-transparent outline-none"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                className="mt-3 px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
                onClick={() =>
                  setData((d) => ({
                    ...d,
                    tasks: [...(d.tasks ?? []), { task: 'Task name', assignee: '', due: '', bucket: 'To do' }],
                  }))
                }
              >
                + Add task
              </button>
            </div>
          )}

          {data.activeTool === 'Numbered list' && (
            <div>
              <ol className="space-y-2">
                {(data.numbered ?? []).map((it, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="w-6 text-right">{i + 1}.</span>
                    <input
                      value={it ?? ''}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          numbered: (d.numbered ?? []).map((v, idx) => (idx === i ? e.target.value : v)),
                        }))
                      }
                      className="flex-1 bg-transparent outline-none border border-black/10 rounded px-2 py-1"
                    />
                    <button
                      className="text-xs px-2 py-1 border border-black/10 rounded hover:bg-black/5"
                      onClick={() => setData((d) => ({ ...d, numbered: (d.numbered ?? []).filter((_, idx) => idx !== i) }))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ol>
              <button
                className="mt-3 px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
                onClick={() => setData((d) => ({ ...d, numbered: [...(d.numbered ?? []), ''] }))}
              >
                + Add item
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
 