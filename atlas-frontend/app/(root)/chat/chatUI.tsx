// app/chat/chatUI.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  EMPTY_LOOP,
  LoopPayload,
  LoopTool,
  LoopMessage,
  Message,
  NotePreview,
  PendingInvite,
  TextMessage,
  apiUpdateLoopDoc,
  demoMembers,
  ensureLoopDocId,
  fetchNoteByTitle,
  fetchPendingInvites,
  getIdentityEmail,
  setIdentityEmail,
  acceptInviteToken,
  declineInviteToken,
  isValidEmail,
  updateLocalLoopDoc,
} from './chatCore';

// ---- Tailwind safelist for dynamic classes ----
/* 
  These class names must appear in a static string so Tailwind
  knows to generate the CSS for them.
*/
const __TAILWIND_SAFELIST__ = `
  loop-tab
  loop-tab--active
`;

/* ---------- Icons ---------- */

export const PlusIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const LoopGlyph = ({ className = '' }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    className={`h-5 w-5 ${className}`}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path d="M4 12a7 7 0 117 7H9l-4 3 1.2-4.8A6.9 6.9 0 014 12z" />
  </svg>
);

export const PinIcon = ({ solid = false }: { solid?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill={solid ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth={2}
  >
    <path d="M14 9l7-7m-7 7l-4 10-2-6-6-2 10-4z" />
  </svg>
);

export const BellIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M15 17h5l-1.4-1.4A2 2 0 0118 14V9a6 6 0 10-12 0v5a2 2 0 01-.6 1.4L4 17h5" />
    <path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);

/* ---------- Shared Note preview ---------- */

export function SharedNotePreview({ title }: { title: string }) {
  const [note, setNote] = useState<NotePreview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await fetchNoteByTitle(title);
      if (!cancelled) {
        setNote(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [title]);

  return (
    <div
      className="mt-3 w-[360px] rounded-lg border
                 border-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]
                 bg-[var(--panel-bg)] text-[var(--page-text)]
                 overflow-hidden shadow-sm"
    >
      <div className="flex">
        <div className="w-[140px] h-[88px] bg-black/[0.02] border-r border-black/10 grid place-items-center overflow-hidden">
          {loading ? (
            <div className="h-5 w-5 animate-pulse rounded-full bg-black/20" />
          ) : note?.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={note.thumbnail}
              alt=""
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="text-[11px] text-black/40">No preview</div>
          )}
        </div>

        <div className="flex-1 p-3 min-w-0">
          <div className="text-xs uppercase tracking-wide text-black/50 mb-1">Note</div>
          <div className="font-medium truncate" title={note?.title || title}>
            {note?.title || title}
          </div>
          <div className="text-xs text-black/50 mt-1 flex items-center gap-2">
            {note?.author ? <span>by {note.author}</span> : null}
            {note?.updatedAt ? (
              <>
                <span className="h-3 w-px bg-black/10" />
                <span>Updated {new Date(note.updatedAt).toLocaleDateString()}</span>
              </>
            ) : null}
          </div>
          <div className="mt-2">
            {note?.url ? (
              <a
                href={note.url}
                className="inline-flex items-center gap-2 px-2 py-1 rounded border border-black/10 hover:bg-black/5 text-sm"
                target="_blank"
                rel="noreferrer"
              >
                Open
                <svg
                  viewBox="0 0 24 24"
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M14 3h7v7M21 3l-9 9" />
                  <path d="M10 7H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
                </svg>
              </a>
            ) : (
              <span className="inline-flex items-center gap-2 px-2 py-1 rounded border border-black/10 text-sm text-black/50">
                No link available
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Members rail ---------- */

export function MembersRail() {
  const online = demoMembers.filter((m) => m.online);
  const offline = demoMembers.filter((m) => !m.online);
  return (
    <aside
      className="w-64 shrink-0 bg-[var(--panel-bg)]
                 border-l border-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]
                 flex flex-col sticky top-0 h-screen overflow-y-auto
                 text-[var(--panel-text)]"
    >
      <div className="px-4 h-12 flex items-center border-b border-black/10 text-black/70 font-medium">
        Members
      </div>
      <div className="p-3 space-y-6">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-black/50 mb-2">
            Online — {online.length}
          </div>
          <ul className="space-y-2">
            {online.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 px-2 py-1 rounded-md hover:bg-black/5"
              >
                <span className="h-7 w-7 rounded-full bg-emerald-500 grid place-items-center text-white text-xs font-semibold">
                  {m.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{m.name}</div>
                  {m.role && <div className="text-xs text-black/50">{m.role}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wider text-black/50 mb-2">
            Offline — {offline.length}
          </div>
          <ul className="space-y-2">
            {offline.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 px-2 py-1 rounded-md hover:bg-black/5"
              >
                <span className="h-7 w-7 rounded-full bg-gray-400 grid place-items-center text-white text-xs font-semibold">
                  {m.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-black/70">{m.name}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}

/* ---------- Notes modal ---------- */

export function NotesModal(props: {
  filteredTitles: string[];
  notesLoading: boolean;
  notesError: string | null;
  notesQuery: string;
  setNotesQuery: (v: string) => void;
  setNotesOpen: (v: boolean) => void;
  notesSelectedTitle: string | null;
  setNotesSelectedTitle: (v: string) => void;
  shareSelectedNote: () => void;
  activeChannelName: string;
}) {
  const {
    filteredTitles,
    notesLoading,
    notesError,
    notesQuery,
    setNotesQuery,
    setNotesOpen,
    notesSelectedTitle,
    setNotesSelectedTitle,
    shareSelectedNote,
    activeChannelName,
  } = props;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) setNotesOpen(false);
      }}
    >
      <div className="w-full max-w-xl bg-white rounded-xl shadow-xl border border-black/10 overflow-hidden">
        <div className="px-4 py-3 border-b border-black/10 flex items-center justify-between">
          <div className="font-semibold">Share a Note</div>
          <button
            onClick={() => setNotesOpen(false)}
            className="p-1 rounded hover:bg-black/5"
            aria-label="Close"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center gap-2 bg-white border border-black/10 rounded-md px-2 py-2">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 opacity-70"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={notesQuery}
              onChange={(e) => setNotesQuery(e.target.value)}
              placeholder="Search titles…"
              className="bg-transparent outline-none text-sm flex-1"
            />
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {notesLoading ? (
            <div className="px-4 py-8 text-center text-black/50">Loading your note titles…</div>
          ) : notesError ? (
            <div className="px-4 py-8 text-center text-red-600">{notesError}</div>
          ) : filteredTitles.length ? (
            <ul className="divide-y divide-black/5">
              {filteredTitles.map((title) => {
                const selected = title === notesSelectedTitle;
                return (
                  <li
                    key={title}
                    className={`px-4 py-3 cursor-pointer hover:bg-black/5 ${
                      selected ? 'bg-indigo-50' : ''
                    }`}
                    onClick={() => setNotesSelectedTitle(title)}
                  >
                    <div className="font-medium">{title}</div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-4 py-8 text-center text-black/50">
              No note titles match your search.
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-black/10 flex items-center justify-end gap-2">
          <button
            onClick={() => setNotesOpen(false)}
            className="px-4 py-2 rounded-md border border-black/10 hover:bg-black/5"
          >
            Cancel
          </button>
          <button
            onClick={shareSelectedNote}
            disabled={!notesSelectedTitle}
            className="px-4 py-2 rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60"
          >
            Share to #{activeChannelName}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Invite People modal ---------- */

export function InvitePeopleModal(props: {
  serverName: string;
  onClose: () => void;
  onSend: (emails: string[]) => Promise<{ ok: boolean; message: string }>;
}) {
  const { serverName, onClose, onSend } = props;
  const [value, setValue] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const addFromValue = () => {
    const raw = value.trim();
    if (!raw) return;
    const parts = raw
      .split(/[,\s;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const valids = parts.filter(isValidEmail);
    const invalids = parts.filter((p) => !isValidEmail(p));
    if (invalids.length) {
      setError(`Invalid email: ${invalids[0]}`);
      return;
    }
    const merged = Array.from(new Set([...emails, ...valids]));
    setEmails(merged);
    setValue('');
    setError(null);
    inputRef.current?.focus();
  };

  const removeEmail = (e: string) => setEmails((prev) => prev.filter((x) => x !== e));

  const send = async () => {
    if (!emails.length) {
      setError('Add at least one email.');
      return;
    }
    setBusy(true);
    const res = await onSend(emails);
    setBusy(false);
    if (!res.ok) {
      setError(res.message || 'Failed to send invites.');
      return;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl border border-black/10 overflow-hidden">
        <div className="px-4 py-3 border-b border-black/10 flex items-center justify-between">
          <div className="font-semibold">Invite people to “{serverName}”</div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-black/5"
            aria-label="Close"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">
          <label className="text-sm text-black/70">Email addresses</label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addFromValue();
                }
              }}
              placeholder="name@example.com (press Enter to add, supports comma separated)"
              className="w-full text-[18px] font-semibold outline-none
                         bg-[var(--panel-bg)]
                         text-[var(--page-text)]
                         placeholder-[color-mix(in_oklab,var(--page-text)_60%,transparent)]"
            />
            <button
              onClick={addFromValue}
              className="px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
            >
              Add
            </button>
          </div>

          {emails.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {emails.map((e) => (
                <span
                  key={e}
                  className="inline-flex items-center gap-2 px-2 py-1 rounded-full border border-black/10 bg-black/5 text-sm"
                >
                  {e}
                  <button
                    onClick={() => removeEmail(e)}
                    className="hover:text-red-600"
                    title="Remove"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>

        <div className="px-4 py-3 border-t border-black/10 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-black/10 hover:bg-black/5"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            onClick={send}
            className="px-4 py-2 rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60"
            disabled={busy}
          >
            {busy ? 'Sending…' : 'Send Invites'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- View My Invites modal ---------- */

export function InvitesModal(props: {
  userEmail?: string;
  onClose: () => void;
  onAccepted: (serverId: string, serverName?: string) => void | Promise<void>;
  onDeclined?: () => void;
}) {
  const { userEmail, onClose, onAccepted, onDeclined } = props;

  const [email, setEmail] = useState<string>(userEmail ?? getIdentityEmail() ?? '');
  const [editingEmail, setEditingEmail] = useState(false);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PendingInvite[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [accepting, setAccepting] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);

  const load = async (who = email) => {
    setLoading(true);
    setError(null);
    const list = await fetchPendingInvites(who);
    setRows(list);
    setLoading(false);
    if (who) setIdentityEmail(who);
  };

  useEffect(() => {
    if (email) load(email);
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getTokenFromLink = (link?: string): string | null => {
    if (!link) return null;
    try {
      return new URL(link).searchParams.get('t');
    } catch {
      try {
        return new URL(link, window.location.origin).searchParams.get('t');
      } catch {
        return null;
      }
    }
  };

  const accept = async (invite: PendingInvite) => {
    const who = email || getIdentityEmail();
    if (!who) {
      setError('Please enter your email above first.');
      return;
    }
    const token = getTokenFromLink(invite.joinLink);
    if (!token) {
      setError('Invalid invite token.');
      return;
    }
    setAccepting(invite.serverId);
    const res = await acceptInviteToken(token, who);
    setAccepting(null);
    if (!res.ok) {
      setError('Failed to accept invite.');
      return;
    }
    setRows((prev) => prev.filter((r) => r.serverId !== invite.serverId));
    setIdentityEmail(who);
    await onAccepted(
      res.server?._id || invite.serverId,
      res.serverName || invite.serverName || invite.serverId,
    );
  };

  const decline = async (invite: PendingInvite) => {
    const who = email || getIdentityEmail();
    const token = getTokenFromLink(invite.joinLink);
    setDeclining(invite.serverId);
    let ok = false;
    if (token) {
      const res = await declineInviteToken(token, who);
      ok = res.ok;
    }
    setDeclining(null);
    if (!ok) {
      // still remove locally
    }
    setRows((prev) => prev.filter((r) => r.serverId !== invite.serverId));
    onDeclined?.();
  };

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl border border-black/10 overflow-hidden">
        <div className="px-4 py-3 border-b border-black/10 flex items-center justify-between">
          <div className="font-semibold">My Invites</div>
          {!editingEmail && (
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-2 rounded-md border border-black/10 hover:bg-black/5 text-sm"
                onClick={() => email && load(email)}
              >
                Refresh
              </button>
              <button
                className="px-3 py-2 rounded-md border border-black/10 hover:bg-black/5 text-sm"
                onClick={() => setEditingEmail(true)}
              >
                Change
              </button>
            </div>
          )}
        </div>

        {editingEmail && (
          <div className="px-4 pt-3 pb-2 flex items-center gap-2">
            <input
              className="flex-1 bg-white border border-black/10 rounded-md px-3 py-2 outline-none"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              className="px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
              onClick={() => email && (setEditingEmail(false), load(email))}
            >
              Refresh
            </button>
          </div>
        )}

        {!email && !editingEmail ? (
          <div className="px-6 pb-6 text-black/60">
            Enter your email (Change) to see pending invites.
          </div>
        ) : loading ? (
          <div className="px-6 pb-6 text-black/60">Loading pending invites…</div>
        ) : rows.length === 0 ? (
          <div className="px-6 pb-6 text-black/60">You have no pending invites.</div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-black/60 border-b border-black/10">
                  <th className="px-4 py-2">Server</th>
                  <th className="px-4 py-2">Invited by</th>
                  <th className="px-4 py-2">Expires</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={`${r.serverId}-${r.email}-${r.expiresAt ?? ''}`}
                    className="border-b border-black/5"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.serverName || r.serverId}</div>
                      <div className="text-xs text-black/50">To: {r.email}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">{r.invitedBy || '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      {r.expiresAt ? new Date(r.expiresAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          onClick={() => accept(r)}
                          disabled={accepting === r.serverId || declining === r.serverId}
                          className="px-3 py-2 rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-sm"
                        >
                          {accepting === r.serverId ? 'Accepting…' : 'Accept'}
                        </button>
                        <button
                          onClick={() => decline(r)}
                          disabled={accepting === r.serverId || declining === r.serverId}
                          className="px-3 py-2 rounded-md border border-black/10 hover:bg-black/5 text-sm text-black/80 disabled:opacity-60"
                        >
                          {declining === r.serverId ? 'Declining…' : 'Decline'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-4 py-3 border-t border-black/10 flex items-center justify-end gap-2">
          {error ? <div className="text-sm text-red-600 mr-auto">{error}</div> : null}
          {!editingEmail && (
            <button
              onClick={() => email && load(email)}
              className="px-3 py-2 rounded-md border border-black/10 hover:bg-black/5 text-sm"
            >
              Refresh
            </button>
          )}
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-md text-sm border border-black/10 hover:bg-black/5"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Live Loop block (inline editing) ---------- */

const LOOP_TOOL_TABS: { id: LoopTool; label: string }[] = [
  { id: 'Paragraph', label: 'Paragraph' },
  { id: 'Table', label: 'Table' },
  { id: 'Bulleted list', label: 'Bulleted list' },
  { id: 'Checklist', label: 'Checklist' },
  { id: 'Task list', label: 'Task list' },
  { id: 'Numbered list', label: 'Numbered list' },
];

type LiveLoopBlockProps = {
  msg: LoopMessage;
  /** message = already sent; draft = being composed */
  mode?: 'message' | 'draft';
  onClose?: () => void;
  onLoopChange?: (loop: LoopPayload) => void;
};

export function LiveLoopBlock({
  msg,
  mode = 'message',
  onClose,
  onLoopChange,
}: LiveLoopBlockProps) {
  const router = useRouter();
  const [data, setData] = useState<LoopPayload>({ ...EMPTY_LOOP, ...(msg.loop ?? {}) });
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [editingTitle, setEditingTitle] = useState(false);

  const saveTimerRef = useRef<number | null>(null);
  const firstLoadRef = useRef(true);

  useEffect(() => {
    setData({ ...EMPTY_LOOP, ...(msg.loop ?? {}) });
    firstLoadRef.current = true;
  }, [msg.loop]);

  // Autosave loop data to backend + local storage
  useEffect(() => {
    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      return;
    }
    setSaveState('saving');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      const id = await ensureLoopDocId(data);
      updateLocalLoopDoc(id, data);
      const ok = await apiUpdateLoopDoc(id, data);
      setData((d) => ({ ...d, docId: id }));
      setSaveState(ok ? 'saved' : 'error');
      saveTimerRef.current = null;
    }, 700);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [data]);

  // Bubble latest loop content up (for draft send)
  useEffect(() => {
    onLoopChange?.(data);
  }, [data, onLoopChange]);

  const openDoc = async () => {
    const id = await ensureLoopDocId(data);
    router.push(`/loops?id=${encodeURIComponent(id)}`);
  };

  const onTitleChange = (v: string) => setData((d) => ({ ...d, title: v }));
  const tableSafe = data.table?.length ? data.table : EMPTY_LOOP.table;

  return (
    <div className="loop-editor rounded-lg border border-black/10 overflow-hidden">
      {/* Header */}
      <div
        className="px-3 py-2 flex items-center gap-2
                   text-[var(--page-text)] opacity-80
                   bg-[var(--panel-bg)]
                   border-b border-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]"
      >
        <span className="inline-grid h-5 w-5 place-items-center rounded bg-indigo-600 text-white text-[10px] font-bold">
          L
        </span>
        <span className="text-sm">Loop</span>
        <span className="mx-2 h-4 w-px bg-black/10" />
        <span className="text-xs text-[color-mix(in_oklab,var(--page-text)_70%,transparent)]">Specific people with the link can edit</span>

        {/* Right side: status + Open doc + optional close (draft) */}
        <div className="ml-auto flex items-center gap-2 text-xs">
          {mode === 'message' && (
            <span>
              {saveState === 'saving'
                ? 'Saving…'
                : saveState === 'saved'
                ? 'Saved'
                : saveState === 'error'
                ? 'Save failed'
                : ''}
            </span>
          )}

          <button
            onClick={openDoc}
            className="px-2 py-1 rounded border border-black/10 hover:bg-black/5"
          >
            Open doc
          </button>

          {mode === 'draft' && onClose && (
            <button
              onClick={onClose}
              className="px-2 py-1 rounded border border-black/10 hover:bg-black/5"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-3 bg-[var(--panel-bg)] text-[var(--page-text)]">
        {/* Title row */}
        <div className="mb-2">
          {editingTitle ? (
            <input
              autoFocus
              value={data.title}
              onChange={(e) => onTitleChange(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
              className="w-full text-[18px] font-semibold outline-none
                         bg-transparent
                         text-[var(--page-text)]
                         placeholder-[color-mix(in_oklab,var(--page-text)_60%,transparent)]"
              placeholder="Add a title"
            />
          ) : (
            <div className="flex items-center gap-2">
              <div
                className={`text-[18px] font-semibold ${
                  data.title
                    ? 'text-[var(--page-text)]'
                    : 'text-[color-mix(in_oklab,var(--page-text)_60%,transparent)]'
                }`}
              >
                {data.title || 'Add a title'}
              </div>
              <button
                className="text-xs px-2 py-1 rounded
                           border border-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]
                           hover:bg-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]
                           text-[var(--page-text)]"
                onClick={() => setEditingTitle(true)}
                title="Rename"
              >
                Rename
              </button>
            </div>
          )}
        </div>

        {/* Tool tabs (Paragraph / Table / … like full Loop) */}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {LOOP_TOOL_TABS.map((tool) => {
  const active = data.activeTool === tool.id;
  return (
    <button
  key={tool.id}
  type="button"
  className={`
    loop-tab px-3 py-1 rounded-full border text-sm transition
    ${
      active
        ? 'loop-tab--active bg-indigo-100 dark:bg-indigo-900 border-indigo-400'
        : 'bg-[var(--panel-bg)] border-[color-mix(in_oklab,var(--page-text)_20%,transparent)] hover:bg-[color-mix(in_oklab,var(--page-text)_10%,transparent)]'
    }
  `}
  onClick={() => setData(d => ({ ...d, activeTool: tool.id }))}
>
  {tool.label}
</button>

 
  



            );
          })}
          <span className="mx-2 h-4 w-px bg-black/10" />
          <button
            type="button"
            className="px-3 py-1 rounded-full border border-black/10 text-sm text-black/70 hover:bg-black/5"
          >
            Add a map
          </button>
        </div>

        {/* Active tool content */}
        {data.activeTool === 'Paragraph' && (
          <textarea
            value={data.paragraph}
            onChange={(e) => setData((d) => ({ ...d, paragraph: e.target.value }))}
            className="w-full min-h-[80px] outline-none
                       bg-[var(--panel-bg)]
                       text-[var(--page-text)]
                       placeholder-[color-mix(in_oklab,var(--page-text)_60%,transparent)]"
            placeholder="Share ideas with Loop. Just start typing…"
          />
        )}

        {data.activeTool === 'Table' && (
          <div>
            <table className="w-full border-separate border-spacing-0 rounded-lg overflow-hidden">
              <thead>
                <tr>
                  {tableSafe[0].map((h, ci) => (
                    <th key={ci} className="bg-black/5 text-left px-3 py-2 border border-black/10">
                      <input
                        value={h}
                        onChange={(e) => {
                          const next = tableSafe.map((r) => [...r]);
                          next[0][ci] = e.target.value;
                          setData((d) => ({ ...d, table: next }));
                        }}
                        className="w-full bg-transparent outline-none"
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableSafe.slice(1).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2 border border-black/10">
                        <input
                          value={cell}
                          onChange={(e) => {
                            const next = tableSafe.map((r) => [...r]);
                            next[ri + 1][ci] = e.target.value;
                            setData((d) => ({ ...d, table: next }));
                          }}
                          className="w-full bg-transparent outline-none"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex gap-2 mt-3">
              <button
                className="px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
                onClick={() =>
                  setData((d) => ({
                    ...d,
                    table: [...tableSafe, new Array(tableSafe[0].length).fill('')],
                  }))
                }
              >
                + Row
              </button>
              <button
                className="px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
                onClick={() =>
                  setData((d) => ({
                    ...d,
                    table: tableSafe.map((r, i) =>
                      i === 0 ? [...r, `Column ${r.length + 1}`] : [...r, ''],
                    ),
                  }))
                }
              >
                + Column
              </button>
            </div>
          </div>
        )}

        {data.activeTool === 'Bulleted list' && (
          <div>
            <ul className="space-y-2">
              {(data.bulleted ?? []).map((it, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span>•</span>
                  <input
                    value={it ?? ''}
                    onChange={(e) =>
                      setData((d) => ({
                        ...d,
                        bulleted: (d.bulleted ?? []).map((v, idx) =>
                          idx === i ? e.target.value : v,
                        ),
                      }))
                    }
                    className="flex-1 bg-transparent outline-none border border-black/10 rounded px-2 py-1"
                  />
                  <button
                    className="text-xs px-2 py-1 border border-black/10 rounded hover:bg-black/5"
                    onClick={() =>
                      setData((d) => ({
                        ...d,
                        bulleted: (d.bulleted ?? []).filter((_, idx) => idx !== i),
                      }))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <button
              className="mt-3 px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
              onClick={() => setData((d) => ({ ...d, bulleted: [...(d.bulleted ?? []), ''] }))}
            >
              + Add item
            </button>
          </div>
        )}

        {data.activeTool === 'Checklist' && (
          <div>
            <ul className="space-y-2">
              {(data.checklist ?? []).map((it, i) => (
                <li key={i} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!it.done}
                    onChange={(e) =>
                      setData((d) => ({
                        ...d,
                        checklist: (d.checklist ?? []).map((v, idx) =>
                          idx === i ? { ...v, done: e.target.checked } : v,
                        ),
                      }))
                    }
                  />
                  <input
                    value={it.text ?? ''}
                    onChange={(e) =>
                      setData((d) => ({
                        ...d,
                        checklist: (d.checklist ?? []).map((v, idx) =>
                          idx === i ? { ...v, text: e.target.value } : v,
                        ),
                      }))
                    }
                    className="flex-1 bg-transparent outline-none border border-black/10 rounded px-2 py-1"
                  />
                  <button
                    className="text-xs px-2 py-1 border border-black/10 rounded hover:bg-black/5"
                    onClick={() =>
                      setData((d) => ({
                        ...d,
                        checklist: (d.checklist ?? []).filter((_, idx) => idx !== i),
                      }))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <button
              className="mt-3 px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
              onClick={() =>
                setData((d) => ({
                  ...d,
                  checklist: [...(d.checklist ?? []), { text: '', done: false }],
                }))
              }
            >
              + Add item
            </button>
          </div>
        )}

        {data.activeTool === 'Task list' && (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 rounded-lg overflow-hidden">
              <thead>
                <tr>
                  {['Task', 'Assigned to', 'Due date', 'Bucket'].map((h) => (
                    <th key={h} className="bg-black/5 text-left px-3 py-2 border border-black/10">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.tasks ?? []).map((row, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 border border-black/10">
                      <input
                        value={row.task ?? ''}
                        onChange={(e) =>
                          setData((d) => ({
                            ...d,
                            tasks: (d.tasks ?? []).map((r, idx) =>
                              idx === i ? { ...r, task: e.target.value } : r,
                            ),
                          }))
                        }
                        className="w-full bg-transparent outline-none"
                      />
                    </td>
                    <td className="px-3 py-2 border border-black/10">
                      <input
                        value={row.assignee ?? ''}
                        onChange={(e) =>
                          setData((d) => ({
                            ...d,
                            tasks: (d.tasks ?? []).map((r, idx) =>
                              idx === i ? { ...r, assignee: e.target.value } : r,
                            ),
                          }))
                        }
                        className="w-full bg-transparent outline-none"
                      />
                    </td>
                    <td className="px-3 py-2 border border-black/10">
                      <input
                        type="date"
                        value={row.due ?? ''}
                        onChange={(e) =>
                          setData((d) => ({
                            ...d,
                            tasks: (d.tasks ?? []).map((r, idx) =>
                              idx === i ? { ...r, due: e.target.value } : r,
                            ),
                          }))
                        }
                        className="w-full bg-transparent outline-none"
                      />
                    </td>
                    <td className="px-3 py-2 border border-black/10">
                      <input
                        value={row.bucket ?? ''}
                        onChange={(e) =>
                          setData((d) => ({
                            ...d,
                            tasks: (d.tasks ?? []).map((r, idx) =>
                              idx === i ? { ...r, bucket: e.target.value } : r,
                            ),
                          }))
                        }
                        className="w-full bg-transparent outline-none"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              className="mt-3 px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
              onClick={() =>
                setData((d) => ({
                  ...d,
                  tasks: [
                    ...(d.tasks ?? []),
                    { task: 'Task name', assignee: '', due: '', bucket: 'To do' },
                  ],
                }))
              }
            >
              + Add task
            </button>
          </div>
        )}

        {data.activeTool === 'Numbered list' && (
          <div>
            <ol className="space-y-2">
              {(data.numbered ?? []).map((it, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-6 text-right">{i + 1}.</span>
                  <input
                    value={it ?? ''}
                    onChange={(e) =>
                      setData((d) => ({
                        ...d,
                        numbered: (d.numbered ?? []).map((v, idx) =>
                          idx === i ? e.target.value : v,
                        ),
                      }))
                    }
                    className="flex-1 bg-transparent outline-none border border-black/10 rounded px-2 py-1"
                  />
                  <button
                    className="text-xs px-2 py-1 border border-black/10 rounded hover:bg-black/5"
                    onClick={() =>
                      setData((d) => ({
                        ...d,
                        numbered: (d.numbered ?? []).filter((_, idx) => idx !== i),
                      }))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ol>
            <button
              className="mt-3 px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
              onClick={() =>
                setData((d) => ({ ...d, numbered: [...(d.numbered ?? []), ''] }))
              }
            >
              + Add item
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Message row ---------- */

export function MessageRow(props: {
  me: string;
  message: Message;
  onToggleReaction: (id: string, emoji: string) => void;
  onEditStart: (m: TextMessage) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  editingTextId: string | null;
  editingText: string;
  setEditingText: (t: string) => void;
  onReply: (m: Message) => void;
  onForward: (m: Message) => void;
  onDelete: (id: string) => void;
  onPin: (id: string) => void;
  openReactionFor: string | null;
  setOpenReactionFor: (id: string | null) => void;
  optionsOpenFor: string | null;
  setOptionsOpenFor: (id: string | null) => void;
}) {
  const {
    message: m,
    onToggleReaction,
    onEditStart,
    onEditSave,
    onEditCancel,
    editingTextId,
    editingText,
    setEditingText,
    onReply,
    onForward,
    onDelete,
    onPin,
    openReactionFor,
    setOpenReactionFor,
    optionsOpenFor,
    setOptionsOpenFor,
  } = props;

  const EMOJIS = ['😀', '❤️', '🤣', '😮', '😢', '👍'];
  const isEditing = m.kind === 'text' && editingTextId === m.id;
  const showBar = optionsOpenFor === m.id ? true : undefined;

  const sharedNoteTitle =
    m.kind === 'text'
      ? ((m as TextMessage).text.match(/📝\s*\*\*Shared note:\*\*\s*(.+)$/i)?.[1]?.trim() || null)
      : null;

  return (
    <div className="group relative">
      {m.pinned && (
        <div className="absolute -left-6 top-1 text-indigo-600" title="Pinned">
          <PinIcon solid />
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-[#1f2937] text-white grid place-items-center font-semibold">
          {m.author.slice(0, 1).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold">{m.author}</span>
            <span className="text-xs text-[var(--page-text)]/60">{m.time}</span>
          </div>

          <div className="mt-1">
            {m.kind === 'text' ? (
              isEditing ? (
                <input
                  autoFocus
                  className="w-full bg-[var(--panel-bg)] text-[var(--page-text)]
                             border border-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]
                             rounded px-2 py-1"
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onEditSave();
                    if (e.key === 'Escape') onEditCancel();
                  }}
                  onBlur={onEditSave}
                />
              ) : (
                <>
                  <div className="text-[15px] leading-snug text-[var(--page-text)] opacity-90 whitespace-pre-line">
                    {(m as TextMessage).text}
                  </div>
                  {sharedNoteTitle ? <SharedNotePreview title={sharedNoteTitle} /> : null}
                </>
              )
            ) : (
              <LiveLoopBlock msg={m as LoopMessage} mode="message" />
            )}
          </div>

          {!!m.reactions && Object.keys(m.reactions).length > 0 && (
            <div className="mt-2 flex gap-2">
              {Object.entries(m.reactions).map(([emoji, count]) => (
                <button
                  key={emoji}
                  className={`text-sm px-2 py-1 rounded border ${
                    m.myReactions?.[emoji]
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-black/10 hover:bg-black/5'
                  }`}
                  onClick={() => onToggleReaction(m.id, emoji)}
                >
                  {emoji} {count}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          className={`${
            showBar ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          } transition-opacity`}
          data-actions-bar
        >
          <div
            className="flex items-center gap-1
                       rounded-full shadow
                       px-2 py-1
                       !bg-[var(--panel-bg)]
                       !text-[var(--page-text)]
                       border border-[color-mix(in_oklab,var(--panel-text)_15%,transparent)]"
          >
            {EMOJIS.map((e) => (
              <button
                key={e}
                className="text-lg"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onToggleReaction(m.id, e);
                }}
              >
                {e}
              </button>
            ))}
            <span className="mx-2 h-5 w-px bg-black/10" />
            <button
              className="p-1 rounded hover:bg-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]"
              title="Edit"
              onClick={(ev) => {
                ev.stopPropagation();
                if (m.kind === 'text') onEditStart(m as TextMessage);
              }}
            >
              ✏️
            </button>
            <button
              className="p-1 rounded hover:bg-black/5"
              title="More"
              onClick={(ev) => {
                ev.stopPropagation();
                setOptionsOpenFor(optionsOpenFor === m.id ? null : m.id);
              }}
            >
              ⋯
            </button>
          </div>
        </div>
      </div>

      {openReactionFor === m.id && (
        <div
          className="absolute -top-10 left-14 z-40 bg-white border border-black/10 rounded shadow px-2 py-1 flex gap-1"
          data-popover
        >
          {EMOJIS.map((e) => (
            <button
              key={e}
              className="absolute -top-10 left-14 z-40
                         rounded shadow px-2 py-1 flex gap-1
                         bg-[var(--panel-bg)]
                         text-[var(--page-text)]
                         border border-[color-mix(in_oklab,var(--panel-text)_15%,transparent)]"
              onClick={() => {
                onToggleReaction(m.id, e);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {optionsOpenFor === m.id && (
        <div
          className="absolute right-0 -top-2 z-40 w-72 rounded-md border border-black/10 bg-white shadow-lg"
          data-popover
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-3 text-sm text-black/60 border-b border-black/10">
            More options
          </div>
          <button
            className="w-full text-left px-4 py-3 hover:bg-black/5"
            onClick={() => {
              setOptionsOpenFor(null);
              (document.activeElement as HTMLElement)?.blur();
              onReply(m);
            }}
          >
            Reply with quote
          </button>
          <button
            className="w-full text-left px-4 py-3 hover:bg-black/5"
            onClick={() => {
              setOptionsOpenFor(null);
              onForward(m);
            }}
          >
            Forward
          </button>
          <button
            className="w-full text-left px-4 py-3 hover:bg-black/5 text-red-600"
            onClick={() => {
              setOptionsOpenFor(null);
              onDelete(m.id);
            }}
          >
            Delete
          </button>
          <button
            className="w-full text-left px-4 py-3 hover:bg-black/5"
            onClick={() => {
              setOptionsOpenFor(null);
              onPin(m.id);
            }}
          >
            {m.pinned ? 'Unpin' : 'Pin'}
          </button>
        </div>
      )}
    </div>
  );
}
