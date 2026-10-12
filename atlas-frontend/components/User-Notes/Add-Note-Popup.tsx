'use client';

import React, { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sanitizeInput } from '../../lib/security';

interface PopupWindowProps {
  isOpen: boolean;
  onClose: () => void;
  userID: string; 
  addedNote: boolean; 
  setAdded: Dispatch<SetStateAction<boolean>>;
}

const AddNotePopup: React.FC<PopupWindowProps> = ({ isOpen, onClose, userID, setAdded }) => {
  const [title, setTitle] = useState('');
  const [regionNote, setRegionNote] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Portal host */
  const [mounted, setMounted] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
    let root = document.getElementById('modal-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'modal-root';
      document.body.appendChild(root);
    }
    setHost(root);
    return () => setMounted(false);
  }, []);

  /* Lock page scroll when modal is open */
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => { document.documentElement.style.overflow = prev; };
  }, [isOpen]);

  /* ESC close */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (isOpen) titleRef.current?.focus(); }, [isOpen]);

  /* Submit */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAdded(false);

    if (!title.trim()) return setError('Title is required.');
    if (!content.trim()) return setError('Content is required.');

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`flask-api/notes/create`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          region: regionNote || null,
          user_id: userID,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to create note');

      setAdded(true);
      onClose();
      setTitle('');
      setRegionNote('');
      setContent('');
    } catch (err) {
      setError('Failed to create note.');
    } finally {
      setLoading(false);
    }
  };

  if (!mounted || !isOpen || !host) return null;

  const modal = (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center" role="dialog" aria-modal="true">
      
      {/* BACKDROP */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* MODAL CARD */}
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
        {/* HEADER */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Create Note</h2>
          <button className="px-2 py-1 rounded hover:bg-[color-mix(in_oklab,var(--page-text)_10%,transparent)]" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* FORM */}
        <form onSubmit={handleSubmit}>
          
          {/* Title + Region */}
          <div className="flex gap-3 mb-4">
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}

              placeholder="Title"
              className="flex-1 px-3 py-2 rounded"
              disabled={loading}
            />
            <input
              type="text"
              value={regionNote}
              onChange={(e) => setRegionNote(e.target.value)}
              placeholder="Region"
              className="w-40 px-3 py-2 rounded"
              disabled={loading}
            />
          </div>

          {/* Content */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Note Content..."
            className="w-full px-3 py-2 rounded h-48 resize-none"
            disabled={loading}
          />

          {error && <div className="text-red-400 text-sm mt-2">{error}</div>}

          {/* FOOTER BUTTONS */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              className="px-4 py-2 rounded border border-[color-mix(in_oklab,var(--page-text)_20%,transparent)] hover:bg-[color-mix(in_oklab,var(--page-text)_10%,transparent)]"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="
                px-4 py-2 rounded font-medium

                /* Light mode */
                bg-gray-300 text-black hover:bg-gray-400

                /* Dark mode */
                 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500

                disabled:opacity-50
              "
              disabled={loading}
            >
              {loading ? 'Saving…' : 'Save Note'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );

  return createPortal(modal, host);
};

export default AddNotePopup;
