'use client';

import React, { useEffect, useMemo, useState } from 'react';
import GridNotesBoard, { type GridNote } from './GridNotesBoard';
import { Pencil, Share2, FolderPlus, Copy, Trash2, Eye, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

export type Scope = 'my' | 'shared';

type Props = {
  addedNote: boolean;
  scope: Scope;
  onOpenNote?: (n: GridNote) => void;
};

const API = '/flask-api';
const U = (p: string) => `${API}${p}`;

type Note = {
  id?: string | number;
  title?: string;
  details?: string;
  region?: string;
  year?: number;
  updated_at?: string;
  author?: string;

  authors?: string[];
  created_by?: string;
  createdBy?: string;
  creator?: string;
  owner?: string | { name?: string; email?: string };
  owner_name?: string;
  username?: string;
  user_name?: string;
  user?: string | { name?: string; email?: string };

  detail?: string;
  content?: string;
  description?: string;

  selected_region?: string;
  area?: string;

  note_year?: number;
  date?: string;
  created_at?: string;

  [k: string]: any;
};

function deriveId(n: any) {
  return n?.id ?? n?.note_id ?? n?._id ?? n?.uuid ?? n?.pk ?? n?.ID;
}

type SortMode = 'title' | 'updated';
function tsFromNote(n: Note): number {
  const cands = [n.updated_at, n.created_at, n.date].filter(Boolean) as string[];
  for (const s of cands) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}
function byTitle(a: Note, b: Note) {
  const ta = (a.title ?? '').toString().trim().toLowerCase();
  const tb = (b.title ?? '').toString().trim().toLowerCase();
  if (ta && tb) return ta < tb ? -1 : ta > tb ? 1 : 0;
  if (ta && !tb) return -1;
  if (!ta && tb) return 1;
  return 0;
}
function byUpdatedDesc(a: Note, b: Note) {
  return tsFromNote(b) - tsFromNote(a);
}
function sortNotes(list: Note[], mode: SortMode) {
  const copy = list.slice();
  return mode === 'updated' ? copy.sort(byUpdatedDesc) : copy.sort(byTitle);
}

// Endpoints

const DELETE_ENDPOINTS = (id: string | number) => [
  { url: U(`/notes/${id}`), method: 'DELETE' as const },
  { url: U(`/notes?id=${encodeURIComponent(String(id))}`), method: 'DELETE' as const },
  { url: U(`/notes`), method: 'DELETE' as const, body: { id } },
  { url: U(`/notes/${id}/delete`), method: 'POST' as const },
  { url: U(`/notes/delete/${id}`), method: 'POST' as const },
  { url: U(`/notes/delete`), method: 'POST' as const, body: { id } },
  { url: U(`/notes/delete`), method: 'POST' as const, body: { note_id: id } },
  { url: U(`/notes/delete`), method: 'POST' as const, body: { _id: id } },
  { url: U(`/notes/remove`), method: 'POST' as const, body: { id } },
  { url: U(`/notes/destroy`), method: 'POST' as const, body: { id } },
];

function UPDATE_ENDPOINTS(
  id: string | number,
  p: { title?: string; details?: string; region?: string; year?: number | string | undefined },
  userId?: string | null
) {
  const { title, details, region, year } = p;
  const idVariants = [{ id }, { note_id: id }, { _id: id }];
  const baseVariants = [
    { title, details, region, year },
    { title, detail: details, region, year },
    { title, content: details, region, year },
    { title, description: details, region, year },
    { title, details, selected_region: region, year },
    { title, details, area: region, year },
    { title, details, region, note_year: year },
  ];
  const fieldVariants = baseVariants.map((v) => (userId ? { ...v, user_id: userId } : v));

  const bodies: any[] = [];
  for (const i of idVariants) for (const f of fieldVariants) bodies.push({ ...i, ...f });

  return [
    ...bodies.map((body) => ({ url: U(`/notes/${id}`), method: 'PUT' as const, body })),
    ...bodies.map((body) => ({ url: U(`/notes/${id}`), method: 'PATCH' as const, body })),
    ...bodies.map((body) => ({ url: U(`/notes/update`), method: 'POST' as const, body })),
    ...bodies.map((body) => ({ url: U(`/notes/edit`), method: 'POST' as const, body })),
    ...bodies.map((body) => ({ url: U(`/notes/update-note`), method: 'POST' as const, body })),
    ...bodies.map((body) => ({ url: U(`/notes/${id}/update`), method: 'POST' as const, body })),
    ...bodies.map((body) => ({ url: U(`/notes/${id}/edit`), method: 'POST' as const, body })),
  ];
}

const SHARE_ENDPOINTS = (id: string | number, email: string) => [
  { url: U(`/notes/${id}/share`), method: 'POST' as const, body: { email } },
  { url: U(`/notes/share`), method: 'POST' as const, body: { id, email } },
  { url: U(`/notes/share`), method: 'POST' as const, body: { note_id: id, email } },
];

// Create duplicate notes
function CREATE_ENDPOINTS(payloads: any[]) {
  const urls = [U('/notes/create'), U('/notes'), U('/notes/new'), U('/create-note')];
  const out: Array<{ url: string; method: 'POST'; body: any }> = [];
  for (const url of urls) for (const body of payloads) out.push({ url, method: 'POST' as const, body });
  return out;
}

async function safeText(res: Response) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
async function tryEndpointsValidated(
  candidates: Array<{ url: string; method: 'DELETE' | 'PUT' | 'PATCH' | 'POST'; body?: any }>,
  validator?: (res: Response) => Promise<boolean>
): Promise<Response> {
  let lastErr: any = null;
  for (const c of candidates) {
    try {
      const init: RequestInit = { method: c.method, credentials: 'include' };
      if (typeof c.body !== 'undefined') {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = JSON.stringify(c.body);
      }
      const res = await fetch(c.url, init);
      if (!res.ok && res.status !== 204) {
        const txt = await safeText(res);
        lastErr = new Error(`${c.method} ${c.url} -> ${res.status} ${res.statusText} :: ${txt}`);
        continue;
      }
      if (validator) {
        try {
          if (await validator(res.clone())) return res;
        } catch (e) {
          lastErr = e;
          continue;
        }
        const txt = await safeText(res.clone());
        lastErr = new Error(`Validator rejected success: ${txt}`);
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('All endpoint attempts failed');
}
async function tryEndpoints(
  candidates: Array<{ url: string; method: 'DELETE' | 'PUT' | 'PATCH' | 'POST'; body?: any }>
) {
  return tryEndpointsValidated(candidates);
}

async function tryGetJson<T = any>(urls: string[]): Promise<T> {
  let lastErr: any = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) {
        lastErr = new Error(`GET ${url} -> ${res.status}`);
        continue;
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('All GET attempts failed');
}

function SINGLE_NOTE_URLS(id: string | number) {
  const q = encodeURIComponent(String(id));
  return [
    U(`/notes/${q}`),
    U(`/note/${q}`),
    U(`/notes?id=${q}`),
    U(`/notes/${q}/view`),
    U(`/notes/get?id=${q}`),
  ];
}

async function getNoteByIdNormalized(id: string | number): Promise<Note | null> {
  for (const url of SINGLE_NOTE_URLS(id)) {
    try {
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      const n =
        data?.note ?? data?.data?.note ?? (Array.isArray(data) ? data.find((x: any) => deriveId(x) === id) : data);
      if (n && typeof n === 'object') return n as Note;
    } catch {}
  }
  return null;
}

// Collections helpers

function extractCollectionNames(data: any): string[] {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter((x) => typeof x === 'string');

  if (Array.isArray(data?.collections)) {
    return data.collections
      .map((x: any) => (typeof x === 'string' ? x : x?.name || x?.title))
      .filter(Boolean);
  }
  if (Array.isArray(data?.data?.collections)) {
    return data.data.collections
      .map((x: any) => (typeof x === 'string' ? x : x?.name || x?.title))
      .filter(Boolean);
  }

  if (data?.collections && typeof data.collections === 'object') return Object.keys(data.collections);
  if (data?.collection && typeof data.collection === 'object') return Object.keys(data.collection);

  if (Array.isArray(data?.items)) {
    return data.items.map((x: any) => (typeof x === 'string' ? x : x?.name || x?.title)).filter(Boolean);
  }
  return [];
}

function normalizeCollectionArray(name: string, raw: any): any[] {
  if (!raw) return [];

  // direct note lists
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.notes)) return raw.notes;
  if (Array.isArray(raw?.data?.items)) return raw.data.items;
  if (Array.isArray(raw?.data?.notes)) return raw.data.notes;

  // single collection object
  const aliases = [raw?.name, raw?.collection, raw?.collectionName, raw?.title];
  if (aliases.some((n) => n === name)) {
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.notes)) return raw.notes;
    if (Array.isArray(raw?.data?.items)) return raw.data.items;
    if (Array.isArray(raw?.data?.notes)) return raw.data.notes;
  }

  // map of collections
  const mapCandidates = [
    raw?.collection,
    raw?.collections,
    raw?.items,
    raw?.notes,
    raw?.data?.collection,
    raw?.data?.collections,
    raw?.data?.items,
    raw?.data?.notes,
  ];
  for (const map of mapCandidates) {
    if (map && typeof map === 'object') {
      const node = (map as any)[name];
      if (Array.isArray(node)) return node;
      if (Array.isArray(node?.items)) return node.items;
      if (Array.isArray(node?.notes)) return node.notes;
    }
  }

  // list of collections
  const listCandidates = [
    raw?.collections,
    raw?.data?.collections,
    raw?.list,
    raw?.data?.list,
    raw?.collection_list,
    raw?.data?.collection_list,
    Array.isArray(raw) ? raw : null,
  ].filter(Boolean);
  for (const list of listCandidates) {
    if (Array.isArray(list)) {
      const found = (list as any[]).find(
        (c: any) => c === name || c?.name === name || c?.title === name || c?.collectionName === name
      );
      if (found) {
        if (Array.isArray(found?.items)) return found.items;
        if (Array.isArray(found?.notes)) return found.notes;
        if (Array.isArray(found?.data?.items)) return found.data.items;
        if (Array.isArray(found?.data?.notes)) return found.data.notes;
      }
    }
  }

  return [];
}

async function getCollectionsListByUser(userId: string): Promise<string[]> {
  const urls = [U(`/collections?user_id=${encodeURIComponent(userId)}`), U(`/collections`)];
  for (const url of urls) {
    try {
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      const names = extractCollectionNames(data);
      if (names.length) return names;
    } catch {}
  }
  return [];
}

async function getCollectionItemsByUser(name: string, userId: string): Promise<any[]> {
  const urls = [
    U(`/collections?user_id=${encodeURIComponent(userId)}&name=${encodeURIComponent(name)}`),
    U(`/collections?user_id=${encodeURIComponent(userId)}&collection=${encodeURIComponent(name)}`),
    U(`/collections?user_id=${encodeURIComponent(userId)}`),
    U(`/collections`),
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();

      if (Array.isArray(data?.items)) return data.items;
      if (Array.isArray(data?.notes)) return data.notes;
      if (Array.isArray(data?.data?.items)) return data.data.items;
      if (Array.isArray(data?.data?.notes)) return data.data.notes;

      let arr = normalizeCollectionArray(name, data);
      if (arr.length) return arr;

      if (data?.data) {
        arr = normalizeCollectionArray(name, data.data);
        if (arr.length) return arr;
      }
    } catch {}
  }
  return [];
}

// Grid adapter

function asGridNote(raw: any, fallbackAuthor = 'You'): GridNote {
  const n =
    raw && typeof raw === 'object'
      ? 'note' in raw
        ? raw.note
        : raw?.data?.note
        ? raw.data.note
        : raw
      : raw;

  const idRaw = deriveId(n) ?? deriveId(raw) ?? n?.uuid ?? n?.pk ?? '';
  const id = String(idRaw || n?.title || Math.random().toString(36).slice(2));

  const title = n?.title ?? n?.name ?? 'Untitled';
  const details = n?.details ?? n?.detail ?? n?.content ?? n?.description ?? n?.body ?? '';
  const region = n?.region ?? n?.selected_region ?? n?.area ?? undefined;
  const year = n?.year ?? n?.note_year ?? (n?.created_at ? new Date(n.created_at).getFullYear() : undefined);
  const updatedAt = n?.updated_at ?? n?.created_at ?? undefined;

  // Author display: prefer owner.name/email, then fallbacks
  const ownersName =
    (typeof n?.owner === 'object' ? n?.owner?.name : undefined) ||
    (typeof n?.owner === 'string' ? n?.owner : undefined) ||
    n?.owner_name;
  const ownersEmail = (typeof n?.owner === 'object' ? n?.owner?.email : undefined) || n?.user_email;

  const authors =
    ownersName && ownersName.trim()
      ? ownersName
      : ownersEmail && ownersEmail.trim()
      ? String(ownersEmail).split('@')[0]
      : typeof n?.author === 'string'
      ? n.author
      : Array.isArray(n?.authors)
      ? n.authors.join(', ')
      : n?.created_by || n?.username || fallbackAuthor;

  return { id, title, authors, details, region, year, updatedAt };
}

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[4000] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="
          relative z-[4001] w-[min(92vw,720px)] max-w-xl
          rounded-2xl p-6 shadow-2xl
          bg-[var(--panel-bg)]
          text-[var(--page-text)]
          border border-[color-mix(in_oklab,var(--page-text)_12%,transparent)]
        "
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold leading-tight">{title}</h3>
          <button
            onClick={onClose}
            className="
              rounded-full px-2 py-1 text-sm
              text-[var(--page-text)]
              hover:bg-[color-mix(in_oklab,var(--page-text)_10%,transparent)]
            "
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>
        <div className="text-sm text-[var(--page-text)]">{children}</div>
      </div>
    </div>
  );
}

function SmallIconBtn({
  children,
  onClick,
  label,
  tone = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  tone?: 'default' | 'danger';
}) {
  const base = `
    inline-flex items-center justify-center rounded-lg p-1.5 
    transition active:scale-95 
    text-[var(--text)]
    hover:bg-[var(--button-hover)]
    `;

  const danger = `
    text-[var(--danger-text)]
    hover:bg-[var(--danger-bg-hover)]
    `;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`${base} ${tone === 'danger' ? danger : ''}`}
    >
      {children}
    </button>
  );
}

function extractAtlasJSON(details?: string | null): any | null {
  if (!details) return null;

  // fenced: ```atlas { ... } ```
  const fenced = details.match(/```atlas\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      /* ignore */
    }
  }

  // inline: "... atlas { ... } ..."
  const ix = details.toLowerCase().indexOf('atlas');
  if (ix >= 0) {
    const brace = details.indexOf('{', ix);
    if (brace >= 0) {
      const tail = details.slice(brace);
      const end = tail.lastIndexOf('}');
      if (end >= 0) {
        try {
          return JSON.parse(tail.slice(0, end + 1));
        } catch {
          /* ignore */
        }
      }
    }
  }
  return null;
}

/** Remove only the fenced atlas payload; keep the user's prose. */
function stripAtlasFence(details?: string | null): string {
  if (!details) return '';
  return details.replace(/```atlas\s*[\s\S]*?```/gi, '').trim();
}
function fenceAtlas(meta: any) {
  return `\n\n\`\`\`atlas\n${JSON.stringify(meta)}\n\`\`\``;
}
function buildDetailsForSave(plain: string, meta: any | null, region: string) {
  const text = plain.trim();
  if (!meta) return text;
  const m = { ...meta };
  if (region?.trim()) m.selected_region = region.trim();
  return `${text}${fenceAtlas(m)}`;
}
function btoaUtf8(s: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.btoa(unescape(encodeURIComponent(s)));
  } catch {
    return '';
  }
}

// Component

type ViewMode = 'grid' | 'list';

export default function UserNotes({ addedNote, scope, onOpenNote }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);

  // Notice banner + tone (success vs. error)
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<'success' | 'error'>('error');
  const showSuccess = (msg: string) => {
    setNotice(msg);
    setNoticeTone('success');
  };
  const showError = (msg: string) => {
    setNotice(msg);
    setNoticeTone('error');
  };
  const clearNotice = () => setNotice(null);

  const [currentUser, setCurrentUser] = useState<string | null>(null);

  const [sortMode, setSortMode] = useState<SortMode>('title');

  // Edit modal
  const [editing, setEditing] = useState<Note | null>(null);
  const [editingMeta, setEditingMeta] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', details: '', region: '', year: '' });

  // Share modal
  const [sharing, setSharing] = useState<Note | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  // Add-to-collection modal
  const [collecting, setCollecting] = useState<Note | null>(null);
  const [collections, setCollections] = useState<string[]>([]);
  const [collectionMode, setCollectionMode] = useState<'existing' | 'new'>('existing');
  const [selectedCollection, setSelectedCollection] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [collectBusy, setCollectBusy] = useState(false);
  const [collectMsg, setCollectMsg] = useState<string | null>(null);

  // Collections list
  const [folderNames, setFolderNames] = useState<string[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);

  // Replace top grid with selected collection
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [activeNotes, setActiveNotes] = useState<GridNote[]>([]);
  const [activeLoading, setActiveLoading] = useState(false);

  // NEW: quick-create collection state
  const [creating, setCreating] = useState(false);

  // View pref
  const [view, setView] = useState<ViewMode>('grid');
  useEffect(() => {
    const pref = typeof window !== 'undefined' ? (localStorage.getItem('notes:view') as ViewMode) : null;
    if (pref === 'list' || pref === 'grid') setView(pref);
  }, []);
  const setViewPersist = (v: ViewMode) => {
    setView(v);
    if (typeof window !== 'undefined') localStorage.setItem('notes:view', v);
  };

  // Current user
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(U('/whoami'), { credentials: 'include', cache: 'no-store' });
        const data = await res.json();
        if (!cancelled && data?.message) setCurrentUser(data.message);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const router = useRouter();

  /** Open Atlas directly (fallback if parent didn't provide onOpenNote). */
  function openInAtlas(n: Note) {
    const rawDetails = getDetails(n);
    const meta = extractAtlasJSON(rawDetails) || null;
    const noteId = String(deriveId(n) ?? '');

    const payload: any = {
      note: {
        id: noteId,
        title: n.title ?? 'Untitled',
        region: n.region ?? n.selected_region ?? n.area ?? null,
        details: rawDetails ?? '',
      },
    };
    if (meta) payload.atlas = meta;

    try {
      localStorage.setItem('atlas:restore', JSON.stringify(payload));
    } catch {}
    const b64 = btoaUtf8(JSON.stringify(payload));
    const url = b64
      ? `/atlas?atlas_state=${encodeURIComponent(b64)}${
          noteId ? `&note_id=${encodeURIComponent(noteId)}` : ''
        }`
      : `/atlas${noteId ? `?note_id=${encodeURIComponent(noteId)}` : ''}`;
    router.push(url);
  }

  // Load notes
  const applySort = (list: Note[]) => sortNotes(list, sortMode);
  const reloadNotes = async () => {
    setLoading(true);
    clearNotice();
    try {
      // Explicitly force my-scope fetch from backend for non-admin UIs
      const url = scope === 'shared' ? U('/notes/shared') : U('/notes?scope=my');
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (scope === 'shared' && !res.ok) {
        showError('Shared notes are not available yet.');
        setNotes([]);
        return;
      }
      if (!res.ok) {
        setNotes([]);
        return;
      }
      const data = await res.json();
      const raw: Note[] =
        Array.isArray(data)
          ? data
          : Array.isArray(data?.notes)
          ? data.notes
          : Array.isArray(data?.data?.notes)
          ? data.data.notes
          : [];
      const normalized = raw.map((n) => {
        const stableId = String(deriveId(n));

        return {
          ...n,
          id: stableId,
          note_id: stableId,
          _id: stableId,
          uuid: stableId,
          pk: stableId,
          ID: stableId,
        };
      }) as Note[];
      setNotes(applySort(normalized));
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    reloadNotes();
  }, [scope, addedNote]);
  useEffect(() => {
    setNotes((prev) => applySort(prev));
  }, [sortMode]);

  // Load collections list
  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      setFoldersLoading(true);
      try {
        setFolderNames(await getCollectionsListByUser(currentUser));
      } catch {
        setFolderNames([]);
      } finally {
        setFoldersLoading(false);
      }
    })();
  }, [currentUser, notes.length]);

  // Helpers to render fields
  const getAuthor = (n: Note) => {
    // Prefer canonical owner fields from API
    const ownerName =
      (typeof n.owner === 'object' ? n.owner?.name : undefined) ||
      (typeof n.owner === 'string' ? n.owner : undefined) ||
      n.owner_name;

    const ownerEmail = (typeof n.owner === 'object' ? n.owner?.email : undefined) || n.user_email;

    if (ownerName && ownerName.trim()) return ownerName;
    if (ownerEmail && ownerEmail.trim()) return String(ownerEmail).split('@')[0];

    // Legacy fallbacks
    const cand: (string | undefined)[] = [
      n.author,
      Array.isArray(n.authors) ? n.authors.join(', ') : undefined,
      n.created_by,
      n.createdBy,
      n.creator,
      n.username,
      n.user_name,
      typeof n.user === 'string' ? n.user : n.user?.name || n.user?.email,
    ];
    return cand.find(Boolean) ?? (scope === 'my' ? currentUser ?? '—' : '—');
  };

  const getDetails = (n: Note) => n.details ?? n.detail ?? n.content ?? n.description ?? '—';
  const getRegion = (n: Note) => n.region ?? n.selected_region ?? n.area ?? '—';
  const getYear = (n: Note) => {
    const yr = n.year ?? n.note_year;
    const fromDates = n.date
      ? new Date(n.date).getFullYear()
      : n.updated_at
      ? new Date(n.updated_at).getFullYear()
      : n.created_at
      ? new Date(n.created_at).getFullYear()
      : undefined;
    return yr ?? fromDates ?? '—';
  };

  // Actions: delete / edit / save
  const [internalNotice, setInternalNotice] = useState<string | null>(null);

  const onDelete = async (n: Note) => {
    const realId = deriveId(n);
    if (realId == null) {
      showError('Delete failed: could not determine note id.');
      return;
    }
    if (!window.confirm(`Delete "${n.title ?? 'this note'}"?`)) return;
    const prev = notes;
    setNotes(applySort(notes.filter((x) => String(deriveId(x)) !== String(realId))));
    try {
      await tryEndpoints(DELETE_ENDPOINTS(realId));
      await reloadNotes();

      // If a collection is active, refresh its items so the view stays in sync
      if (activeCollection && currentUser) {
        try {
          setActiveLoading(true);
          const items = await getCollectionItemsByUser(activeCollection, currentUser);
          setActiveNotes(items.map((it: any) => asGridNote(it, currentUser)));
        } finally {
          setActiveLoading(false);
        }
      }
    } catch (e: any) {
      setNotes(prev);
      showError(
        typeof e?.message === 'string' ? `Delete failed: ${e.message}` : 'Delete failed.'
      );
    }
  };

  // open editor: strip fenced atlas block in textarea, keep meta separately
  const openEdit = (n: Note) => {
    clearNotice();
    setEditing(n);

    const raw = String(getDetails(n));
    const meta = extractAtlasJSON(raw);
    setEditingMeta(meta ?? null);

    setForm({
      title: String(n.title ?? ''),
      details: stripAtlasFence(raw),
      region: String(n.region ?? n.selected_region ?? n.area ?? ''),
      year: String(n.year ?? n.note_year ?? ''),
    });
  };
  const closeEdit = () => {
    setEditing(null);
    setEditingMeta(null);
    setSaving(false);
  };

  /** Validate update by inspecting server response *or* refetching the note. */
  async function validateUpdateResponse(
    res: Response,
    id: string | number,
    expected: { title?: string; details?: string; region?: string; year?: number | string | undefined }
  ): Promise<boolean> {
    try {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.clone().json();
        if (data?.success === true || data?.updated === true || data?.status === 'ok') return true;
        const note = data?.note ?? data?.data?.note ?? data;
        if (note && typeof note === 'object') {
          const det = note.details ?? note.detail ?? note.content ?? note.description ?? '';
          const matchTitle = expected.title ? note.title === expected.title : true;
          const matchRegion = expected.region
            ? note.region === expected.region ||
              note.selected_region === expected.region ||
              note.area === expected.region
            : true;
          const matchYear = expected.year ? note.year === expected.year || note.note_year === expected.year : true;
          const snippet = (expected.details ?? '').toString().slice(0, 12);
          const matchDet = snippet ? typeof det === 'string' && det.includes(snippet) : true;
          if (matchTitle && matchRegion && matchYear && matchDet) return true;
        }
      }
    } catch {
      /* fall through */
    }

    // Fallback: refetch and compare
    try {
      const latest = await getNoteByIdNormalized(id);
      if (!latest) return res.ok;
      const det = latest.details ?? latest.detail ?? latest.content ?? latest.description ?? '';
      const matchTitle = expected.title ? latest.title === expected.title : true;
      const matchRegion = expected.region
        ? latest.region === expected.region ||
          latest.selected_region === expected.region ||
          latest.area === expected.region
        : true;
      const matchYear = expected.year
        ? latest.year === expected.year || latest.note_year === expected.year
        : true;
      const snippet = (expected.details ?? '').toString().slice(0, 12);
      const matchDet = snippet ? typeof det === 'string' && det.includes(snippet) : true;
      return matchTitle && matchRegion && matchYear && matchDet;
    } catch {
      return res.ok;
    }
  }

  const onSave = async () => {
    if (!editing) return;
    const realId = deriveId(editing);
    if (realId == null) {
      showError('Note did not update: missing id.');
      return;
    }
    const normalizedYear = form.year?.toString().trim().length ? Number(form.year) : undefined;

    // Re-attach atlas meta so Atlas restore still works
    const detailsForSave = buildDetailsForSave(form.details, editingMeta, form.region);

    const payload = {
      title: form.title.trim(),
      details: detailsForSave,
      region: form.region.trim(),
      year: Number.isFinite(normalizedYear as number) ? (normalizedYear as number) : undefined,
    };

    const prev = notes;
    setSaving(true);
    clearNotice();

    // Optimistic UI for main notes list
    const updated = notes.map((x) =>
      String(deriveId(x)) === String(realId) ? { ...x, ...payload, updated_at: new Date().toISOString() } : x
    );
    setNotes(sortNotes(updated, sortMode));

    try {
      await tryEndpointsValidated(
        UPDATE_ENDPOINTS(realId, payload, currentUser),
        (r) => validateUpdateResponse(r, realId, payload)
      );
      await reloadNotes(); // now safe to refresh from server

      // Also refresh active collection view (if we're inside a collection)
      if (activeCollection && currentUser) {
        try {
          setActiveLoading(true);
          const items = await getCollectionItemsByUser(activeCollection, currentUser);
          setActiveNotes(items.map((it: any) => asGridNote(it, currentUser)));
        } finally {
          setActiveLoading(false);
        }
      }

      closeEdit();
    } catch (e: any) {
      // Roll back optimistic UI
      setNotes(prev);
      setSaving(false);
      showError(typeof e?.message === 'string' ? `Note did not update: ${e.message}` : 'Note did not update.');
    }
  };

  // Share
  const openShare = (n: Note) => {
    setShareMsg(null);
    setShareEmail('');
    setSharing(n);
  };
  const closeShare = () => {
    setSharing(null);
    setShareBusy(false);
    setShareMsg(null);
    setShareEmail('');
  };
  const onShare = async () => {
    if (!sharing) return;
    const realId = deriveId(sharing);
    if (realId == null) return;
    const email = shareEmail.trim();
    if (!email) {
      setShareMsg('Please enter an email.');
      return;
    }
    setShareBusy(true);
    setShareMsg(null);
    try {
      await tryEndpoints(SHARE_ENDPOINTS(realId, email));
      setShareMsg('Shared successfully');
    } catch {
      setShareMsg('Failed to share. Check server routes and try again.');
    } finally {
      setShareBusy(false);
    }
  };

  const openCollect = async (n: Note) => {
    setCollectMsg(null);
    setCollectionMode('existing');
    setSelectedCollection('');
    setNewCollectionName('');
    setCollecting(n);

    try {
      if (currentUser) {
        setCollections(await getCollectionsListByUser(currentUser));
      } else {
        const data = await tryGetJson<any>([U('/collections')]);
        setCollections(extractCollectionNames(data));
      }
    } catch {
      /* ignore */
    }
  };
  const closeCollect = () => {
    setCollecting(null);
    setCollectBusy(false);
    setCollectMsg(null);
    setSelectedCollection('');
    setNewCollectionName('');
  };
  async function validateAddResponse(res: Response): Promise<boolean> {
    try {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        if (data?.success === true || data?.added === true) return true;
        const msg = (data?.message || data?.status || '').toString().toLowerCase();
        return msg.includes('added') || msg === 'ok' || msg === 'success';
      }
      if (res.status === 201 || res.status === 204) return true;
      const text = (await res.text()).toLowerCase();
      return text.includes('added') && !text.includes('required');
    } catch {
      return false;
    }
  }
  const onCollect = async () => {
    if (!collecting) return;
    const realId = deriveId(collecting);
    if (realId == null) return;

    const isNew = collectionMode === 'new';
    const name = isNew ? newCollectionName.trim() : selectedCollection.trim();
    if (!name) {
      setCollectMsg('Please provide a collection name.');
      return;
    }
    if (isNew && name.toLowerCase() === 'new') {
      setCollectMsg('Please choose an actual collection name (not "new").');
      return;
    }

    setCollectBusy(true);
    setCollectMsg(null);
    try {
      if (isNew) {
        await tryEndpointsValidated(
          [
            { url: U(`/collections`), method: 'POST', body: { collectionName: name, user_id: currentUser } },
            { url: U(`/collections/create`), method: 'POST', body: { collectionName: name, user_id: currentUser } },
            { url: U(`/collection`), method: 'POST', body: { name, user_id: currentUser } },
            { url: U(`/collections/new`), method: 'POST', body: { name, user_id: currentUser } },
          ],
          async (r) => {
            try {
              const d = await r.clone().json();
              return (
                d?.success === true ||
                !!d?.id ||
                !!d?._id ||
                !!d?.collectionName ||
                r.status === 201
              );
            } catch {
              return r.ok || r.status === 201;
            }
          }
        );
      }

      await tryEndpointsValidated(
        [
          {
            url: U(`/collections/add?user_id=${encodeURIComponent(currentUser ?? '')}`),
            method: 'POST',
            body: {
              note: collecting,
              note_id: realId,
              id: realId,
              collectionName: name,
              user_id: currentUser,
            },
          },
        ],
        validateAddResponse
      );

      setCollectMsg('Added to collection');

      if (currentUser) setFolderNames(await getCollectionsListByUser(currentUser));
    } catch {
      setCollectMsg('Could not add to collection.');
    } finally {
      setCollectBusy(false);
    }
  };

  async function validateCreateResponse(res: Response): Promise<boolean> {
    try {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        return res.ok || !!data?.id || !!data?._id || data?.success === true;
      }
      return res.ok || res.status === 201;
    } catch {
      return false;
    }
  }

  async function duplicateNote(n: Note) {
    if (!currentUser) {
      showError('Cannot duplicate: user unknown.');
      return;
    }
    const baseTitle = n.title ?? 'Untitled';
    const newTitle = `${baseTitle} (Copy)`;
    const det = getDetails(n);
    const region = (n.region ?? n.selected_region ?? n.area) || undefined;
    const id = deriveId(n);

    // Include clone_id so backend can copy atlas metadata & fenced block if needed
    const bodies = [
      { title: newTitle, content: det, region, user_id: currentUser, clone_id: id },
      { title: newTitle, details: det, selected_region: region, user_id: currentUser, clone_id: id },
      { title: newTitle, description: det, area: region, user_id: currentUser, clone_id: id },
    ];

    try {
      // IMPORTANT: no extra validator here to avoid multiple creates
      await tryEndpoints(CREATE_ENDPOINTS(bodies));
      await reloadNotes();
      showSuccess(`Duplicated "${baseTitle}"`);
    } catch (e: any) {
      showError(typeof e?.message === 'string' ? `Duplicate failed: ${e.message}` : 'Duplicate failed.');
    }
  }

  const gridNotes: GridNote[] = useMemo(
    () =>
      notes.map((n) => ({
        id: String(deriveId(n)),
        title: n.title ?? 'Untitled',
        authors: getAuthor(n),
        details: getDetails(n),
        region: (() => {
          const r = getRegion(n);
          return r === '—' ? undefined : r;
        })(),
        year: (() => {
          const yr = n.year ?? n.note_year;
          const fromDates = n.date
            ? new Date(n.date).getFullYear()
            : n.updated_at
            ? new Date(n.updated_at).getFullYear()
            : n.created_at
            ? new Date(n.created_at).getFullYear()
            : undefined;
          return yr ?? fromDates ?? undefined;
        })(),
        updatedAt: n.updated_at ?? n.created_at ?? undefined,
      })),
    [notes, currentUser, scope]
  );

  const handleGridEdit = (g: GridNote) => {
    const found = notes.find((x) => String(deriveId(x)) === String(g.id));
    if (found) openEdit(found);
    else setInternalNotice('Unable to open note for editing from this collection.');
  };
  const handleGridDelete = (g: GridNote) => {
    const found = notes.find((x) => String(deriveId(x)) === String(g.id));
    if (found) onDelete(found);
    else setInternalNotice('Unable to delete this item from the collection view.');
  };
  const handleGridShare = (g: GridNote) => {
    const found = notes.find((x) => String(deriveId(x)) === String(g.id));
    if (found) openShare(found);
    else setInternalNotice('Unable to share this item from the collection view.');
  };
  const handleGridAddToCollection = (g: GridNote) => {
    const found = notes.find((x) => String(deriveId(x)) === String(g.id));
    if (found) openCollect(found);
    else setInternalNotice('Unable to add this item from the collection view.');
  };
  const handleGridDuplicate = (g: GridNote) => {
    const found = notes.find((x) => String(deriveId(x)) === String(g.id));
    if (found) duplicateNote(found);
    else setInternalNotice('Unable to duplicate from the collection view.');
  };
  const handleGridOpen = (g: GridNote) => {
    if (onOpenNote) {
      onOpenNote(g);
      return;
    }
    const found = notes.find((x) => String(deriveId(x)) === String(g.id));
    if (found) openInAtlas(found);
  };

  // top grid with a collection
  const activateCollection = async (name: string) => {
    if (!currentUser) return;
    setActiveCollection(name);
    setActiveLoading(true);
    try {
      const items: any[] = await getCollectionItemsByUser(name, currentUser);
      setActiveNotes(items.map((it: any) => asGridNote(it, currentUser)));
    } finally {
      setActiveLoading(false);
    }
  };
  const clearCollection = () => {
    setActiveCollection(null);
    setActiveNotes([]);
    setActiveLoading(false);
  };

  // Derived
  const displayTitle = activeCollection ? `Collection — ${activeCollection}` : 'Recent Notes';
  const displayNotes = activeCollection ? activeNotes : gridNotes;
  const displayBusy = activeCollection ? activeLoading : loading;

  if (loading && !activeCollection) return <div className="p-6 text-gray-500">Loading…</div>;

  // For list rows, pass only the user details (strip fenced JSON) to the table
  const listRows =
    activeCollection
      ? displayNotes.map((g) => ({
          id: g.id,
          title: g.title,
          authors: g.authors,
          details: stripAtlasFence(g.details),
          region: g.region ?? '—',
          year: g.year ?? '—',
          updated: g.updatedAt ? new Date(g.updatedAt as any).toLocaleDateString() : '—',
        }))
      : notes.map((n) => ({
          id: String(deriveId(n)),
          title: n.title ?? '—',
          authors: getAuthor(n),
          details: stripAtlasFence(getDetails(n)),
          region: getRegion(n),
          year: getYear(n),
          updated:
            n.updated_at
              ? new Date(n.updated_at).toLocaleDateString()
              : n.created_at
              ? new Date(n.created_at).toLocaleDateString()
              : '—',
        }));

  // helper to locate original Note by id for list actions
  const findNoteById = (id: string | number | undefined) =>
    notes.find((x) => String(deriveId(x)) === String(id));

  // NEW: quick create collection
  async function createCollection(name: string) {
    const bodies = [
      { url: U(`/collections`), method: 'POST' as const, body: { collectionName: name, user_id: currentUser } },
      { url: U(`/collection`), method: 'POST' as const, body: { name, user_id: currentUser } },
      {
        url: U(`/collections/create`),
        method: 'POST' as const,
        body: { collectionName: name, user_id: currentUser },
      },
      { url: U(`/collections/new`), method: 'POST' as const, body: { name, user_id: currentUser } },
    ];
    return tryEndpointsValidated(bodies, async (res) => {
      try {
        const d = await res.clone().json();
        return (
          d?.success === true ||
          !!d?.id ||
          !!d?._id ||
          !!d?.collectionName ||
          res.status === 201
        );
      } catch {
        return res.ok || res.status === 201;
      }
    });
  }
  const onCreateCollectionClick = async () => {
    if (!currentUser) {
      showError('Please sign in first.');
      return;
    }
    const name = window.prompt('New collection name');
    if (!name || !name.trim()) return;
    setCreating(true);
    try {
      await createCollection(name.trim());
      setFolderNames(await getCollectionsListByUser(currentUser));
      showSuccess(`Created collection "${name.trim()}"`);
    } catch (e: any) {
      showError(
        typeof e?.message === 'string'
          ? `Could not create collection: ${e.message}`
          : 'Could not create collection.'
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      {/* ===== NOTICE BANNER ===== */}
      {(notice || internalNotice) && (
        <div
          className={`
          mb-3 rounded border px-4 py-3 text-sm
          ${
            internalNotice
              ? 'bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-text)]'
              : noticeTone === 'success'
              ? 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-text)]'
              : 'bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-text)]'
          }
        `}
        >
          {notice || internalNotice}
        </div>
      )}

      {/* ===== TOP BAR ===== */}
      <div className="mb-3 flex items-center justify-between">
        {/* Title + Back */}
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-[var(--text)]">{displayTitle}</h2>

          {activeCollection && (
            <button
              onClick={clearCollection}
              className="
              rounded border border-[var(--border-color)]
              px-2 py-1 text-xs 
              text-[var(--text)]
              hover:bg-[var(--button-hover)]
            "
              title="Back to all notes"
            >
              ← Back to All
            </button>
          )}
        </div>

        {/* Sort + View Switch */}
        <div className="flex items-center gap-3">
          {/* Sort dropdown */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--text-muted)]">Sort by:</label>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="
              rounded border border-[var(--border-color)]
              px-2 py-1 text-sm
              bg-[var(--bg)] text-[var(--text)]
              focus:outline-none focus:ring-2 focus:ring-blue-500
            "
            >
              <option value="title" className="text-[var(--text)]">
                Title (A–Z)
              </option>
              <option value="updated" className="text-[var(--text)]">
                Last Updated (newest)
              </option>
            </select>
          </div>

          {/* Grid/List buttons */}
          <div className="inline-flex rounded-xl border border-[var(--border-color)] p-1">
            <button
              onClick={() => setViewPersist('grid')}
              aria-pressed={view === 'grid'}
              className={`
              px-3 py-1.5 rounded-lg text-sm transition
              ${
                view === 'grid'
                  ? 'bg-[var(--button-bg)] text-[var(--button-text)]'
                  : 'hover:bg-[var(--button-hover)] text-[var(--text)]'
              }
            `}
            >
              Grid
            </button>

            <button
              onClick={() => setViewPersist('list')}
              aria-pressed={view === 'list'}
              className={`
              px-3 py-1.5 rounded-lg text-sm transition
              ${
                view === 'list'
                  ? 'bg-[var(--button-bg)] text-[var(--button-text)]'
                  : 'hover:bg-[var(--button-hover)] text-[var(--text)]'
              }
            `}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {/* ===== GRID VIEW ===== */}
      {view === 'grid' ? (
        displayBusy ? (
          <div className="p-6 text-sm opacity-70 text-[var(--text-muted)]">Loading…</div>
        ) : (
          <GridNotesBoard
            notes={displayNotes}
            onEdit={handleGridEdit}
            onShare={handleGridShare}
            onCopyLink={handleGridAddToCollection}
            onDownload={handleGridDuplicate}
            onDelete={handleGridDelete}
            onOpen={handleGridOpen}
          />
        )
      ) : (
        /* ===== LIST VIEW ===== */
        <div className="overflow-x-auto rounded-lg border border-[var(--border-color)] bg-[var(--bg-alt)]">
          <table className="min-w-full text-sm text-[var(--text)]">
            <thead className="bg-[var(--bg-alt)] text-left text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Author(s)</th>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3">Region</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Last Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--border-color)]">
              {listRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-[var(--text-muted)]"
                  >
                    No notes yet
                  </td>
                </tr>
              ) : (
                listRows.map((r) => {
                  const id = r.id;
                  const noteForRow = findNoteById(id);
                  const gridForRow = noteForRow
                    ? asGridNote(noteForRow, currentUser ?? 'You')
                    : null;

                  return (
                    <tr key={String(id)}>
                      <td className="px-4 py-3">
                        <button
                          className="underline decoration-dotted underline-offset-2 hover:decoration-solid text-[var(--text)]"
                          onClick={() => {
                            if (onOpenNote && gridForRow) onOpenNote(gridForRow);
                            else if (noteForRow) openInAtlas(noteForRow);
                          }}
                        >
                          {r.title}
                        </button>
                      </td>
                      <td className="px-4 py-3">{r.authors}</td>
                      <td className="px-4 py-3">{r.details}</td>
                      <td className="px-4 py-3">{r.region}</td>
                      <td className="px-4 py-3">{r.year}</td>
                      <td className="px-4 py-3">{r.updated}</td>

                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5 text-[var(--text)]">
                          {/* SmallIconBtn already inherits proper color variables */}
                          <SmallIconBtn
                            label="Open in Atlas"
                            onClick={() => onOpenNote?.(gridForRow!)}
                          >
                            <Eye size={16} />
                          </SmallIconBtn>

                          <SmallIconBtn
                            label="Edit"
                            onClick={() => noteForRow && openEdit(noteForRow)}
                          >
                            <Pencil size={16} />
                          </SmallIconBtn>

                          <SmallIconBtn
                            label="Share"
                            onClick={() => noteForRow && openShare(noteForRow)}
                          >
                            <Share2 size={16} />
                          </SmallIconBtn>

                          <SmallIconBtn
                            label="Add to collection"
                            onClick={() => noteForRow && openCollect(noteForRow)}
                          >
                            <FolderPlus size={16} />
                          </SmallIconBtn>

                          <SmallIconBtn
                            label="Duplicate"
                            onClick={() => noteForRow && duplicateNote(noteForRow)}
                          >
                            <Copy size={16} />
                          </SmallIconBtn>

                          <SmallIconBtn
                            tone="danger"
                            label="Delete"
                            onClick={() => noteForRow && onDelete(noteForRow)}
                          >
                            <Trash2 size={16} />
                          </SmallIconBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ================== COLLECTIONS SECTION ================== */}
      <div className="mt-10 mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--text)]">Collections</h2>

        <div className="flex items-center gap-3 text-sm">
          <span className="opacity-70 text-[var(--text-muted)]">
            {foldersLoading ? 'Loading…' : `${folderNames.length} total`}
          </span>

          <button
            onClick={onCreateCollectionClick}
            disabled={creating || !currentUser}
            className="
            inline-flex items-center gap-2 rounded-md
            border border-[var(--border-color)]
            bg-[var(--button-bg)] text-[var(--button-text)]
            px-3 py-1.5 shadow-sm
            hover:bg-[var(--button-hover)]
            disabled:opacity-60
          "
          >
            <Plus size={16} />
            New Collection
          </button>
        </div>
      </div>

      {/* ===== Collection Cards ===== */}
      {foldersLoading ? (
        <div className="p-6 text-sm opacity-70 text-[var(--text-muted)]">
          Loading collections…
        </div>
      ) : folderNames.length === 0 ? (
        <div className="p-6 text-sm opacity-70 text-[var(--text-muted)]">
          No collections yet. Use the button above to create one.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {folderNames.map((name) => (
            <button
              key={name}
              onClick={() => activateCollection(name)}
              className="
              group text-left rounded-xl
              border border-[var(--border-color)]
              bg-[var(--bg-alt)]
              p-4 hover:shadow-md transition
            "
            >
              <div className="flex items-center gap-3">
                <div
                  className="
                  inline-flex h-10 w-10 items-center justify-center rounded-lg
                  bg-blue-200/80 text-blue-900
                "
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 7h5l2 2h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                    <path d="M3 13h18" />
                  </svg>
                </div>

                <div className="min-w-0">
                  <div className="truncate font-medium text-[var(--text)]">
                    {name}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* === SHARE NOTE MODAL === */}
      <Modal
        open={!!sharing}
        onClose={closeShare}
        title={
          sharing?.title ? `Share "${sharing.title}"` : 'Share note'
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-muted)]">
            Enter the email of the person you’d like to share this note with.
          </p>

          <input
            type="email"
            value={shareEmail}
            onChange={(e) => setShareEmail(e.target.value)}
            placeholder="name@example.com"
            className="
              w-full rounded-md border border-[var(--border-color)]
              px-3 py-2 text-sm
              bg-[var(--bg)] text-[var(--text)]
              focus:outline-none focus:ring-2 focus:ring-blue-500
            "
            disabled={shareBusy}
          />

          {shareMsg && (
            <div className="text-xs text-[var(--text)] opacity-80">
              {shareMsg}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeShare}
              className="
                rounded-md border border-[var(--border-color)]
                px-3 py-1.5 text-sm
                hover:bg-[var(--button-hover)]
              "
              disabled={shareBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onShare}
              disabled={shareBusy}
              className="
                rounded-md bg-[var(--button-bg)] px-3 py-1.5 text-sm
                text-[var(--button-text)] hover:bg-[var(--button-hover)]
                disabled:opacity-60
              "
            >
              {shareBusy ? 'Sharing…' : 'Share'}
            </button>
          </div>
        </div>
      </Modal>

      {/* === ADD TO COLLECTION MODAL === */}
      <Modal
        open={!!collecting}
        onClose={closeCollect}
        title={
          collecting?.title
            ? `Add "${collecting.title}" to collection`
            : 'Add note to collection'
        }
      >
        <div className="space-y-4">
          <div className="text-sm text-[var(--text-muted)]">
            Choose an existing collection, or create a new one.
          </div>

          {/* Mode toggle */}
          <div className="inline-flex rounded-xl border border-[var(--border-color)] p-1 text-sm">
            <button
              type="button"
              onClick={() => setCollectionMode('existing')}
              className={`
                px-3 py-1.5 rounded-lg transition
                ${
                  collectionMode === 'existing'
                    ? 'bg-[var(--button-bg)] text-[var(--button-text)]'
                    : 'hover:bg-[var(--button-hover)] text-[var(--text)]'
                }
              `}
            >
              Existing
            </button>
            <button
              type="button"
              onClick={() => setCollectionMode('new')}
              className={`
                px-3 py-1.5 rounded-lg transition
                ${
                  collectionMode === 'new'
                    ? 'bg-[var(--button-bg)] text-[var(--button-text)]'
                    : 'hover:bg-[var(--button-hover)] text-[var(--text)]'
                }
              `}
            >
              New
            </button>
          </div>

          {collectionMode === 'existing' ? (
            <div className="space-y-2">
              <label className="text-xs text-[var(--text-muted)]">
                Collection
              </label>
              <select
                value={selectedCollection}
                onChange={(e) => setSelectedCollection(e.target.value)}
                className="
                  w-full rounded-md border border-[var(--border-color)]
                  px-3 py-2 text-sm
                  bg-[var(--bg)] text-[var(--text)]
                  focus:outline-none focus:ring-2 focus:ring-blue-500
                "
                disabled={collectBusy || collections.length === 0}
              >
                <option value="">Select a collection…</option>
                {collections.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {collections.length === 0 && (
                <p className="text-xs text-[var(--text-muted)]">
                  You don’t have any collections yet. Switch to “New” to
                  create one.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs text-[var(--text-muted)]">
                New collection name
              </label>
              <input
                type="text"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="e.g. VPMpr – interesting slices"
                className="
                  w-full rounded-md border border-[var(--border-color)]
                  px-3 py-2 text-sm
                  bg-[var(--bg)] text-[var(--text)]
                  focus:outline-none focus:ring-2 focus:ring-blue-500
                "
                disabled={collectBusy}
              />
            </div>
          )}

          {collectMsg && (
            <div className="text-xs text-[var(--text)] opacity-80">
              {collectMsg}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeCollect}
              className="
                rounded-md border border-[var(--border-color)]
                px-3 py-1.5 text-sm
                hover:bg-[var(--button-hover)]
              "
              disabled={collectBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onCollect}
              disabled={collectBusy}
              className="
                rounded-md bg-[var(--button-bg)] px-3 py-1.5 text-sm
                text-[var(--button-text)] hover:bg-[var(--button-hover)]
                disabled:opacity-60
              "
            >
              {collectBusy ? 'Adding…' : 'Add to collection'}
            </button>
          </div>
        </div>
      </Modal>

      {/* === EDIT NOTE MODAL === */}
      {editing && (
        <div
          className="fixed inset-0 z-[5000] flex items-center justify-center"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeEdit}
          />

          {/* Modal Card */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="
        relative z-[5001] w-[min(92vw,850px)] max-h-[85vh] overflow-y-auto
        rounded-2xl shadow-2xl p-6

        bg-[var(--panel-bg)]
        text-[var(--page-text)]
        border border-[color-mix(in_oklab,var(--page-text)_10%,transparent)]

        [&_input]:bg-[var(--page-bg)]
        [&_input]:text-[var(--page-text)]
        [&_textarea]:bg-[var(--page-bg)]
        [&_textarea]:text-[var(--page-text)]
        [&_input]:border
        [&_textarea]:border
        [&_input]:border-[color-mix(in_oklab,var(--page-text)_20%,transparent)]
        [&_textarea]:border-[color-mix(in_oklab,var(--page-text)_20%,transparent)]
        [&_input::placeholder]:text-[color-mix(in_oklab,var(--page-text)_40%,transparent)]
        [&_textarea::placeholder]:text-[color-mix(in_oklab,var(--page-text)_40%,transparent)]
      "
          >
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Edit Note</h2>

              <button
                onClick={closeEdit}
                className="
            px-2 py-1 rounded text-[var(--page-text)]
            hover:bg-[color-mix(in_oklab,var(--page-text)_10%,transparent)]
          "
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <div className="flex flex-col gap-4">
              {/* Title + Region */}
              <div className="flex gap-3">
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  placeholder="Title"
                  className="flex-1 px-3 py-2 rounded"
                  disabled={saving}
                />

                <input
                  type="text"
                  value={form.region}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, region: e.target.value }))
                  }
                  placeholder="Region"
                  className="w-40 px-3 py-2 rounded"
                  disabled={saving}
                />
              </div>

              {/* Details */}
              <textarea
                value={form.details}
                onChange={(e) =>
                  setForm((f) => ({ ...f, details: e.target.value }))
                }
                placeholder="Details…"
                className="w-full h-48 resize-none px-3 py-2 rounded"
                disabled={saving}
              />

              {/* Year */}
              <input
                type="number"
                value={form.year}
                onChange={(e) =>
                  setForm((f) => ({ ...f, year: e.target.value }))
                }
                placeholder="Year"
                className="w-full px-3 py-2 rounded"
                disabled={saving}
              />

              {/* Error Message */}
              {notice && (
                <div className="text-red-400 text-sm">{notice}</div>
              )}

              {/* Buttons */}
              <div className="flex justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="
              px-4 py-2 rounded
              border border-[color-mix(in_oklab,var(--page-text)_20%,transparent)]
              hover:bg-[color-mix(in_oklab,var(--page-text)_10%,transparent)]
            "
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  onClick={onSave}
                  disabled={saving}
                  className="
              px-4 py-2 rounded font-medium
              bg-gray-300 text-black hover:bg-gray-400
              dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500
              disabled:opacity-50
            "
                >
                  {saving ? 'Saving…' : 'Save Note'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

