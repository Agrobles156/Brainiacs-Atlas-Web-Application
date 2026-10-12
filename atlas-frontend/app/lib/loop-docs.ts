'use client';

/**
 * Lightweight client helpers to treat chat Loop messages like
 * standalone "documents": list, open (fetch), and save (update).
 *
 * We encode a document key as: base64("serverId:channelId:messageId")
 * so we can jump straight to the originating message on the backend.
 */

export const API = '/flask-api';

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
  title: '',
  activeTool: 'Paragraph',
  paragraph: '',
  table: [['Column 1', 'Column 2']],
  bulleted: [],
  checklist: [],
  tasks: [],
  numbered: [],
};

export type LoopDocSummary = {
  docKey: string;
  messageId: string;
  title: string;
  author?: string;
  createdAt?: string;
  serverId: string;
  serverName?: string;
  channelId: string;
  channelName?: string;
};

export function makeDocKey(serverId: string, channelId: string, messageId: string): string {
  const raw = `${serverId}:${channelId}:${messageId}`;
  const b64 = typeof window !== 'undefined'
    ? btoa(unescape(encodeURIComponent(raw)))
    : Buffer.from(raw, 'utf8').toString('base64');
  return b64.replace(/=+$/,''); // trim padding
}

export function parseDocKey(key: string):
  | { serverId: string; channelId: string; messageId: string }
  | null {
  try {
    const raw = typeof window !== 'undefined'
      ? decodeURIComponent(escape(atob(key)))
      : Buffer.from(key, 'base64').toString('utf8');
    const [serverId, channelId, messageId] = raw.split(':');
    if (!serverId || !channelId || !messageId) return null;
    return { serverId, channelId, messageId };
  } catch {
    return null;
  }
}

/** GET one Loop doc by docKey by reusing the messages endpoint */
export async function fetchLoopDoc(docKey: string): Promise<{
  ok: boolean;
  loop?: LoopPayload;
  author?: string;
  createdAt?: string;
  serverId?: string;
  channelId?: string;
  messageId?: string;
  error?: string;
}> {
  const ids = parseDocKey(docKey);
  if (!ids) return { ok: false, error: 'Invalid document key.' };
  const { serverId, channelId, messageId } = ids;

  try {
    const url = `${API}/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/messages?limit=500`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    const list: any[] = Array.isArray(data?.messages) ? data.messages : [];
    const doc = list.find((d: any) => d?._id === messageId || d?.id === messageId);
    if (!doc || doc?.kind !== 'loop') return { ok: false, error: 'Document not found (or not a Loop).' };

    const loop: LoopPayload = { ...EMPTY_LOOP, ...(doc.loop || {}) };
    return {
      ok: true,
      loop,
      author: doc?.author,
      createdAt: doc?.createdAt,
      serverId,
      channelId,
      messageId,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch document.' };
  }
}

export async function saveLoopDoc(
  docKey: string,
  loop: LoopPayload,
): Promise<{ ok: boolean; error?: string }> {
  const ids = parseDocKey(docKey);
  if (!ids) return { ok: false, error: 'Invalid document key.' };
  const { serverId, channelId, messageId } = ids;

  const body = JSON.stringify({ kind: 'loop', loop });

  // Attempt 1: PUT
  try {
    const url = `${API}/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`;
    const res = await fetch(url, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body });
    if (res.ok) return { ok: true };
  } catch {}

  // Attempt 2: PATCH
  try {
    const url = `${API}/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`;
    const res = await fetch(url, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body });
    if (res.ok) return { ok: true };
  } catch {}

  // Attempt 3: POST /messages/update
  try {
    const url = `${API}/messages/update`;
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverId, channelId, id: messageId, kind: 'loop', loop }),
    });
    if (res.ok) return { ok: true };
  } catch {}

  return { ok: false, error: 'Backend update route not available yet.' };
}

/** List Loop docs across all servers/channels this user can access. */
export async function listLoopDocs(): Promise<{ ok: boolean; items: LoopDocSummary[]; error?: string }> {
  try {
    // 1) user’s servers
    const sRes = await fetch(`${API}/me/servers`, { credentials: 'include' });
    if (!sRes.ok) return { ok: false, items: [], error: `HTTP ${sRes.status}` };
    const sData = await sRes.json();
    const servers: { id: string; name?: string }[] = Array.isArray(sData?.servers) ? sData.servers : [];
    const items: LoopDocSummary[] = [];

    for (const s of servers) {
      // 2) channels in server
      const cRes = await fetch(`${API}/servers/${encodeURIComponent(s.id)}/channels`, { credentials: 'include' });
      if (!cRes.ok) continue;
      const cData = await cRes.json();
      const channels: { id: string; name?: string }[] = Array.isArray(cData?.channels) ? cData.channels : [];

      for (const c of channels) {
        // 3) messages in channel → filter loop messages
        const mRes = await fetch(
          `${API}/servers/${encodeURIComponent(s.id)}/channels/${encodeURIComponent(c.id)}/messages?limit=200`,
          { credentials: 'include' },
        );
        if (!mRes.ok) continue;
        const mData = await mRes.json();
        const msgs: any[] = Array.isArray(mData?.messages) ? mData.messages : [];
        for (const m of msgs) {
          if (m?.kind !== 'loop') continue;
          const title = String(m?.loop?.title ?? '').trim() || '(untitled)';
          const messageId = m?._id || m?.id;
          if (!messageId) continue;
          const docKey = makeDocKey(s.id, c.id, messageId);
          items.push({
            docKey,
            messageId,
            title,
            author: m?.author,
            createdAt: m?.createdAt,
            serverId: s.id,
            serverName: s?.name,
            channelId: c.id,
            channelName: c?.name,
          });
        }
      }
    }

    // Optional: sort by updated/created if present
    items.sort((a, b) => (a.createdAt && b.createdAt ? +new Date(b.createdAt) - +new Date(a.createdAt) : 0));
    return { ok: true, items };
  } catch (e: any) {
    return { ok: false, items: [], error: e?.message || 'Failed to list documents.' };
  }
}
