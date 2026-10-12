'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import NotesCollection from '@/components/User-Notes/Notes-Collection';
import PopupWindow from '@/components/User-Notes/Popup-Window';
import type { NoteDoc } from '@/types/notes';

type ViewScope = 'my' | 'shared';

export default function NotesPage() {
  const router = useRouter();
  const params = useSearchParams(); 
  const scope: ViewScope = ((params?.get('scope') as ViewScope) || 'my');

  const baseUrl = `/flask-api`;
  const [notes, setNotes] = useState<NoteDoc[]>([]);
  const [user_id, setUserID] = useState<string>('');
  const [selectedNote, setSelectedNote] = useState<NoteDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);

  // whoami + auth
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/flask-api/whoami', { method: 'GET', credentials: 'include' });
        if (!res.ok) throw new Error('whoami failed');
        const data = await res.json();
        setUserID(data.message);
        setAuthenticated(true);
      } catch {
        setAuthenticated(false);
        router.push('/login');
      }
    })();
  }, [router]);

  // fetch notes (my or shared)
  const fetchNotes = async () => {
    setLoading(true);
    try {
      const url =
        scope === 'shared'
          ? `${baseUrl}/notes/shared?user_id=${encodeURIComponent(user_id)}`
          : `${baseUrl}/notes?user_id=${encodeURIComponent(user_id)}`;
      const res = await fetch(url, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error('fetch notes failed');
      setNotes(Array.isArray(data) ? data : data?.notes ?? data?.data?.notes ?? []);
    } catch {
      setError('Failed to fetch notes.');
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authenticated && user_id) fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, user_id, scope]);

  // handlers expected by Notes-Collection
  const handleEdit = (note: NoteDoc, type: string) => {
    if (type === 'popup') setSelectedNote(note);
    else router.push(`/notes/${note._id}`);
  };

  const deleteNote = async (noteID: string) => {
    try {
      if (!confirm('Delete this note?')) return;
      const res = await fetch(`${baseUrl}/notes/delete/${noteID}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      await fetchNotes();
    } catch {
      setError('Failed to delete note.');
    }
  };

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;

  return (
    <div className="flex-1">
      {/* scope toggle */}
      <div className="mb-4 flex items-center justify-end gap-2">
        <button
          className={`px-3 py-1.5 rounded-lg text-sm ${
            scope !== 'shared' ? 'bg-neutral-900 text-white' : 'hover:bg-black/5'
          }`}
          onClick={() => router.push('/notes?scope=my')}
        >
          My Notes
        </button>
        <button
          className={`px-3 py-1.5 rounded-lg text-sm ${
            scope === 'shared' ? 'bg-neutral-900 text-white' : 'hover:bg-black/5'
          }`}
          onClick={() => router.push('/notes?scope=shared')}
        >
          Shared with me
        </button>
      </div>

      {/* Combined layout: Recent Notes (grid) + Collections (folders) + optional list */}
      <NotesCollection
        user_id={user_id}
        notes={notes.map((n) => ({ ...n, region: n.region ?? '' }))}
        handleEdit={handleEdit}
        onDelete={(id: string) => deleteNote(id)}
      />

      {selectedNote && (
        <PopupWindow
          isOpen={!!selectedNote}
          note={selectedNote}
          onClose={() => setSelectedNote(null)}
          onSave={async () => {
            setSelectedNote(null);
            await fetchNotes();
          }}
        />
      )}

      {error && (
        <div className="mt-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-700">{error}</div>
      )}
    </div>
  );
}
