'use client';

/**
 * Simple client-only Loop docs store used by Chat and /loops pages.
 */

export type LoopTool =
  | 'Paragraph'
  | 'Table'
  | 'Bulleted list'
  | 'Checklist'
  | 'Task list'
  | 'Numbered list';

export type ChecklistItem = { text: string; done: boolean };
export type TaskRow = { task: string; assignee: string; due: string; bucket: string };

export type LoopDoc = {
  id: string;
  title: string;
  activeTool: LoopTool;
  paragraph: string;
  table: string[][];
  bulleted: string[];
  checklist: ChecklistItem[];
  tasks: TaskRow[];
  numbered: string[];
  // meta
  createdAt: string;
  updatedAt: string;
  author?: string;
  serverId?: string | null;
  channelId?: string | null;
};

const EMPTY_DOC: Omit<LoopDoc, 'id' | 'createdAt' | 'updatedAt'> = {
  title: '',
  activeTool: 'Paragraph',
  paragraph: '',
  table: [['Column 1', 'Column 2']],
  bulleted: [],
  checklist: [],
  tasks: [],
  numbered: [],
};

const LS_KEY = 'loop_docs.v1';

function nowISO() {
  return new Date().toISOString();
}

function readAll(): Record<string, LoopDoc> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, LoopDoc>) : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, LoopDoc>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {}
}

export function listLoopDocs(): LoopDoc[] {
  const map = readAll();
  return Object.values(map).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function readLoopDoc(id: string): LoopDoc | null {
  const map = readAll();
  return map[id] ?? null;
}

export function deleteLoopDoc(id: string) {
  const map = readAll();
  if (map[id]) {
    delete map[id];
    writeAll(map);
  }
}

/**
 * Create or update a Loop doc from a Loop payload.
 * Always returns the persisted id (may be the incoming one or a newly generated UUID).
 */
export async function upsertLoopDocFromPayload(
  payload: Partial<LoopDoc> & { id?: string },
  author?: string,
  context?: { serverId?: string | null; channelId?: string | null },
): Promise<{ id: string }> {
  const id = payload.id || crypto.randomUUID();
  const existing = readLoopDoc(id);

  const merged: LoopDoc = {
    id,
    title: payload.title ?? existing?.title ?? EMPTY_DOC.title,
    activeTool: (payload.activeTool ?? existing?.activeTool ?? EMPTY_DOC.activeTool) as LoopDoc['activeTool'],
    paragraph: payload.paragraph ?? existing?.paragraph ?? EMPTY_DOC.paragraph,
    table: payload.table ?? existing?.table ?? EMPTY_DOC.table,
    bulleted: payload.bulleted ?? existing?.bulleted ?? EMPTY_DOC.bulleted,
    checklist: payload.checklist ?? existing?.checklist ?? EMPTY_DOC.checklist,
    tasks: payload.tasks ?? existing?.tasks ?? EMPTY_DOC.tasks,
    numbered: payload.numbered ?? existing?.numbered ?? EMPTY_DOC.numbered,
    createdAt: existing?.createdAt ?? nowISO(),
    updatedAt: nowISO(),
    author: author ?? existing?.author,
    serverId: context?.serverId ?? existing?.serverId ?? null,
    channelId: context?.channelId ?? existing?.channelId ?? null,
  };

  const map = readAll();
  map[id] = merged;
  writeAll(map);

  return { id };
}
