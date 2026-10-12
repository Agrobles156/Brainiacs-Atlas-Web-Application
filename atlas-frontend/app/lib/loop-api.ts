

export type LoopTool =
  | 'Paragraph'
  | 'Table'
  | 'Bulleted list'
  | 'Checklist'
  | 'Task list'
  | 'Numbered list';

export type ChecklistItem = { text: string; done: boolean };
export type TaskRow = { task: string; assignee: string; due: string; bucket: string };

export type LoopPayload = {
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

export const EMPTY_LOOP: LoopPayload = {
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
export const LOOPS_API = `${API}/loops`;
export const LS_LOOPS = 'loop_docs.v1';

export function readLocalLoops(): Record<string, LoopPayload> {
  try {
    return JSON.parse(localStorage.getItem(LS_LOOPS) || '{}') || {};
  } catch {
    return {};
  }
}
export function writeLocalLoops(map: Record<string, LoopPayload>) {
  try {
    localStorage.setItem(LS_LOOPS, JSON.stringify(map));
  } catch {}
}
export function createLocalLoopDoc(loop: LoopPayload): string {
  const id = crypto.randomUUID();
  const map = readLocalLoops();
  map[id] = { ...EMPTY_LOOP, ...loop, docId: id };
  writeLocalLoops(map);
  return id;
}
export function updateLocalLoopDoc(id: string, patch: Partial<LoopPayload>) {
  const map = readLocalLoops();
  const prev = map[id] || { ...EMPTY_LOOP, docId: id };
  map[id] = { ...prev, ...patch, docId: id };
  writeLocalLoops(map);
}
export async function apiCreateLoopDoc(loop: LoopPayload): Promise<string | null> {
  try {
    const res = await fetch(LOOPS_API, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: loop.title || 'Untitled', loop }),
    });
    const data = await res.json().catch(() => ({}));
    return (data?.id || data?._id || data?.docId || null) as string | null;
  } catch {
    return null;
  }
}
export async function apiUpdateLoopDoc(id: string, loop: Partial<LoopPayload>): Promise<boolean> {
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
export async function ensureLoopDocId(loop: LoopPayload): Promise<string> {
  if (loop.docId) return loop.docId;
  const remote = await apiCreateLoopDoc(loop);
  if (remote) return remote;
  return createLocalLoopDoc(loop);
}
