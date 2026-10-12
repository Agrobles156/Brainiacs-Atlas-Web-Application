'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createPortal } from 'react-dom';

type AtlasEmbed = any;

type Props = {
  onSubmit: (title: string, content: string) => void;
  initialTitle?: string;
  initialContent?: string;
  selectedText: string | null;
  selfSubmit?: boolean;

  user_id?: string;

  disabled?: boolean;
  isEditing?: boolean;
  onCancel?: () => void;


  draft?: boolean;

  useModal?: boolean;
  open?: boolean;
  onRequestClose?: () => void;

  
  atlasEmbed?: AtlasEmbed;
};


function stripAtlasBlocks(text?: string | null): string {
  if (!text) return '';
  let out = text.replace(/```atlas[\s\S]*?```/gi, '').trim();
  out = out.replace(/atlas\s*\{[\s\S]*?\}/gi, '').trim();
  out = out.replace(/\n{3,}/g, '\n\n');
  return out;
}

function inferRegionFromEmbed(embed?: AtlasEmbed): string | '' {
  if (!embed) return '';
  const a = embed.atlas ?? embed;
  const pair = a.dual ?? a.atlas_pair ?? a;
  const left  = pair?.left  ?? null;
  const right = pair?.right ?? null;
  const l = left  ? (left.selected_region  ?? left.selectedRegion  ?? '') : '';
  const r = right ? (right.selected_region ?? right.selectedRegion ?? '') : '';
  const label = [l, r].filter(Boolean).join(' | ');
  return label || '';
}

export default function CreateNote({
  onSubmit,
  initialTitle = '',
  initialContent = '',
  selectedText,
  selfSubmit = false,       
  user_id = '',
  disabled = false,
  isEditing = false,
  onCancel,
  draft = false,              
  useModal = false,
  open = false,
  onRequestClose,
  atlasEmbed,       
}: Props) {
  const router = useRouter();
  const baseUrl = `/flask-api`;

  // local state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [regionNote, setRegionNote] = useState<string>(selectedText ?? '');
  const [content, setContent] = useState(initialContent);

  // SSR guard for portals
  const [isClient, setIsClient] = useState(false);
  useEffect(() => { setIsClient(true); }, []);

  // Keep inputs in sync with props (e.g., when opening a saved note)
  useEffect(() => { setTitle(initialTitle); }, [initialTitle]);
  useEffect(() => { setContent(initialContent); }, [initialContent]);

  // Region: prefer explicit selectedText; otherwise infer from dual embed if present
  useEffect(() => {
    if (selectedText) {
      setRegionNote(selectedText);
    } else {
      const inferred = inferRegionFromEmbed(atlasEmbed);
      if (inferred) setRegionNote(inferred);
    }
  }, [selectedText, atlasEmbed]);

  // Prevent rapid double-submits
  const submitLockRef = useRef(false);

  const [resolvedUserId, setResolvedUserId] = useState<string | null>(user_id || null);
  useEffect(() => {
    const needSelfPost = selfSubmit && !draft;
    if (!needSelfPost) return;

    let cancelled = false;
    (async () => {
      try {
        if (user_id) { setResolvedUserId(user_id); return; }
        const resp = await fetch('/flask-api/whoami', { method: 'GET', credentials: 'include' });
        if (!resp.ok) throw new Error('whoami failed');
        const data = await resp.json();
        if (!cancelled) setResolvedUserId(data?.message ?? null);
      } catch {
        if (!cancelled) setResolvedUserId(null);
      }
    })();
    return () => { cancelled = true; };
  }, [selfSubmit, draft, user_id]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || loading || submitLockRef.current) return;

    setError(null);
    setLoading(true);
    submitLockRef.current = true;

    const t = title.trim();
    const c = content.trim();

    if (!t || !c) {
      setError('Fields are required');
      setLoading(false);
      submitLockRef.current = false;
      return;
    }

    // Sanitize + embed (if provided)
    const cleaned = stripAtlasBlocks(c);
    const contentWithAtlas = atlasEmbed
      ? `${cleaned}\n\n\`\`\`atlas\n${JSON.stringify(atlasEmbed)}\n\`\`\``
      : cleaned;

    // Bubble-only mode (default): just notify parent, no POST/redirect here.
    if (!selfSubmit || draft) {
      try {
        onSubmit(t, contentWithAtlas);
      } finally {
        setLoading(false);
        setTimeout(() => { submitLockRef.current = false; }, 400);
      }
      return;
    }

    // Self-submit mode: POST here, then redirect to /notes.
    if (!resolvedUserId) {
      setError('You must be logged in to create a note.');
      setLoading(false);
      submitLockRef.current = false;
      return;
    }

    try {
      const resp = await fetch(`${baseUrl}/notes/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: t,
          content: contentWithAtlas,
          region: regionNote || null,
          user_id: resolvedUserId,
        }),
      });

      const data = await (async () => {
        try { return await resp.json(); } catch { return null; }
      })();

      if (!resp.ok) {
        throw new Error((data && (data.message || data.error)) || 'Failed to create note');
      }

      onSubmit(t, contentWithAtlas);

      if (!isEditing) {
        setTitle('');
        setContent('');
        setRegionNote('');
      }

      router.push('/notes');
    } catch (e) {
      console.error(e);
      setError('Failed to create note.');
    } finally {
      setLoading(false);
      setTimeout(() => { submitLockRef.current = false; }, 400);
    }
  };

  const Form = (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-6 gap-4">
        <div className="col-span-5">
          <div className="flex flex-row">
            {/* Note Title */}
            <div className="basis-3/4 mr-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Note Title"
                className="w-full px-3 py-2 border rounded bg-gray-200"
                disabled={disabled || loading}
              />
            </div>

            {/* Selected Region */}
            <div className="basis-1/4 mb-2">
              <input
                type="text"
                value={regionNote}
                onChange={(e) => setRegionNote(e.target.value)}
                placeholder="Selected Region"
                className="w-full px-3 py-2 border rounded bg-gray-200"
                disabled={disabled || loading}
              />
            </div>
          </div>

          {/* Enter details */}
          <div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter details..."
              className="w-full px-3 py-2 border rounded h-full min-h-[140px] overflow-y-auto bg-gray-200"
              disabled={disabled || loading}
            />
          </div>

          {error && <div className="mt-2 text-red-600 text-sm">{error}</div>}
        </div>

        {/* Actions */}
        <div className="w-full font-medium text-gray-900 border-gray-200 rounded-lg">
          <Link href="/notes">
            <button
              type="button"
              className="px-4 py-2 w-full mb-2 bg-gray-400 hover:bg-gray-500 text-white rounded"
              disabled={loading}
            >
              View Notes
            </button>
          </Link>

          <button
            type="submit"
            className="px-4 py-2 w-full text-white rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            disabled={loading || disabled}
          >
            {loading ? 'Saving...' : isEditing ? 'Update Note' : 'Save Note'}
          </button>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="mt-2 px-4 py-2 w-full bg-gray-300 hover:bg-gray-400 rounded"
              disabled={loading}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </form>
  );

  // Regular render
  if (!useModal) {
    return <div className="max-w-5xl">{Form}</div>;
  }

  // Modal render
  if (!isClient || !open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onRequestClose} />
      <div className="relative z-10 w/full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Add New Note</h3>
          <button
            type="button"
            onClick={onRequestClose}
            className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>
        {Form}
      </div>
    </div>,
    document.body
  );
}
