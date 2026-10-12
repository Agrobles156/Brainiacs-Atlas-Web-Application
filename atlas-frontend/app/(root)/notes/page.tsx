'use client';

import React, { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import NotesLayout from '@/components/User-Notes/Notes-Layout';
import UserNote from '@/components/User-Notes/User-Notes';

/* Minimal shape needed by this page for opening a note */
type GridNoteLike = { id: string | number; title: string; details: string };

function toB64(obj: any) {
  const json = JSON.stringify(obj);
  return typeof window !== 'undefined'
    ? window.btoa(unescape(encodeURIComponent(json)))
    : Buffer.from(json, 'utf8').toString('base64');
}

function extractAtlasJSON(details?: string | null): any | null {
  if (!details) return null;
  const fenced = details.match(/```atlas\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  const ix = details.toLowerCase().indexOf('atlas');
  if (ix >= 0) {
    const brace = details.indexOf('{', ix);
    if (brace >= 0) {
      const tail = details.slice(brace);
      const end = tail.lastIndexOf('}');
      if (end >= 0) {
        try { return JSON.parse(tail.slice(0, end + 1)); } catch {}
      }
    }
  }
  return null;
}

export type Scope = 'my' | 'shared';

export default function NotesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  // Read scope from URL on first render
  const initialScope = ((search?.get('scope') as Scope) || 'my') as Scope;
  const [scope, setScope] = useState<Scope>(initialScope);
  const [addedNote, setAdded] = useState(false);

  const setScopeAndUrl = (next: Scope) => {
    setScope(next);
    const params = new URLSearchParams(search?.toString() ?? '');
    params.set('scope', next);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const openNoteInAtlas = (n: GridNoteLike) => {
    const meta = extractAtlasJSON(n.details);
    const payload = meta
      ? { atlas: meta, note: { title: n.title, details: n.details, id: String(n.id) } }
      : { note: { title: n.title, details: n.details, id: String(n.id) } };

    const b64 = toB64(payload);
    const url = b64
      ? `/atlas?atlas_state=${encodeURIComponent(b64)}&note_id=${encodeURIComponent(String(n.id))}`
      : `/atlas?note_id=${encodeURIComponent(String(n.id))}`;
    router.push(url);
  };

  /**
   * Theme-friendly Tab Button
   * Colors fully adapt using global CSS variables.
   */
  const Tab = ({ label, value }: { label: string; value: Scope }) => {
    const isActive = scope === value;

    return (
      <button
        onClick={() => setScopeAndUrl(value)}
        className={`
          px-3 py-1 text-sm rounded-md border transition-colors duration-300
          border-[var(--border-color)]
          ${isActive
            ? 'bg-[var(--accent-color)] text-[var(--button-text)] shadow-md'
            : 'bg-[var(--panel-bg-alt)] text-[var(--panel-text)] hover:bg-[var(--button-hover)]'
          }
        `}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className="
        w-full
        bg-[var(--panel-bg)]
        text-[var(--panel-text)]
        transition-colors duration-300
      "
    >
      <NotesLayout addedNote={addedNote} setAdded={setAdded}>

        {/* Scope Tabs */}
        <div className="flex justify-end mb-3 gap-2">
          <Tab label="My Notes" value="my" />
          <Tab label="Shared with me" value="shared" />
        </div>

        {/* Notes Section */}
        <UserNote
          addedNote={addedNote}
          scope={scope}
          onOpenNote={openNoteInAtlas}
        />
      </NotesLayout>
    </div>
  );
}
