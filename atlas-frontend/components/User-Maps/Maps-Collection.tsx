'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Pencil, Trash, Images as ImageIcon, ExternalLink, Space, } from 'lucide-react';

export type Visibility = 'public' | 'private';

export type MapRecord = {
  _id: string;
  title: string;
  created_at: string;
  updated_at: string;
  base_image_id: string;
  sizeBytes?: number
};

type SortKey = 'newest' | 'oldest' | 'title' | 'downloads';
type FilterKey = 'all' | Visibility;

type MapsCollectionProps = {
  userId?: string;
  maps?: MapRecord[];
  onChange?: (maps: MapRecord[]) => void;
  baseUrl?: string
  buildEditorHref?: (m: MapRecord) => string
}

const fmtSize = (n?: number) =>
  typeof n === 'number' ? `${(n / 1024 / 1024).toFixed(2)} MB` : '-';

export default function MapsCollection({
  userId,
  onChange,
  maps: mapsProp,
  baseUrl = '/flask-api',
  buildEditorHref,
}: MapsCollectionProps) {
  const [maps, setMaps] = useState<MapRecord[]>(mapsProp ?? []);
  const [loading, setLoading] = useState(!mapsProp);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<'newest' | 'oldest' | 'name' | 'size'>('newest');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const qs = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isDeleting, setShowDeleting] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [mapIdToDelete, setMapIdToDelete] = useState('');
  const [mapTitle, setMapTitle] = useState('');
  const [showDeletionProgress, setShowDeletionProgress] = useState(false);

  function fmtDate(raw?: string | number | Date) {
    if (!raw) return "—";

    let d: Date;
    if (raw instanceof Date) {
      d = raw;
    } else if (typeof raw === "number") {
      d = new Date(raw);
    } else {
      let s = raw.trim();

      ///Turn "YYYY-MM-DD HH:MM:SS[.ffffff]" into ISO
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) {
        s = s.replace(" ", "T");
      }

      /// Trim microseconds to milliseconds
      s = s.replace(/(\.\d{3})\d+$/, "$1");

      /// Force UTC
      if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) {
        s += "Z";
      }

      d = new Date(s);
    }

    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  const normalizeMap = (u: any): MapRecord => ({
    _id: u._id,
    title: u.title ?? 'Untitled Map',
    created_at: u.created_at,
    updated_at: u.updated_at,
    base_image_id: u.base_image_id
  })

  useEffect(() => {
    if (mapsProp) return;
    let abort = false;
    (async () => {
      try {
        setLoading(true)
        setError(null);
        const res = await fetch(
          `${baseUrl}/maps${qs}`,
          { credentials: 'include' }
        );
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const json = (await res.json()) as any[];
        const normalized = json.map(normalizeMap);
        if (!abort) {
          setMaps(normalized);
          onChange?.(normalized);
        }
      } catch (e: any) {
        if (!abort) setError(e?.message || 'Failed to retrieve Maps');
      } finally {
        if (!abort) setLoading(false);
      }
    })();
    return () => { abort = true };
  }, [mapsProp, baseUrl, userId]);

  useEffect(() => {
    if (mapsProp) {
      setMaps(mapsProp);
    }
  }, [mapsProp])

  const deleteMap = async (id: string) => {

    try {
      const res = await fetch(`${baseUrl}/maps/${id}${qs}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Map Deletion Could Not Be Finalized - ${res.status}`);
      if (maps.length > 0) {
        const next = maps.filter((m) => m._id !== id);
        setMaps(next);
        onChange?.(next);
      }
      setShowDeletionProgress(false);
      setShowDeleted(true);
    } catch (e: any) {
      alert(e?.message || 'Delete failed');
    } finally {
      setShowDeletionProgress(false);
      setShowDeleted(true);
      setMapIdToDelete('');
    }
  };

  const renameMap = async (id: string, currentTitle: string) => {
    const newTitle = prompt('Enter new map name:', currentTitle);
    if (!newTitle || newTitle.trim() === currentTitle) return;

    try {
      const res = await fetch(`${baseUrl}/maps/${id}${qs}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: newTitle.trim() })
      });
      if (!res.ok) throw new Error(`Rename failed: ${res.status}`);

      const updated = maps.map(m => m._id === id ? { ...m, title: newTitle.trim() } : m);
      setMaps(updated);
      onChange?.(updated);
    } catch (e: any) {
      alert(e?.message || 'Rename failed');
    }
  };

  const sorted = useMemo(() => {
    const arr = [...maps];
    switch (sort) {
      case 'oldest':
        arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'name':
        arr.sort((a, b) => (a.title)?.localeCompare(b.title));
        break;
      case 'size':
        arr.sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0));
        break;
      case 'newest':
      default:
        arr.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        break;
    }
    return arr;
  }, [maps, sort]);

  const rows = useMemo(() => {
    return maps.map(u => ({
      ...u,
      sizeBytes: u.sizeBytes ?? (u as any).size,
      created_at: u.created_at ?? (u as any).created_at,
    }));
  }, [maps]);

  /// Helper to start renaming of map
  const beginRename = (m: MapRecord) => {
    setRenamingId(m._id);
    setNewTitle(m.title || '');
  }

  const cancelRename = () => {
    setRenamingId(null);
    setNewTitle('');
  }

  /// Helper to save map renames
  const saveRename = async (m: MapRecord) => {
    const title = newTitle.trim();
    if (!title || title === m.title) {
      cancelRename();
      return;
    }
    try {
      setSavingId(m._id);
      const qs = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
      const res = await fetch(`${baseUrl}/maps/${m._id}/title${qs}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const message = await res.text().catch(() => '');
      }
      const next = maps.map(x => (x._id === m._id ? { ...x, title } : x));
      setMaps(next);
      cancelRename();
    } catch (e: any) {
      alert(e?.message || 'Map could not be renamed');
    } finally {
      setSavingId(null);
    }
  }

  /// Helper to SET and SAVE map renames
  const saveTitle = async (id: string) => {
    const title = newTitle.trim()
    if (!title) { setRenamingId(null); return; }
    try {
      const res = await fetch(`${baseUrl}/maps/${id}/title${qs}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error(await res.text())

      const next = maps.map(map => map._id === id ? { ...map, title } : map)
      setMaps(next);
      onChange?.(next);
      setRenamingId(null);
    } catch (e: any) {
      alert(e?.message || 'Map could not be renamed ');
    }
  };

  return (
    <div className="rounded-lg shadow-sm border border-[var(--border-color)] bg-[var(--panel-bg)] text-[var(--panel-text)] transition-colors">
      {/* Controls */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2 text-sm opacity-80">
          <ImageIcon size={16} />
          <span>
            {maps.length} map{maps.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm opacity-70">Sort:</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as any)}
            className="rounded-md px-3 py-1 text-sm border border-[var(--border-color)] bg-[var(--panel-bg)] text-[var(--panel-text)]"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
          </select>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="p-4 text-sm opacity-80">
          Loading…
        </div>
      ) : error ? (
        <div className="p-4 text-sm text-[var(--error-text)] bg-[var(--error-bg)] border-t border-[var(--error-border)]">
          {error}
        </div>
      ) : maps.length === 0 ? (
        <div className="p-4 text-sm opacity-80">
          No maps yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border-collapse table-fixed">
            <thead>
              <tr className="border-b border-[var(--border-color)] text-[var(--panel-text)] opacity-80">
                <th className="py-2 px-4 w-20 text-center">Preview</th>
                <th className="py-2 px-4 text-left">Map Title</th>
                <th className="py-2 px-4 w-40 text-left">Created</th>
                <th className="py-2 px-4 w-40 text-left">Last Modified</th>
                <th className="py-2 px-4 w-64 text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {sorted.map((m) => {
                const baseImageId = (m as any).base_upload_id || (m as any).base_image_id || '';
                const qs = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
                const mapThumbnailSource = `${baseUrl}/maps/${m._id}/thumb`;
                const uploadThumbSource = `${baseUrl}/imageuploads/${m.base_image_id}/thumb${qs}`;
                const thumbSource = (m as any)?.thumb_id ? mapThumbnailSource : uploadThumbSource;

                const editHref = buildEditorHref ? buildEditorHref(m) : {
                  pathname: `/whiteboard`,
                  query: {
                    mapId: m._id,
                    user_id: userId,
                    ...(baseImageId && { uploadId: baseImageId }),
                    ...(baseImageId && { imageUrl: `${baseUrl}/imageuploads/${baseImageId}/download${qs}` }),
                  } as any
                };

                return (
                  <tr
                    key={m._id}
                    className="
                              border-b border-[var(--border-color)]
                              hover:bg-[var(--hover-bg)]
                              transition-colors
                            "
                  >
                    <td className="py-2 px-4 align-middle text-center">
                      {thumbSource ? (
                        <img
                          src={thumbSource}
                          alt={m.title}
                          className="
                                    h-12 w-12 object-cover rounded
                                    border border-[var(--border-color)]
                                    inline-block
                                  "
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (img.dataset.fallback !== '1' && uploadThumbSource && img.src !== uploadThumbSource) {
                              img.src = uploadThumbSource;
                              img.dataset.fallback = '1';
                            } else img.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div
                          className="
                                    h-12 w-12 rounded
                                    bg-[var(--card-placeholder)]
                                    border border-[var(--border-color)]
                                    inline-block
                                  "
                        />
                      )}
                    </td>

                    {/* Title */}
                    <td className="py-2 px-4 align-middle text-[var(--panel-text)]">
                      {renamingId === m._id ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            className="
                                      border border-[var(--border-color)]
                                      bg-[var(--panel-bg)] text-[var(--panel-text)]
                                      rounded px-2 py-1 text-sm
                                      w-full max-w-xs
                                    "
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveRename(m);
                              if (e.key === 'Escape') cancelRename();
                            }}
                          />

                          <button
                            className="
                                      text-xs px-2 py-1 rounded
                                      border border-[var(--border-color)]
                                      hover:bg-[var(--hover-bg)]
                                    "
                            onClick={() => saveTitle(m._id)}
                          >
                            Save
                          </button>

                          <button
                            className="
                                      text-xs px-2 py-1 rounded
                                      border border-[var(--border-color)]
                                      hover:bg-[var(--hover-bg)]
                                    "
                            onClick={cancelRename}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="
                                    text-left underline decoration-dotted underline-offset-4
                                    text-[var(--accent)]
                                    hover:text-[var(--accent-hover)]
                                    max-w-xs truncate
                                  "
                          onClick={() => { setRenamingId(m._id); setNewTitle(m.title || ''); }}
                        >
                          {m.title || '-'}
                        </button>
                      )}
                    </td>

                    {/* Dates */}
                    <td className="py-2 px-4 align-middle text-[var(--panel-text)] opacity-80 whitespace-nowrap">{fmtDate(m.created_at)}</td>
                    <td className="py-2 px-4 align-middle text-[var(--panel-text)] opacity-80 whitespace-nowrap">{fmtDate(m.updated_at)}</td>

                    {/* Actions */}
                    <td className="py-1 px-3">
                      <div className="flex flex-wrap gap-2 justify-end">
                        <Link
                          href={editHref as any}
                          className="
                                    inline-flex items-center gap-1 rounded-lg
                                    border border-[var(--border-color)]
                                    px-3 py-1.5 text-xs
                                    text-[var(--panel-text)]
                                    hover:bg-[var(--hover-bg)]
                                    whitespace-nowrap
                                  "
                        >
                          <ExternalLink size={14} /> Open
                        </Link>

                        <button
                          onClick={() => { setMapIdToDelete(m._id); setMapTitle(m.title || '-'); setShowDeleting(true); }}
                          className="
                                    inline-flex items-center gap-1 rounded-lg
                                    border border-[var(--border-color)]
                                    px-3 py-1.5 text-xs
                                    text-[var(--danger-text)]
                                    hover:bg-[var(--hover-bg)]
                                    whitespace-nowrap
                                  "
                        >
                          <Trash size={14} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );

              })}
            </tbody>
          </table>
        </div>
      )}
      {isDeleting && (
        <div>
          <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40'>
            <div className='bg-white rounded-lg shadow-xl px-6 py-5 w-full max-w-sm'>
              <h2 className='text-lg font-semibold text-gray-900 mb-2'>
                Are you sure you want to delete the map, {mapTitle}?
              </h2>
              <p className='text-sm text-gray-700 mb-4'>This action cannot be undone.</p>

              <div className='flex justify-end gap-2'>
                <button
                  onClick={() => { setShowDeletionProgress(true); setShowDeleting(false); deleteMap(mapIdToDelete); }}
                  className='px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700'
                >
                  Delete Map
                </button>

                <button
                  onClick={() => { setShowDeleting(false); setMapIdToDelete('') }}
                  className='px-4 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700'
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showDeletionProgress && (
        <div>
          <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40'>
            <div className='bg-white rounded-lg shadow-xl px-6 py-5 w-full max-w-sm'>
              <h2 className='text-lg font-semibold text-gray-900 mb-2'>
                Map Deletion in Progress...
              </h2>
            </div>
          </div>
        </div>
      )}
      {showDeleted && (
        <div>
          <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40'>
            <div className='bg-white rounded-lg shadow-xl px-6 py-5 w-full max-w-sm'>
              <h2 className='text-lg font-semibold text-gray-900 mb-2'>
                The Map Has Been Deleted.
              </h2>

              <div className='flex justify-end '>
                <button
                  onClick={() => { setShowDeleted(false); setMapIdToDelete('') }}
                  className='px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700'
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>


  );
}