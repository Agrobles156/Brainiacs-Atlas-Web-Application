'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { FolderOpen, Layers, ArrowLeft } from 'lucide-react';
import GridNotesBoard, { type GridNote } from './GridNotesBoard';

interface Notes {
  _id: string;
  title: string;
  content: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  region: string;
  category?: string;
  hasAttachment?: boolean;
}

interface NoteProps {
  user_id: string;
  notes: Notes[];
  handleEdit: (note: Notes, type: string) => void;
  onDelete: (noteID: string) => void;
}

const baseUrl = `/flask-api`;

function deriveId(n: any) {
  return n?.id ?? n?.note_id ?? n?._id ?? n?.uuid ?? n?.pk ?? n?.ID ?? '';
}

async function safeJson<T = any>(res: Response): Promise<T | null> {
  try { return await res.json(); } catch { return null; }
}

/** Extremely defensive extractor for a single collection's items */
function pluckCollectionItems(name: string, raw: any): any[] {
  if (!raw) return [];

  // 1) { collection: { Apple: [ ... ] } } or { collections: { Apple: [ ... ] } }
  const objMap = raw.collection || raw.collections;
  if (objMap && typeof objMap === 'object') {
    const bucket = objMap[name];
    if (Array.isArray(bucket)) return bucket;
    if (bucket && typeof bucket === 'object') {
      if (Array.isArray(bucket.items)) return bucket.items;
      if (Array.isArray(bucket.notes)) return bucket.notes;
      if (Array.isArray(bucket.data?.items)) return bucket.data.items;
      if (Array.isArray(bucket.data?.notes)) return bucket.data.notes;
    }
  }

  // 2) [{ name: 'Apple', notes: [...] }, ...] or with items / data.*
  if (Array.isArray(raw.collections)) {
    const c = raw.collections.find(
      (x: any) =>
        x?.name === name ||
        x?.collectionName === name ||
        x?.title === name
    );
    if (c) {
      if (Array.isArray(c.notes)) return c.notes;
      if (Array.isArray(c.items)) return c.items;
      if (Array.isArray(c.data?.notes)) return c.data.notes;
      if (Array.isArray(c.data?.items)) return c.data.items;
      if (Array.isArray(c)) return c;
    }
  }

  // 3) top-level keyed: { Apple: [ ... ] }
  if (raw[name]) {
    const v = raw[name];
    if (Array.isArray(v)) return v;
    if (Array.isArray(v?.items)) return v.items;
    if (Array.isArray(v?.notes)) return v.notes;
  }

  // 4) direct arrays already filtered
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(raw.notes)) return raw.notes;
  if (Array.isArray(raw.data?.items)) return raw.data.items;
  if (Array.isArray(raw.data?.notes)) return raw.data.notes;

  // Debug: help spot shape mismatches during dev
  console.warn('[NotesCollection] Could not find items for', name, 'in payload:', raw);
  return [];
}

function normalizeCollectionNames(raw: any): string[] {
  if (!raw) return [];
  // string array
  if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) return raw as string[];

  // {collection:{ Apple:[], Banana:[] }}
  if (raw.collection && typeof raw.collection === 'object')
    return Object.keys(raw.collection);

  // {collections:{ Apple:[], Banana:[] }} or array-of-objects
  if (raw.collections && typeof raw.collections === 'object')
    return Object.keys(raw.collections);

  if (Array.isArray(raw.collections))
    return raw.collections
      .map((x: any) => x?.name || x?.collectionName || x?.title)
      .filter(Boolean);

  if (Array.isArray(raw.data?.collections))
    return raw.data.collections
      .map((x: any) => (typeof x === 'string' ? x : x?.name || x?.collectionName || x?.title))
      .filter(Boolean);

  return [];
}

function asGridNote(n: any, fallbackAuthor = 'You'): GridNote {
  // Some APIs return { note: {...} }
  const obj = (n && typeof n === 'object' && 'note' in n) ? (n as any).note : n;

  if (typeof obj === 'string') {
    return { id: obj, title: obj, authors: fallbackAuthor, details: '' };
  }

  const id = deriveId(obj);
  const title = obj?.title ?? 'Untitled';
  const details = obj?.details ?? obj?.detail ?? obj?.content ?? obj?.description ?? '';
  const region = obj?.region ?? obj?.selected_region ?? obj?.area ?? undefined;
  const year =
    obj?.year ?? obj?.note_year ??
    (obj?.created_at ? new Date(obj.created_at).getFullYear() : undefined);
  const updatedAt = obj?.updated_at ?? obj?.created_at ?? undefined;

  const authors =
    typeof obj?.author === 'string'
      ? obj.author
      : Array.isArray(obj?.authors)
      ? obj.authors.join(', ')
      : obj?.owner?.name || obj?.owner?.email || obj?.created_by || obj?.username || fallbackAuthor;

  return { id: String(id || title), title, authors, details, region, year, updatedAt };
}

/* API helpers (only /collections?user_id=...)*/
async function fetchCollectionsBlob(user_id: string): Promise<any | null> {
  try {
    const res = await fetch(`${baseUrl}/collections?user_id=${encodeURIComponent(user_id)}`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    return await safeJson(res);
  } catch {
    return null;
  }
}

async function getCollectionsList(user_id: string): Promise<string[]> {
  const blob = await fetchCollectionsBlob(user_id);
  return normalizeCollectionNames(blob);
}

async function getCollectionItems(name: string, user_id: string): Promise<any[]> {
  const blob = await fetchCollectionsBlob(user_id);
  return pluckCollectionItems(name, blob);
}

/* COMPONENT */
export default function NotesCollection({ user_id, notes, onDelete, handleEdit }: NoteProps) {
  const [sortOption, setSortOption] = useState('newest');

  // Add-to-collection modal 
  const [selectedNote, setSelectedNote] = useState<Notes | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [collections, setCollections] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');

  const openModal = async (note: Notes) => {
    setSelectedNote(note);
    setShowModal(true);
    try {
      setCollections(await getCollectionsList(user_id));
    } catch (e) {
      console.error('Failed to load collections:', e);
    }
  };

  const handleAddNote = async () => {
    try {
      const payload = {
        // multiple shapes to match backend
        note: selectedNote,
        note_id: selectedNote?._id,
        id: selectedNote?._id,
        collectionName: selectedCollection || newCollectionName,
        user_id,
      };
      const response = await fetch(`${baseUrl}/collections/add?user_id=${encodeURIComponent(user_id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await safeJson(response);
      if (response.ok) {
        setShowModal(false);
        setSelectedNote(null);
        setSelectedCollection('');
        setNewCollectionName('');
      } else {
        console.error('Failed to add note:', (data as any)?.error);
      }
    } catch (e) {
      console.error('Problem adding note', e);
    }
  };

  // Collections (folder cards) 
  const [folderNames, setFolderNames] = useState<string[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setFoldersLoading(true);
      setFolderNames(await getCollectionsList(user_id));
      setFoldersLoading(false);
    })();
  }, [user_id, notes?.length]);

  // Active collection filter (replaces top grid) 
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [activeLoading, setActiveLoading] = useState(false);
  const [activeNotes, setActiveNotes] = useState<GridNote[]>([]);

  const activateCollection = async (name: string) => {
    setActiveCollection(name);
    setActiveLoading(true);
    const items = await getCollectionItems(name, user_id);
    setActiveNotes(items.map((it) => asGridNote(it, user_id)));
    setActiveLoading(false);
  };
  const clearCollection = () => { setActiveCollection(null); setActiveNotes([]); setActiveLoading(false); };

  // Top grid (Recent or Active) 
  const gridRecent: GridNote[] = useMemo(() => {
    const sorted = [...notes].sort((a, b) => {
      if (sortOption === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortOption === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortOption === 'title-az') return a.title.localeCompare(b.title);
      if (sortOption === 'title-za') return b.title.localeCompare(a.title);
      return 0;
    });
    return sorted.map((n) => asGridNote(n, user_id));
  }, [notes, sortOption, user_id]);

  const displayTitle = activeCollection ? `Collection: ${activeCollection}` : 'Recent Notes';
  const displayNotes = activeCollection ? activeNotes : gridRecent;
  const displayBusy = !!activeCollection && activeLoading;

  // Table sorting backup 
  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => {
      if (sortOption === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortOption === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortOption === 'title-az') return a.title.localeCompare(b.title);
      if (sortOption === 'title-za') return b.title.localeCompare(a.title);
      return 0;
    });
  }, [notes, sortOption]);

  return (
    <div className="transition-colors duration-300 text-[var(--panel-text)]">
      {/* Controls Row */}
      <div className="flex items-center justify-between gap-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">{displayTitle}</h2>
          {activeCollection && (
            <button
              onClick={clearCollection}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-[var(--hover-bg)]"
              title="Back to Recent"
            >
              <ArrowLeft size={14} /> Back to Recent
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <label className="text-xs opacity-80">Sort:</label>
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
            className="border border-[var(--border-color)] bg-[var(--panel-bg)] text-[var(--panel-text)] rounded-md px-3 py-1 text-sm transition-colors duration-300"
          >
            <option value="newest">Newest to Oldest</option>
            <option value="oldest">Oldest to Newest</option>
            <option value="title-az">Title A-Z</option>
            <option value="title-za">Title Z-A</option>
          </select>
        </div>
      </div>

      {/* TOP GRID */}
      <div className="mb-8">
        {displayBusy ? (
          <div className="p-6 text-sm opacity-70">Loading collection…</div>
        ) : (
          <GridNotesBoard
            notes={displayNotes}
            onEdit={(g) => {
              const found = notes.find(n => deriveId(n) === g.id);
              if (found) handleEdit(found, 'popup');
            }}
            onShare={(g) => {
              const id = String(g.id);
              const url = `${location.origin}/notes/${id}`;
              if (navigator.share) navigator.share({ title: g.title, url }).catch(() => {});
              else navigator.clipboard.writeText(url);
            }}
            // FolderPlus -> Add to Collection
            onCopyLink={(g) => {
              const found = notes.find(n => deriveId(n) === g.id);
              if (found) openModal(found);
            }}
            onDownload={(g) => {
              const found = notes.find(n => deriveId(n) === g.id);
              if (!found) return;
              const blob = new Blob([found.content ?? ''], { type: 'text/plain;charset=utf-8' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `${found.title || 'note'}.txt`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
            onDelete={(g) => {
              const found = notes.find(n => deriveId(n) === g.id);
              if (found) onDelete(found._id);
            }}
          />
        )}
      </div>

      {/* COLLECTIONS — Folder cards */}
      <div className="mt-2 mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold">Collections</h3>
        <span className="inline-flex items-center gap-1 text-xs opacity-70">
          <Layers size={14} /> {foldersLoading ? 'Loading…' : `${folderNames.length} total`}
        </span>
      </div>

      {foldersLoading ? (
        <div className="p-6 text-sm opacity-70">Loading collections…</div>
      ) : folderNames.length === 0 ? (
        <div className="p-6 text-sm opacity-70">No collections yet. Use the folder icon on a note to add one.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {folderNames.map((name) => (
            <button
              key={name}
              onClick={() => activateCollection(name)}
              className="group text-left rounded-xl border border-[var(--border-color)] bg-[var(--panel-bg)] p-4 hover:shadow-md transition"
              title={`Open ${name}`}
            >
              <div className="flex items-center gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-200/70 text-amber-900">
                  <FolderOpen size={20} />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium">{name}</div>
                  <div className="text-xs opacity-70 group-hover:opacity-90">
                    {activeCollection === name ? 'Showing above' : 'Click to view above'}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ====== Add-to-collection Modal ====== */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center transition-colors duration-300 z-50">
          <div className="bg-[var(--panel-bg)] text-[var(--panel-text)] p-6 rounded-lg w-full max-w-lg border border-[var(--border-color)]">
            <h2 className="text-xl font-bold mb-4">Add Note to a Collection</h2>

            <label className="block mb-1 font-semibold">Select Collection:</label>
            <select
              className="border border-[var(--border-color)] bg-[var(--panel-bg)] text-[var(--panel-text)] w-full p-2 mb-2 rounded-md"
              value={selectedCollection}
              onChange={(e) => setSelectedCollection(e.target.value)}
            >
              <option value="">---</option>
              {collections.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>

            <label className="block mb-1 font-semibold">Create a New Collection:</label>
            <input
              className="border border-[var(--border-color)] bg-[var(--panel-bg)] text-[var(--panel-text)] rounded-md px-4 py-2 w-full mb-4 focus:outline-none"
              placeholder="New Collection Name"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
            />

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-[var(--hover-bg)] rounded-md hover:opacity-80 transition">Cancel</button>
              <button onClick={handleAddNote} className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
