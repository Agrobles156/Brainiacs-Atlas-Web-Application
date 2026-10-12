'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, Pencil, Trash, Image as ImageIcon } from 'lucide-react';

type UploadRecord = {
  _id: string;
  title?: string;
  filename: string;
  mimeType?: string;
  sizeBytes?: number;
  uploaded_at: string;
  used_in_maps?: string[];
};

interface UploadsProps {
  userId?: string;
  uploads?: UploadRecord[];
  onChange?: (uploads: UploadRecord[]) => void;
  baseUrl?: string;
}

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
const fmtSize = (n?: number) =>
  typeof n === 'number' ? `${(n / 1024 / 1024).toFixed(2)} MB` : '—';

export default function UploadsCollection({
  userId,
  uploads: uploadsProp,
  onChange,
  baseUrl = '/flask-api',
}: UploadsProps) {
  const [uploads, setUploads] = useState<UploadRecord[]>(uploadsProp ?? []);
  const [loading, setLoading] = useState(!uploadsProp);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<'newest' | 'oldest' | 'name' | 'size'>('newest');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const qs = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
  /// Property to make uploaded images a property of maps
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [isDeleting, setShowDeleting] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [uploadIdToDelete, setuploadIdToDelete] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [deletionProgress, setDeletionProgrerss] = useState(false);

  const normalizeUpload = (u: any): UploadRecord => ({
    _id: u._id,
    title: u.title,
    filename: u.filename,
    mimeType: u.mime ?? u.mimeType,
    sizeBytes: u.size ?? u.sizeBytes,
    uploaded_at: u.created_at ?? u.uploaded_at,
    used_in_maps: u.used_in_maps ?? [],
  });

  /// Helper to make uploaded images a property of maps
  const router = useRouter();
  const createMap = async (upload: UploadRecord) => {
    if (!userId) return alert('Please Sign In to Use Maps');
    try {
      setCreatingId(upload._id);
      const res = await fetch(`${baseUrl}/maps/create?user_id=${encodeURIComponent(userId)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_upload_id: upload._id,
          title: upload.title || upload.filename.replace(/\.[^.]+$/, ''),
        }),
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || 'Map could not be creatd');
      }
      const jsonMap = await res.json();
      const mapId = jsonMap?.map_id;
      if (!mapId) throw new Error('An ID could not be obtained for the map')

      /// To add the image to the "used-in" collection corresponding to the maps
      apply(
        uploads.map(image => image._id === upload._id ?
          {
            ...image,
            used_in_maps: [...new Set([...(image.used_in_maps || []), mapId])]
          } : image
        )
      );
      router.push(`/whiteboard?mapId=${encodeURIComponent(mapId)}`);
    } catch (error: any) {
      alert(error?.message || 'Overall Error to Create Map');
    } finally {
      setCreatingId(null);
    }
  };

  /// Fetch uploads if not passed by parent
  useEffect(() => {
    if (uploadsProp) return;
    let abort = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`${baseUrl}/imageuploads${qs}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const data = await res.json();
        const formatted = (data ?? []).map(normalizeUpload);
        if (!abort) {
          setUploads(formatted);
          onChange?.(formatted);
        }
      } catch (e: any) {
        if (!abort) setError(e?.message || 'Failed to load uploads.');
      } finally {
        if (!abort) setLoading(false);
      }
    })();
    return () => { abort = true };
  }, [uploadsProp, baseUrl, userId]);

  useEffect(() => {
    if (uploadsProp) setUploads(uploadsProp);
  }, [uploadsProp]);

  const sorted = useMemo(() => {
    const arr = [...uploads];
    switch (sort) {
      case 'oldest': arr.sort((a, b) => +new Date(a.uploaded_at) - +new Date(b.uploaded_at)); break;
      case 'name': arr.sort((a, b) => (a.title || a.filename).localeCompare(b.title || b.filename)); break;
      case 'size': arr.sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0)); break;
      default: arr.sort((a, b) => +new Date(b.uploaded_at) - +new Date(a.uploaded_at));
    }
    return arr;
  }, [uploads, sort]);

  const apply = (next: UploadRecord[]) => {
    setUploads(next);
    onChange?.(next);
  };

  const submitRename = async (id: string) => {
    try {
      const res = await fetch(`${baseUrl}/imageuploads/update/${id}${qs}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: newTitle }),
      });
      if (!res.ok) throw new Error();
      apply(uploads.map((u) => (u._id === id ? { ...u, title: newTitle } : u)));
      setRenamingId(null);
      setNewTitle('');
    } catch {
      alert('Rename failed.');
    }
  };

  const deleteUpload = async (id: string) => {

    try {
      const res = await fetch(`${baseUrl}/imageuploads/delete/${id}${qs}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
      apply(uploads.filter((u) => u._id !== id));
      setDeletionProgrerss(false);
      setShowDeleted(true);
    } catch {
      alert('Delete failed.');
    }
  };

  return (
    <div className="rounded-lg shadow-sm border border-[var(--border-color)] bg-[var(--panel-bg)] text-[var(--panel-text)] transition-colors">

      {/* Controls */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2 text-sm opacity-80">
          <ImageIcon size={16} />
          <span>{uploads.length} file{uploads.length !== 1 && 's'}</span>
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
        <div className="p-4 text-sm opacity-80">Loading…</div>
      ) : error ? (
        <div className="p-4 text-sm text-[var(--error-text)] bg-[var(--error-bg)] border-t border-[var(--error-border)]">
          {error}
        </div>
      ) : uploads.length === 0 ? (
        <div className="p-4 text-sm opacity-80">No uploads yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border-collapse table-fixed">
            <thead>
              <tr className="border-b border-[var(--border-color)] text-[var(--panel-text)] opacity-80">
                <th className="py-2 px-4 w-20 text-center">Preview</th>
                <th className="py-2 px-4 text-left">Title / Filename</th>
                <th className="py-2 px-4 w-36 text-left">Type</th>
                <th className="py-2 px-4 w-40 text-left">Uploaded</th>
                <th className="py-2 px-4 w-32 text-left">Size</th>
                <th className="py-2 px-4 w-64 text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {sorted.map((u) => (
                <tr
                  key={u._id}
                  className="border-b border-[var(--border-color)]
                              hover:bg-[var(--hover-bg)]
                              transition-colors"
                >
                  <td className="py-2 px-4 align-middle text-center">
                    <img
                      src={`${baseUrl}/imageuploads/${u._id}/thumb${qs}`}
                      className=" h-12 w-12 object-cover rounded
                                    border border-[var(--border-color)]
                                    inline-block"
                      onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                      alt=""
                    />
                  </td>

                  <td className="py-2 px-4 align-middle text-[var(--panel-text)] opacity-80 whitespace-nowrap">
                    {u.title || u.filename}
                  </td>

                  <td className="py-2 px-4 align-middle text-[var(--panel-text)] opacity-80 whitespace-nowrap">{u.mimeType}</td>
                  <td className="py-2 px-4 align-middle text-[var(--panel-text)] opacity-80 whitespace-nowrap">{fmtDate(u.uploaded_at)}</td>
                  <td className="py-2 px-4 align-middle text-[var(--panel-text)] opacity-80 whitespace-nowrap">{fmtSize(u.sizeBytes)}</td>

                  {/* Actions */}
                  <td className="py-2 px-4 align-middle">
                    <div className="flex gap-2 justify-end items-center">
                      {/* Download */}
                      <a
                        href={`${baseUrl}/imageuploads/${u._id}/download${qs}`}
                        className="inline-flex items-center gap-1 rounded-lg
                                    border border-[var(--border-color)]
                                    px-3 py-1.5 text-xs
                                    text-[var(--panel-text)]
                                    hover:bg-[var(--hover-bg)]
                                    whitespace-nowrap"
                      >
                        <Download size={14} /> Download
                      </a>

                      {/* Rename */}
                      {/* <button
                        onClick={() => {
                          setRenamingId(u._id);
                          setNewTitle(u.title || u.filename.replace(/\.[^.]+$/, ''));
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border 
                          border-gray-300 dark:border-neutral-600
                          px-2 py-1.5 text-xs text-gray-700 dark:text-gray-200 
                          hover:bg-gray-100 dark:hover:bg-neutral-600"
                      >
                        <Pencil size={14} /> Rename
                      </button> */}

                      {/* Delete */}
                      <button
                        onClick={() => { setuploadIdToDelete(u._id); setUploadTitle(u.title || u.filename); setShowDeleting(true) }}
                        className="inline-flex items-center gap-1 rounded-lg
                                    border border-[var(--border-color)]
                                    px-3 py-1.5 text-xs
                                    text-[var(--danger-text)]
                                    hover:bg-[var(--hover-bg)]
                                    whitespace-nowrap"
                      >
                        <Trash size={14} /> Delete
                      </button>

                      {/* Start map */}
                      <button
                        onClick={() => createMap(u)}
                        disabled={creatingId === u._id}
                        className='inline-flex items-center gap-1 rounded-lg
                                    border border-[var(--border-color)]
                                    px-3 py-1.5 text-xs
                                    text-[var(--panel-text)]
                                    hover:bg-[var(--hover-bg)]
                                    whitespace-nowrap'
                      >
                        {creatingId === u._id ? 'Setting Up...' : 'Create Map'}
                      </button>
                    </div>

                    {/* Inline rename UI */}
                    {renamingId === u._id && (
                      <div className="mt-2 flex gap-2">
                        <input
                          className="border border-gray-300 dark:border-neutral-600 
                            bg-white dark:bg-neutral-800 
                            text-gray-800 dark:text-gray-100
                            rounded px-2 py-1 text-sm w-40"
                          autoFocus
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitRename(u._id);
                            if (e.key === 'Escape') {
                              setRenamingId(null);
                              setNewTitle('');
                            }
                          }}
                        />
                        <button
                          onClick={() => submitRename(u._id)}
                          className="inline-flex items-center gap-1 rounded-lg
                                    border border-[var(--border-color)]
                                    px-3 py-1.5 text-xs
                                    text-[var(--panel-text)]
                                    hover:bg-[var(--hover-bg)]
                                    whitespace-nowrap"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setRenamingId(null); setNewTitle(''); }}
                          className="inline-flex items-center gap-1 rounded-lg
                                    border border-[var(--border-color)]
                                    px-3 py-1.5 text-xs
                                    text-[var(--panel-text)]
                                    hover:bg-[var(--hover-bg)]
                                    whitespace-nowrap"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      )}
      {isDeleting && (
        <div>
          <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40'>
            <div className='bg-white rounded-lg shadow-xl px-6 py-5 w-full max-w-sm'>
              <h2 className='text-lg font-semibold text-gray-900 mb-2'>
                Are you sure you want to delete this image, {uploadTitle}?
              </h2>
              <p className='text-sm text-gray-700 mb-4'>This action cannot be undone.</p>

              <div className='flex justify-end gap-2'>
                <button
                  onClick={() => { deleteUpload(uploadIdToDelete); setShowDeleting(false); setDeletionProgrerss(true) }}
                  className='px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700'
                >
                  Delete Image
                </button>

                <button
                  onClick={() => { setShowDeleting(false); setUploadTitle('') }}
                  className='px-4 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700'
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {deletionProgress && (
        <div>
          <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40'>
            <div className='bg-white rounded-lg shadow-xl px-6 py-5 w-full max-w-sm'>
              <h2 className='text-lg font-semibold text-gray-900 mb-2'>
                Upload Deletion In Progress...
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
                The upload, {uploadTitle}, has been deleted.
              </h2>

              <div className='flex justify-end gap-2'>
                <button
                  onClick={() => { setUploadTitle(''); setShowDeleted(false) }}
                  className='px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700'
                >
                  Ok
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
