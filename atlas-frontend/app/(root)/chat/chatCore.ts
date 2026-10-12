// app/chat/chatCore.ts

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

export type BaseMessage = {
  id: string;
  author: string;
  time: string;
  pinned?: boolean;
  reactions?: Record<string, number>;
  myReactions?: Record<string, boolean>;
};

export type TextMessage = BaseMessage & { kind: 'text'; text: string };
export type LoopMessage = BaseMessage & { kind: 'loop'; loop: LoopPayload };
export type Message = TextMessage | LoopMessage;

export type Channel = { id: string; name: string; messages: Message[] };
export type Server = { id: string; name: string; icon?: string; channels: Channel[] };

export type Member = { id: string; name: string; role?: string; online?: boolean };

export type DmThread = { id: string; user: Member; messages: Message[] };

export type PersistShape = {
  __owner: string;
  servers: Server[];
  activeServerId: string | null;
  activeChannelId: string | null;
  dmThreads: DmThread[];
  isDmHub: boolean;
  activeDmId: string | null;
  leftServerIds?: string[];
};

export type PendingInvite = {
  serverId: string;
  serverName?: string;
  email: string;
  invitedBy?: string;
  createdAt?: string;
  expiresAt?: string;
  joinLink?: string;
};

export type NotePreview = {
  id?: string;
  title: string;
  url?: string;
  thumbnail?: string;
  updatedAt?: string;
  author?: string;
};

export const demoMembers: Member[] = [
  { id: 'u2', name: 'kingken40', online: true },
  { id: 'u3', name: 'valenzuelaMta', online: true },
  { id: 'u4', name: 'andrarunns', online: true },
  { id: 'u5', name: 'rayala36', online: false },
  { id: 'u6', name: 'agrobles6', online: false },
];

export const API = '/flask-api';

export function fmtTime(iso?: string): string {
  try {
    return new Date(iso || Date.now()).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function ensureLoop(l: any): LoopPayload {
  return { ...EMPTY_LOOP, ...(l || {}) };
}

/* ---------- Local storage for chat state ---------- */

const LS_BASE = 'chat_app_state.v7';
const LS_LOOPS = 'loop_docs.v1';

export const storageKeyFor = (userId: string) => `${LS_BASE}:${userId}`;

export const loadStateFor = (userId: string): PersistShape | null => {
  try {
    const raw = localStorage.getItem(storageKeyFor(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const saveStateFor = (userId: string, data: PersistShape) => {
  try {
    localStorage.setItem(storageKeyFor(userId), JSON.stringify(data));
  } catch {}
};

/* ---------- Seed data ---------- */

export const seedServers = (): Server[] => [
  {
    id: crypto.randomUUID(),
    name: 'Brainiacs',
    icon: 'B',
    channels: [
      {
        id: crypto.randomUUID(),
        name: 'general',
        messages: [
          {
            id: crypto.randomUUID(),
            kind: 'text',
            author: 'nat1',
            text: 'Welcome to Brainiacs — use #general to coordinate!',
            time: 'Today at 10:12 AM',
          },
          {
            id: crypto.randomUUID(),
            kind: 'text',
            author: 'NeuroKat',
            text: 'Just pushed the atlas viewer tweaks. Can someone QA the dual view?',
            time: 'Today at 10:15 AM',
          },
          {
            id: crypto.randomUUID(),
            kind: 'text',
            author: 'axon42',
            text: 'I’ll test levels 27–30 and report back.',
            time: 'Today at 10:16 AM',
          },
        ],
      },
      { id: crypto.randomUUID(), name: 'start-here', messages: [] },
      { id: crypto.randomUUID(), name: 'announcements', messages: [] },
    ],
  },
];

export const seedDmThreads = (): DmThread[] => {
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return [
    {
      id: crypto.randomUUID(),
      user: demoMembers.find((m) => m.id === 'u2')!,
      messages: [
        {
          id: crypto.randomUUID(),
          kind: 'text',
          author: 'NeuroKat',
          text: 'hey! quick question on the atlas viewer',
          time: now,
        },
        { id: crypto.randomUUID(), kind: 'text', author: 'nat1', text: 'shoot!', time: now },
      ],
    },
    {
      id: crypto.randomUUID(),
      user: demoMembers.find((m) => m.id === 'u3')!,
      messages: [
        {
          id: crypto.randomUUID(),
          kind: 'text',
          author: 'axon42',
          text: 'levels 27–30 look good ✅',
          time: now,
        },
      ],
    },
  ];
};

/* ---------- Identity helpers ---------- */

export function getIdentityEmail(): string | null {
  try {
    if (typeof document !== 'undefined') {
      const m = document.cookie.match(/(?:^|;\s*)email=([^;]+)/);
      if (m && m[1]) return decodeURIComponent(m[1]).trim() || null;
    }
    if (typeof window !== 'undefined') {
      const ls = window.localStorage.getItem('email') || '';
      return (ls || '').trim() || null;
    }
  } catch {}
  return null;
}

export function setIdentityEmail(email: string) {
  try {
    if (typeof document !== 'undefined') {
      document.cookie = `email=${encodeURIComponent(email)}; path=/; SameSite=Lax;`;
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('email', email);
    }
  } catch {}
}

export function setWhoamiCookie(name: string) {
  try {
    if (!name) return;
    document.cookie = `whoami=${encodeURIComponent(name)}; path=/; SameSite=Lax;`;
  } catch {}
}

export function displayFromUser(userId: string) {
  return userId.includes('@') ? userId.split('@')[0] : userId || 'me';
}

/* ---------- Notes helpers ---------- */

export const NOTES_URLS = [`${API}/notes`, `${API}/notes/`];

export function extractNotesArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.notes)) return data.notes;
  if (Array.isArray(data?.data?.notes)) return data.data.notes;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export async function fetchMyNoteTitles(): Promise<string[]> {
  for (const url of NOTES_URLS) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) continue;
      const data = await res.json();
      const list = extractNotesArray(data);
      if (!list.length) continue;
      const titles = list
        .map((n: any) => n?.title ?? n?.name ?? n?.note_title ?? '')
        .map((t: any) => String(t || '').trim())
        .filter(Boolean);
      if (titles.length) return Array.from(new Set(titles));
    } catch {}
  }
  return [];
}

/* ---------- Invites + my servers ---------- */

export async function fetchPendingInvites(emailArg?: string | null): Promise<PendingInvite[]> {
  try {
    const email = emailArg ?? getIdentityEmail();
    if (!email) return [];
    const res = await fetch(`${API}/invites/pending?email=${encodeURIComponent(email)}`, {
      credentials: 'include',
    });
    const data = await res.json();
    return Array.isArray(data?.invites) ? (data.invites as PendingInvite[]) : [];
  } catch {
    return [];
  }
}

export async function acceptInviteToken(
  token: string,
  asEmail?: string | null,
): Promise<{ ok: boolean; server?: any; serverName?: string; already?: boolean }> {
  const body: any = { token };
  if (asEmail) body.as = asEmail;
  const res = await fetch(`${API}/invites/accept`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return {
    ok: !!data?.ok,
    server: data?.server,
    serverName: (data?.serverName as string | undefined) ?? data?.server?.name,
    already: !!data?.alreadyAccepted,
  };
}

export async function declineInviteToken(token: string, asEmail?: string | null) {
  const body: any = { token };
  if (asEmail) body.as = asEmail;
  try {
    const res = await fetch(`${API}/invites/decline`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: !!data?.ok };
  } catch {
    return { ok: false };
  }
}

export async function fetchMyServers(
  email?: string | null,
): Promise<{ id: string; name: string }[]> {
  try {
    const qs = email ? `?email=${encodeURIComponent(email)}` : '';
    const res = await fetch(`${API}/me/servers${qs}`, { credentials: 'include' });
    const data = await res.json();
    return Array.isArray(data?.servers) ? data.servers : [];
  } catch {
    return [];
  }
}

/* ---------- Chat API: channels + messages ---------- */

export type BackendChannel = { id: string; name: string };
export type BackendMessageDoc = {
  _id: string;
  kind: 'text' | 'loop';
  text?: string;
  loop?: any;
  author?: string;
  createdAt?: string;
  clientId?: string;
};

export async function apiListChannels(serverId: string): Promise<BackendChannel[]> {
  try {
    const res = await fetch(`${API}/servers/${encodeURIComponent(serverId)}/channels`, {
      credentials: 'include',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.channels) ? (data.channels as BackendChannel[]) : [];
  } catch {
    return [];
  }
}

export function mapDocToMessage(d: BackendMessageDoc): Message {
  if (d.kind === 'loop') {
    return {
      id: d._id || crypto.randomUUID(),
      kind: 'loop',
      author: d.author || 'someone',
      loop: ensureLoop(d.loop),
      time: fmtTime(d.createdAt),
    };
  }
  return {
    id: d._id || crypto.randomUUID(),
    kind: 'text',
    author: d.author || 'someone',
    text: d.text || '',
    time: fmtTime(d.createdAt),
  };
}

export async function apiListMessages(
  serverId: string,
  channelId: string,
  limit = 200,
): Promise<Message[]> {
  try {
    const url = `${API}/servers/${encodeURIComponent(
      serverId,
    )}/channels/${encodeURIComponent(channelId)}/messages?limit=${limit}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return [];
    const data = await res.json();
    const raw: BackendMessageDoc[] = Array.isArray(data?.messages) ? data.messages : [];
    return raw.map(mapDocToMessage);
  } catch {
    return [];
  }
}

export async function apiPostMessage(
  serverId: string,
  channelId: string,
  payload:
    | { kind: 'text'; text: string }
    | {
        kind: 'loop';
        loop: LoopPayload;
      },
  authorDisplay: string,
): Promise<boolean> {
  try {
    const body: any =
      payload.kind === 'text'
        ? { kind: 'text', text: payload.text, author: authorDisplay, clientId: crypto.randomUUID() }
        : { kind: 'loop', loop: payload.loop, author: authorDisplay, clientId: crypto.randomUUID() };
    const url = `${API}/servers/${encodeURIComponent(
      serverId,
    )}/channels/${encodeURIComponent(channelId)}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return !!data?.ok;
  } catch {
    return false;
  }
}

/* ---------- Loop doc API (backend + local fallback) ---------- */

export const LOOPS_API = `${API}/loops`;

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
function createLocalLoopDoc(loop: LoopPayload): string {
  const id = crypto.randomUUID();
  const map = readLocalLoops();
  map[id] = { ...loop, docId: id };
  writeLocalLoops(map);
  return id;
}
export function updateLocalLoopDoc(id: string, patch: Partial<LoopPayload>) {
  const map = readLocalLoops();
  const prev = map[id] || { ...EMPTY_LOOP, docId: id };
  map[id] = { ...prev, ...patch, docId: id };
  writeLocalLoops(map);
}

async function apiCreateLoopDoc(loop: LoopPayload): Promise<string | null> {
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

export async function apiUpdateLoopDoc(
  id: string,
  loop: Partial<LoopPayload>,
): Promise<boolean> {
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

/** Ensure a Loop doc exists; backend first, local fallback. */
export async function ensureLoopDocId(loop: LoopPayload): Promise<string> {
  if (loop.docId) return loop.docId;
  const remote = await apiCreateLoopDoc(loop);
  if (remote) return remote;
  return createLocalLoopDoc(loop);
}

/* ---------- Notes: preview by title ---------- */

export function firstTruthy<T = string>(obj: any, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v as T;
  }
  return undefined;
}

export function normalizeNoteItem(item: any): NotePreview | null {
  if (!item) return null;
  const title = firstTruthy<string>(item, ['title', 'name', 'note_title', 'Title', 'NoteTitle']);
  if (!title) return null;
  const url = firstTruthy<string>(item, [
    'url',
    'link',
    'href',
    'viewUrl',
    'openUrl',
    'webUrl',
    'pageUrl',
    'permalink',
  ]);
  let thumbnail =
    firstTruthy<string>(item, [
      'thumbnail',
      'thumb',
      'thumbUrl',
      'thumbnailUrl',
      'image',
      'preview',
      'previewUrl',
      'cover',
      'coverUrl',
      'screenshot',
      'screenshotUrl',
      'dataUrl',
      'data_url',
    ]) || undefined;
  const blob = firstTruthy<string>(item, ['imageData', 'thumbnailData', 'screenshotData', 'blob']);
  if (!thumbnail && blob) {
    thumbnail = blob.startsWith('data:') ? blob : `data:image/png;base64,${blob}`;
  }
  const updatedAt = firstTruthy<string>(item, [
    'updatedAt',
    'updated_at',
    'modifiedAt',
    'modified',
    'lastModified',
    'last_edited_time',
    'date',
  ]);
  const author = firstTruthy<string>(item, ['author', 'owner', 'by', 'creator', 'createdBy', 'user']);
  const id = firstTruthy<string>(item, ['id', '_id', 'note_id', 'uuid', 'guid']);
  return { id, title: String(title), url, thumbnail, updatedAt, author };
}

export async function fetchNoteByTitle(title: string): Promise<NotePreview | null> {
  const target = title.trim().toLowerCase();

  for (const url of NOTES_URLS) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) continue;
      const data = await res.json();
      const list = extractNotesArray(data);
      if (!Array.isArray(list) || !list.length) continue;

      const exact = list.find(
        (n: any) =>
          String(n?.title ?? n?.name ?? n?.note_title ?? '')
            .trim()
            .toLowerCase() === target,
      );
      const caseSens = list.find(
        (n: any) => String(n?.title ?? n?.name ?? n?.note_title ?? '').trim() === title,
      );
      const partial = list.find((n: any) =>
        String(n?.title ?? n?.name ?? n?.note_title ?? '').toLowerCase().includes(target),
      );
      const found = exact ?? caseSens ?? partial;
      const norm = normalizeNoteItem(found);
      if (norm) return norm;
    } catch {}
  }

  try {
    const res = await fetch(`${API}/notes/preview?title=${encodeURIComponent(title)}`, {
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const maybe = normalizeNoteItem(data) || normalizeNoteItem(data?.note);
      if (maybe) return maybe;
    }
  } catch {}

  return { title };
}

/* ---------- Loop → plain text (for quote reply) ---------- */

export function renderLoopAsPlain(loop: LoopPayload): string {
  const L = { ...EMPTY_LOOP, ...(loop ?? {}) };
  const parts: string[] = [`**${L.title}**`];
  switch (L.activeTool) {
    case 'Paragraph':
      parts.push(L.paragraph || '');
      break;
    case 'Table': {
      if (!L.table?.length) break;
      const head = '| ' + L.table[0].join(' | ') + ' |';
      const sep = '| ' + L.table[0].map(() => '---').join(' | ') + ' |';
      const rows = L.table
        .slice(1)
        .map((r) => '| ' + r.join(' | ') + ' |')
        .join('\n');
      parts.push([head, sep, rows].filter(Boolean).join('\n'));
      break;
    }
    case 'Bulleted list':
      parts.push(L.bulleted.map((i) => `• ${i}`).join('\n'));
      break;
    case 'Checklist':
      parts.push(L.checklist.map((i) => `${i.done ? '☑' : '☐'} ${i.text}`).join('\n'));
      break;
    case 'Task list': {
      const head = '| Task | Assigned to | Due date | Bucket |\n| --- | --- | --- | --- |';
      const rows = L.tasks.map((t) => `| ${t.task} | ${t.assignee} | ${t.due} | ${t.bucket} |`).join('\n');
      parts.push(`${head}\n${rows}`);
      break;
    }
    case 'Numbered list':
      parts.push(L.numbered.map((i, idx) => `${idx + 1}. ${i}`).join('\n'));
      break;
  }
  return parts.join('\n');
}

/* ---------- Misc small helpers ---------- */

export function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
