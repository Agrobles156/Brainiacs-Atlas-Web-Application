'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import GridNotesBoard, { GridNote } from '@/components/User-Notes/GridNotesBoard';
import { Eye, Pencil, Share2, Copy, Link as LinkIcon, Trash2 } from 'lucide-react';

type SortKey = 'updated' | 'title';
type Scope = 'mine' | 'shared' | 'all';

export default function NotesAdminView() {
  const [notes, setNotes] = useState<GridNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // toolbar state (same feel as user notes)
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('updated');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [scope, setScope] = useState<Scope>('all'); // Admin defaults to All

  const candidates = useMemo(
    () => ['/flask-api/admin/notes', '/flask-api/notes?scope=all'],
    []
  );

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    setErr(null);

    for (const base of candidates) {
      const url =
        base + (base.includes('?') ? '&' : '?') + `q=${encodeURIComponent(q)}&sort=${sort}`;
      try {
        const res = await fetch(url, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok) continue;

        // Accept array or {items:[]} or {message:[]}
        const rows = Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data)
          ? data
          : (data.message ?? []);

        const mapped: GridNote[] = (rows as any[]).map(mapApiToGridNote);
        setNotes(mapped);
        setLoading(false);
        return;
      } catch {
        // try next fallback
      }
    }

    setErr('Unable to load notes.');
    setNotes([]);
    setLoading(false);
  }, [candidates, q, sort]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Optional admin scope filtering to keep UI identical to user page
  const visible = useMemo(() => {
    let arr = [...notes];

    // In case you want real filters later, wire `scope` here.
    // For visual parity we keep 'all' by default.
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      arr = arr.filter((n) =>
        `${n.title} ${n.authors} ${n.details ?? ''} ${n.region ?? ''} ${n.year ?? ''}`
          .toLowerCase()
          .includes(needle)
      );
    }

    if (sort === 'title') {
      arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else {
      arr.sort((a, b) => {
        const da = a.updatedAt ? +new Date(a.updatedAt as any) : 0;
        const db = b.updatedAt ? +new Date(b.updatedAt as any) : 0;
        return db - da; // newest first
      });
    }
    return arr;
  }, [notes, q, sort, scope]);

  /** -------------------------------------------------------------------
   *  Additions to make icons fully functional (parity with user page)
   *  ------------------------------------------------------------------- */

  // --- added: small helpers used by the action fallbacks
  async function safeText(res: Response) {
    try { return await res.text(); } catch { return ''; }
  }
  async function tryEndpoints(
    candidates: Array<{ url: string; method: 'DELETE' | 'POST' | 'PUT' | 'PATCH'; body?: any }>
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
          lastErr = new Error(
            `${c.method} ${c.url} -> ${res.status} ${res.statusText} ${await safeText(res)}`
          );
          continue;
        }
        return res;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('All endpoint attempts failed');
  }

  // --- added: delete/duplicate endpoint generators (match backend aliases)
  const DELETE_ENDPOINTS = (id: string) => [
    { url: `/flask-api/notes/${encodeURIComponent(id)}`, method: 'DELETE' as const },
    { url: `/flask-api/notes?id=${encodeURIComponent(id)}`, method: 'DELETE' as const },
    { url: `/flask-api/notes/delete`, method: 'POST' as const, body: { id } },
    { url: `/flask-api/notes/delete`, method: 'POST' as const, body: { note_id: id } },
    { url: `/flask-api/notes/${encodeURIComponent(id)}/delete`, method: 'POST' as const },
    { url: `/flask-api/notes/remove`, method: 'POST' as const, body: { id } },
    { url: `/flask-api/notes/destroy`, method: 'POST' as const, body: { id } },
  ];

  function CREATE_ENDPOINTS(payloads: any[]) {
    const urls = [
      '/flask-api/notes/create',
      '/flask-api/notes',
      '/flask-api/notes/new',
      '/flask-api/create-note',
    ];
    const out: Array<{ url: string; method: 'POST'; body: any }> = [];
    for (const url of urls) for (const body of payloads) out.push({ url, method: 'POST', body });
    return out;
  }

  // --- added: atlas restore helpers so “Open” behaves like user page
  function extractAtlasJSON(details?: string | null): any | null {
    if (!details) return null;
    const fenced = details.match(/```atlas\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try { return JSON.parse(fenced[1]); } catch { /* ignore */ }
    }
    const ix = details.toLowerCase().indexOf('atlas');
    if (ix >= 0) {
      const brace = details.indexOf('{', ix);
      if (brace >= 0) {
        const tail = details.slice(brace);
        const end = tail.lastIndexOf('}');
        if (end >= 0) {
          try { return JSON.parse(tail.slice(0, end + 1)); } catch { /* ignore */ }
        }
      }
    }
    return null;
  }
  function btoaUtf8(s: string): string {
    try { return window.btoa(unescape(encodeURIComponent(s))); } catch { return ''; }
  }

  /** ---- Actions (wire to your routes as needed) ---------------------- */
  // --- updated: open note now restores atlas state (parity with user page)
  const openNote = (n: GridNote) => {
    const meta = extractAtlasJSON(n.details) || null;
    const payload: any = {
      note: {
        id: n.id,
        title: n.title ?? 'Untitled',
        region: n.region ?? null,
        details: n.details ?? '',
      },
    };
    if (meta) payload.atlas = meta;

    try { localStorage.setItem('atlas:restore', JSON.stringify(payload)); } catch {}
    const b64 = btoaUtf8(JSON.stringify(payload));
    const url = b64
      ? `/atlas?atlas_state=${encodeURIComponent(b64)}&note_id=${encodeURIComponent(n.id)}`
      : `/atlas?note_id=${encodeURIComponent(n.id)}`;
    window.location.href = url;
  };

  const editNote = (n: GridNote) =>
    (window.location.href = `/text-editor?note=${encodeURIComponent(n.id)}`);

  const shareNote = (n: GridNote) =>
    navigator.clipboard.writeText(`${location.origin}/notes/${n.id}`);

  const copyLink = (n: GridNote) =>
    navigator.clipboard.writeText(`${location.origin}/notes/${n.id}`);

  // --- updated: real duplicate using backend create aliases, then refresh
  const duplicateNote = async (n: GridNote) => {
    const baseTitle = n.title || 'Untitled';
    const newTitle = `${baseTitle} (Copy)`;
    const region = n.region || undefined;
    const bodies = [
      { title: newTitle, details: n.details ?? '', region },
      { title: newTitle, content: n.details ?? '', region },
      { title: newTitle, description: n.details ?? '', selected_region: region },
    ];
    try {
      await tryEndpoints(CREATE_ENDPOINTS(bodies));
      await fetchNotes(); // refresh list
    } catch (e) {
      console.error(e);
      alert('Duplicate failed. See console for details.');
    }
  };

  // --- updated: robust delete with all backend aliases + optimistic UI
  const deleteNote = async (n: GridNote) => {
    if (!confirm(`Delete "${n.title}"?`)) return;
    const prev = notes;
    setNotes((old) => old.filter((x) => x.id !== n.id)); // optimistic
    try {
      await tryEndpoints(DELETE_ENDPOINTS(n.id));
      // optionally re-fetch to be certain
      // await fetchNotes();
    } catch (e) {
      console.error(e);
      setNotes(prev); // rollback
      alert('Delete failed. See console for details.');
    }
  };

  /** ---- Toolbar (matches user page placement/style) ------------------ */
  const Toolbar = (
    <div className="flex items-center justify-end gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search Notes…"
        className="h-9 w-[280px] rounded-md border border-gray-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
      />
      <button
        onClick={fetchNotes}
        className="h-9 rounded-md bg-gray-800 px-3 text-sm font-medium text-white hover:bg-gray-900"
      >
        Search
      </button>
      <button
        className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium hover:bg-gray-100"
        onClick={() => (window.location.href = '/text-editor')}
      >
        Add New
      </button>

      <div className="ml-2 flex items-center gap-2">
        <button
          className={`h-8 rounded-md px-3 text-sm ${
            scope === 'mine' ? 'bg-gray-800 text-white' : 'border border-gray-300 bg-white hover:bg-gray-50'
          }`}
          onClick={() => setScope('mine')}
        >
          My Notes
        </button>
        <button
          className={`h-8 rounded-md px-3 text-sm ${
            scope === 'shared'
              ? 'bg-gray-800 text-white'
              : 'border border-gray-300 bg-white hover:bg-gray-50'
          }`}
          onClick={() => setScope('shared')}
        >
          Shared with me
        </button>
      </div>

      <span className="ml-3 text-sm text-gray-600">Sort by:</span>
      <select
        value={sort}
        onChange={(e) => setSort(e.target.value as SortKey)}
        className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm"
      >
        <option value="title">Title (A–Z)</option>
        <option value="updated">Last Updated</option>
      </select>

      <div className="ml-2 inline-flex overflow-hidden rounded-md border border-gray-300 bg-white text-sm">
        <button
          className={`px-3 py-1.5 ${view === 'grid' ? 'bg-gray-800 text-white' : 'hover:bg-gray-50'}`}
          onClick={() => setView('grid')}
        >
          Grid
        </button>
        <button
          className={`px-3 py-1.5 ${view === 'list' ? 'bg-gray-800 text-white' : 'hover:bg-gray-50'}`}
          onClick={() => setView('list')}
        >
          List
        </button>
      </div>
    </div>
  );

  /** ---- List view to mirror user page -------------------------------- */
  const ListView = (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Author(s)</th>
            <th className="px-4 py-3">Details</th>
            <th className="px-4 py-3">Region</th>
            <th className="px-4 py-3">Year</th>
            <th className="px-4 py-3">Last Updated</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((n) => (
            <tr key={n.id} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-3">
                <button onClick={() => openNote(n)} className="text-indigo-600 hover:underline">
                  {n.title || 'Untitled'}
                </button>
              </td>
              <td className="px-4 py-3">{n.authors}</td>
              <td className="px-4 py-3 truncate max-w-[28rem]">{n.details || '—'}</td>
              <td className="px-4 py-3">{n.region || '—'}</td>
              <td className="px-4 py-3">{n.year || '—'}</td>
              <td className="px-4 py-3">{fmt(n.updatedAt)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2 text-gray-700">
                  <Icon title="Open" onClick={() => openNote(n)}><Eye size={16} /></Icon>
                  <Icon title="Edit" onClick={() => editNote(n)}><Pencil size={16} /></Icon>
                  <Icon title="Share" onClick={() => shareNote(n)}><Share2 size={16} /></Icon>
                  <Icon title="Duplicate" onClick={() => duplicateNote(n)}><Copy size={16} /></Icon>
                  <Icon title="Copy link" onClick={() => copyLink(n)}><LinkIcon size={16} /></Icon>
                  <Icon title="Delete" danger onClick={() => deleteNote(n)}><Trash2 size={16} /></Icon>
                </div>
              </td>
            </tr>
          ))}
          {!loading && visible.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-gray-500">No notes found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
   
    <div className="px-6 pt-2">
      {/* right-aligned toolbar (same place as user page) */}
      <div className="flex items-center justify-end py-2">{Toolbar}</div>

      {/* section title like user page */}
      <h2 className="mt-2 mb-3 text-lg font-semibold text-[var(--panel-text)]">Recent Notes</h2>

      {err && (
        <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-red-600">
          {err}
        </div>
      )}

      {loading ? (
        <div className="text-gray-500">Loading…</div>
      ) : view === 'grid' ? (
        <GridNotesBoard
          notes={visible}
          searchBar={undefined}     
          viewSwitcher={undefined}  
          onOpen={openNote}
          onEdit={editNote}
          onShare={shareNote}
          onCopyLink={copyLink}
          onDownload={duplicateNote}
          onDelete={deleteNote}
        />
      ) : (
        ListView
      )}
    </div>
  );
}



function mapApiToGridNote(raw: any): GridNote {
  const id =
    raw?.id ?? raw?._id ?? raw?.note_id ?? raw?.noteId ?? String(Math.random());

  const authors =
    raw?.authors ?? raw?.author ?? raw?.owner ?? raw?.user ?? 'user';

  const details = raw?.details ?? raw?.content ?? '';
  const region = raw?.region ?? raw?.atlas_region ?? raw?.selected_region;
  const year = raw?.year ?? raw?.atlas_year ?? raw?.selected_year;
  const updatedAt =
    raw?.updated_at ?? raw?.updatedAt ?? raw?.last_updated ?? raw?.updated ?? raw?.created_at ?? raw?.createdAt;

  return {
    id: String(id),
    title: raw?.title || 'Untitled',
    authors,
    details,
    region,
    year,
    updatedAt,
  };
}

function fmt(dt?: string | Date) {
  if (!dt) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' }).format(
      new Date(dt),
    );
  } catch {
    return '—';
  }
}

function Icon({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-gray-100 ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}
