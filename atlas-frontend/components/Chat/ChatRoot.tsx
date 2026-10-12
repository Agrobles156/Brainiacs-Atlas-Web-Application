'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { LiveLoopBlock } from '@/app/(root)/chat/chatUI';
import { SharedNotePreview } from '@/app/(root)/chat/chatUI';



/**
 * Chat with user persistence.
 * - Invite/View Invites modals (via /flask-api)
 * - Accept/Decline by email (cookie/localStorage)
 * - Mirrors /whoami → `whoami` cookie
 * - Leave Server tombstone list prevents rejoin
 * - Backend: loads channels/messages, posts new ones, polls updates
 */

type LoopTool =
  | 'Paragraph'
  | 'Table'
  | 'Bulleted list'
  | 'Checklist'
  | 'Task list'
  | 'Numbered list';
type ChecklistItem = { text: string; done: boolean };
type TaskRow = { task: string; assignee: string; due: string; bucket: string };

type LoopPayload = {
  title: string;
  activeTool: LoopTool;
  paragraph: string;
  table: string[][];
  bulleted: string[];
  checklist: ChecklistItem[];
  tasks: TaskRow[];
  numbered: string[];
};

const EMPTY_LOOP: LoopPayload = {
  title: '',
  activeTool: 'Paragraph',
  paragraph: '',
  table: [['Column 1', 'Column 2']],
  bulleted: [],
  checklist: [],
  tasks: [],
  numbered: [],
};

type BaseMessage = {
  id: string;
  author: string;
  time: string;
  pinned?: boolean;
  reactions?: Record<string, number>;
  myReactions?: Record<string, boolean>;
};
type TextMessage = BaseMessage & { kind: 'text'; text: string };
type LoopMessage = BaseMessage & { kind: 'loop'; loop: LoopPayload };
type Message = TextMessage | LoopMessage;

type Channel = { id: string; name: string; messages: Message[] };
type Server = { id: string; name: string; icon?: string; channels: Channel[] };
type Member = { id: string; name: string; role?: string; online?: boolean };
type DmThread = { id: string; user: Member; messages: Message[] };
type PersistShape = {
  __owner: string;
  servers: Server[];
  activeServerId: string | null;
  activeChannelId: string | null;
  dmThreads: DmThread[];
  isDmHub: boolean;
  activeDmId: string | null;
  /** Tombstones for servers the user explicitly left (prevents re-add on hydrate) */
  leftServerIds?: string[];
};

/* ---------- Small helpers ---------- */

function fmtTime(iso?: string): string {
  try {
    return new Date(iso || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
function ensureLoop(l: any): LoopPayload {
  return { ...EMPTY_LOOP, ...(l || {}) };
}

// For testing/demo purposes. I will change this later.
const demoMembers: Member[] = [
  { id: 'u2', name: 'kingken40', online: true },
  { id: 'u3', name: 'valenzuelaMta', online: true },
  { id: 'u4', name: 'andrarunns', online: true },
  { id: 'u5', name: 'rayala36', online: false },
  { id: 'u6', name: 'agrobles6', online: false },
];

//LocalStorage
const LS_BASE = 'chat_app_state.v7';
const storageKeyFor = (userId: string) => `${LS_BASE}:${userId}`;
const loadStateFor = (userId: string): PersistShape | null => {
  try {
    const raw = localStorage.getItem(storageKeyFor(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const saveStateFor = (userId: string, data: PersistShape) => {
  try {
    localStorage.setItem(storageKeyFor(userId), JSON.stringify(data));
  } catch {}
};

//Seeds
const seedServers = (): Server[] => [
  {
    id: crypto.randomUUID(),
    name: 'Brainiacs',
    icon: 'B',
    channels: [
      {
        id: crypto.randomUUID(),
        name: 'general',
        messages: [
          {
            id: crypto.randomUUID(),
            kind: 'text',
            author: 'nat1',
            text: 'Welcome to Brainiacs — use #general to coordinate!',
            time: 'Today at 10:12 AM',
          },
          {
            id: crypto.randomUUID(),
            kind: 'text',
            author: 'NeuroKat',
            text: 'Just pushed the atlas viewer tweaks. Can someone QA the dual view?',
            time: 'Today at 10:15 AM',
          },
          {
            id: crypto.randomUUID(),
            kind: 'text',
            author: 'axon42',
            text: 'I’ll test levels 27–30 and report back.',
            time: 'Today at 10:16 AM',
          },
        ],
      },
      { id: crypto.randomUUID(), name: 'start-here', messages: [] },
      { id: crypto.randomUUID(), name: 'announcements', messages: [] },
    ],
  },
];

const seedDmThreads = (): DmThread[] => {
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return [
    {
      id: crypto.randomUUID(),
      user: demoMembers.find((m) => m.id === 'u2')!,
      messages: [
        {
          id: crypto.randomUUID(),
          kind: 'text',
          author: 'NeuroKat',
          text: 'hey! quick question on the atlas viewer',
          time: now,
        },
        { id: crypto.randomUUID(), kind: 'text', author: 'nat1', text: 'shoot!', time: now },
      ],
    },
    {
      id: crypto.randomUUID(),
      user: demoMembers.find((m) => m.id === 'u3')!,
      messages: [
        {
          id: crypto.randomUUID(),
          kind: 'text',
          author: 'axon42',
          text: 'levels 27–30 look good ✅',
          time: now,
        },
      ],
    },
  ];
};

//API helpers
const API = '/flask-api';

async function whoAmI(): Promise<string> {
  try {
    const res = await fetch(`${API}/whoami`, { credentials: 'include' });
    const data = await res.json();
    return (data?.message ?? '').toString().trim() || 'anonymous';
  } catch {
    return 'anonymous';
  }
}

//Read identity email for invites: cookie "email" or localStorage "email"
function getIdentityEmail(): string | null {
  try {
    if (typeof document !== 'undefined') {
      const m = document.cookie.match(/(?:^|;\s*)email=([^;]+)/);
      if (m && m[1]) return decodeURIComponent(m[1]).trim() || null;
    }
    if (typeof window !== 'undefined') {
      const ls = window.localStorage.getItem('email') || '';
      return (ls || '').trim() || null;
    }
  } catch {}
  return null;
}

//Persist identity email (helps the badge + API calls)
function setIdentityEmail(email: string) {
  try {
    if (typeof document !== 'undefined') {
      document.cookie = `email=${encodeURIComponent(email)}; path=/; SameSite=Lax`;
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('email', email);
    }
  } catch {}
}

// Make sure backend can read a friendly inviter display
function setWhoamiCookie(name: string) {
  try {
    if (!name) return;
    document.cookie = `whoami=${encodeURIComponent(name)}; path=/; SameSite=Lax`;
  } catch {}
}

//Notes helpers
const NOTES_URLS = [`${API}/notes`, `${API}/notes/`];
function extractNotesArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.notes)) return data.notes;
  if (Array.isArray(data?.data?.notes)) return data.data.notes;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}
async function fetchMyNoteTitles(): Promise<string[]> {
  for (const url of NOTES_URLS) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) continue;
      const data = await res.json();
      const list = extractNotesArray(data);
      if (!list.length) continue;
      const titles = list
        .map((n: any) => n?.title ?? n?.name ?? n?.note_title ?? '')
        .map((t: any) => String(t || '').trim())
        .filter(Boolean);
      if (titles.length) return Array.from(new Set(titles));
    } catch {}
  }
  return [];
}

function displayFromUser(userId: string) {
  return userId.includes('@') ? userId.split('@')[0] : userId || 'me';
}

//Invites API helpers
type PendingInvite = {
  serverId: string;
  serverName?: string;
  email: string;
  invitedBy?: string; // inviter display
  createdAt?: string;
  expiresAt?: string;
  joinLink?: string; // contains ?t=<token>
};

//Always include an email; if we don't have one, skip the call.
async function fetchPendingInvites(emailArg?: string | null): Promise<PendingInvite[]> {
  try {
    const email = emailArg ?? getIdentityEmail();
    if (!email) return [];
    const res = await fetch(`${API}/invites/pending?email=${encodeURIComponent(email)}`, {
      credentials: 'include',
    });
    const data = await res.json();
    return Array.isArray(data?.invites) ? (data.invites as PendingInvite[]) : [];
  } catch {
    return [];
  }
}

async function acceptInviteToken(token: string, asEmail?: string | null) {
  const body: any = { token };
  if (asEmail) body.as = asEmail;
  const res = await fetch(`${API}/invites/accept`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return {
    ok: !!data?.ok,
    server: data?.server,
    serverName: data?.serverName as string | undefined,
    already: !!data?.alreadyAccepted,
  };
}

async function declineInviteToken(token: string, asEmail?: string | null) {
  const body: any = { token };
  if (asEmail) body.as = asEmail;
  try {
    const res = await fetch(`${API}/invites/decline`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: !!data?.ok };
  } catch {
    return { ok: false };
  }
}

async function fetchMyServers(email?: string | null): Promise<{ id: string; name: string }[]> {
  try {
    const qs = email ? `?email=${encodeURIComponent(email)}` : '';
    const res = await fetch(`${API}/me/servers${qs}`, { credentials: 'include' });
    const data = await res.json();
    return Array.isArray(data?.servers) ? data.servers : [];
  } catch {
    return [];
  }
}

//Chat API helpers (channels + messages)

type BackendChannel = { id: string; name: string };
type BackendMessageDoc = {
  _id: string;
  kind: 'text' | 'loop';
  text?: string;
  loop?: any;
  author?: string;
  createdAt?: string; // ISO
  clientId?: string; // optional echo-back
};

async function apiListChannels(serverId: string): Promise<BackendChannel[]> {
  try {
    const res = await fetch(`${API}/servers/${encodeURIComponent(serverId)}/channels`, {
      credentials: 'include',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.channels) ? (data.channels as BackendChannel[]) : [];
  } catch {
    return [];
  }
}

function mapDocToMessage(d: BackendMessageDoc): Message {
  if (d.kind === 'loop') {
    return {
      id: d._id || crypto.randomUUID(),
      kind: 'loop',
      author: d.author || 'someone',
      loop: ensureLoop(d.loop),
      time: fmtTime(d.createdAt),
    };
  }
  return {
    id: d._id || crypto.randomUUID(),
    kind: 'text',
    author: d.author || 'someone',
    text: d.text || '',
    time: fmtTime(d.createdAt),
  };
}

async function apiListMessages(serverId: string, channelId: string, limit = 200): Promise<Message[]> {
  try {
    const url = `${API}/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(
      channelId
    )}/messages?limit=${limit}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return [];
    const data = await res.json();
    const raw: BackendMessageDoc[] = Array.isArray(data?.messages) ? data.messages : [];
    return raw.map(mapDocToMessage);
  } catch {
    return [];
  }
}

async function apiPostMessage(
  serverId: string,
  channelId: string,
  payload: { kind: 'text'; text: string } | { kind: 'loop'; loop: LoopPayload },
  authorDisplay: string
): Promise<boolean> {
  try {
    const body: any =
      payload.kind === 'text'
        ? { kind: 'text', text: payload.text, author: authorDisplay, clientId: crypto.randomUUID() }
        : { kind: 'loop', loop: payload.loop, author: authorDisplay, clientId: crypto.randomUUID() };
    const url = `${API}/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return !!data?.ok;
  } catch {
    return false;
  }
}

//Tiny icons ======
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const LoopGlyph = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={`h-5 w-5 ${className}`} fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 12a7 7 0 117 7H9l-4 3 1.2-4.8A6.9 6.9 0 014 12z" />
  </svg>
);
const PinIcon = ({ solid = false }: { solid?: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill={solid ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
    <path d="M14 9l7-7m-7 7l-4 10-2-6-6-2 10-4z" />
  </svg>
);
const BellIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M15 17h5l-1.4-1.4A2 2 0 0118 14V9a6 6 0 10-12 0v5a2 2 0 01-.6 1.4L4 17h5" />
    <path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);

//Component
export default function ChatPage() {
  // identity
  const [userId, setUserId] = useState<string | null>(null);
  const me = useMemo(() => displayFromUser(userId ?? 'anonymous'), [userId]);

  // app state
  const [servers, setServers] = useState<Server[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [dmThreads, setDmThreads] = useState<DmThread[]>([]);
  const [isDmHub, setIsDmHub] = useState<boolean>(true);
  const [activeDmId, setActiveDmId] = useState<string | null>(null);

  //Tombstones of servers the user left locally
  const [leftServerIds, setLeftServerIds] = useState<string[]>([]);

  // compose
  const [draft, setDraft] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typingTimer = useRef<number | null>(null);

  // menus & modals
  const [menuOpen, setMenuOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const plusRef = useRef<HTMLDivElement | null>(null);

  // message action UI
  const [openReactionFor, setOpenReactionFor] = useState<string | null>(null);
  const [optionsOpenFor, setOptionsOpenFor] = useState<string | null>(null);

  // notes
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteTitles, setNoteTitles] = useState<string[]>([]);
  const [notesQuery, setNotesQuery] = useState('');
  const [notesSelectedTitle, setNotesSelectedTitle] = useState<string | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  // LOOP inline composer
  const [loopOpen, setLoopOpen] = useState(false);
  const [loopTitle, setLoopTitle] = useState('');
  const [activeTool, setActiveTool] = useState<LoopTool>('Paragraph');
  const [loopBody, setLoopBody] = useState('');
  const loopParaRef = useRef<HTMLDivElement | null>(null);

  // Measure loop panel & auto scroll
  const loopPanelRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const [loopPad, setLoopPad] = useState(0);
  const prevPadRef = useRef(0);

  // Table / lists state for composer
  const [table, setTable] = useState<string[][]>([
    ['Column 1', 'Column 2'],
    ['1', ''],
    ['2', ''],
  ]);
  const [bulleted, setBulleted] = useState<string[]>(['Add item']);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([{ text: 'Add item', done: false }]);
  const [tasks, setTasks] = useState<TaskRow[]>([
    { task: 'Task name', assignee: '', due: '', bucket: 'To do' },
    { task: 'Task name', assignee: '', due: '', bucket: 'To do' },
  ]);
  const [numbered, setNumbered] = useState<string[]>(['Add item']);

  // editing text
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');

  // message refs
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Bootstrap identity ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await whoAmI();
      if (!cancelled) {
        setUserId(id || 'anonymous');
        setWhoamiCookie(id || 'anonymous');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load state per-user
  useEffect(() => {
    if (!userId) return;
    const loaded = loadStateFor(userId);
    if (loaded && loaded.__owner === userId && loaded.servers?.length) {
      setServers(loaded.servers);
      setLeftServerIds(loaded.leftServerIds ?? []);
      const seededDMs = loaded.dmThreads?.length ? loaded.dmThreads : seedDmThreads();
      setDmThreads(seededDMs);
      setIsDmHub(true);
      setActiveDmId(
        loaded.activeDmId && seededDMs.some((d) => d.id === loaded.activeDmId)
          ? loaded.activeDmId
          : seededDMs[0]?.id ?? null
      );
      const chosenServerId =
        loaded.activeServerId && loaded.servers.some((s) => s.id === loaded.activeServerId)
          ? loaded.activeServerId
          : loaded.servers[0].id;
      setActiveServerId(chosenServerId);
      const srv = loaded.servers.find((s) => s.id === chosenServerId)!;
      const chosenChannelId =
        loaded.activeChannelId && srv.channels.some((c) => c.id === loaded.activeChannelId)
          ? loaded.activeChannelId
          : srv.channels[0]?.id ?? null;
      setActiveChannelId(chosenChannelId);
    } else {
      const seededServers = seedServers();
      const seededDMs = seedDmThreads();
      setServers(seededServers);
      setActiveServerId(seededServers[0].id);
      setActiveChannelId(seededServers[0].channels[0].id);
      setDmThreads(seededDMs);
      setIsDmHub(true);
      setActiveDmId(seededDMs[0]?.id ?? null);
      setLeftServerIds([]);
    }
  }, [userId]);

  // Persist
  useEffect(() => {
    if (!userId || !servers.length) return;
    saveStateFor(userId, {
      __owner: userId,
      servers,
      activeServerId,
      activeChannelId,
      dmThreads,
      isDmHub,
      activeDmId,
      leftServerIds,
    });
  }, [userId, servers, activeServerId, activeChannelId, dmThreads, isDmHub, activeDmId, leftServerIds]);

  // scroll bottom on thread change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [servers, activeServerId, activeChannelId, dmThreads, activeDmId, isDmHub]);

  // outside click for +
  useEffect(() => {
    if (!plusOpen && !optionsOpenFor && !openReactionFor) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-popover]') && !target.closest('[data-actions-bar]')) {
        setPlusOpen(false);
        setOptionsOpenFor(null);
        setOpenReactionFor(null);
      }
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [plusOpen, optionsOpenFor, openReactionFor]);

  // Esc close notes
  useEffect(() => {
    if (!notesOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotesOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notesOpen]);

  // typing timer cleanup
  useEffect(
    () => () => {
      if (typingTimer.current) {
        window.clearTimeout(typingTimer.current);
        typingTimer.current = null;
      }
    },
    []
  );

  // derived
  const activeServer = useMemo(
    () => servers.find((s) => s.id === activeServerId) ?? null,
    [servers, activeServerId]
  );
  const activeChannel = useMemo(
    () => (activeServer ? activeServer.channels.find((c) => c.id === activeChannelId) ?? null : null),
    [activeServer, activeChannelId]
  );
  const activeDm = useMemo(
    () => dmThreads.find((d) => d.id === activeDmId) ?? null,
    [dmThreads, activeDmId]
  );

  const threadMessages = (isDmHub ? activeDm?.messages : activeChannel?.messages) ?? [];
  const pinned = threadMessages.filter((m) => m.pinned);

  const filteredTitles = useMemo(() => {
    if (!notesQuery.trim()) return noteTitles;
    const q = notesQuery.toLowerCase();
    return noteTitles.filter((t) => t.toLowerCase().includes(q));
  }, [noteTitles, notesQuery]);

  //Chat hydration: channels + messages

  // Pull channels from backend whenever we switch to a server.
  useEffect(() => {
    if (!activeServerId || isDmHub) return;
    let cancelled = false;
    (async () => {
      const chs = await apiListChannels(activeServerId);
      if (cancelled || !chs.length) return;

      setServers((prev) =>
        prev.map((s) => {
          if (s.id !== activeServerId) return s;
          // remember the name of the channel currently selected so we can preserve selection
          const prevActiveName = s.channels.find((c) => c.id === activeChannelId)?.name;
          const nextChannels: Channel[] = chs.map((ch) => {
            const existing = s.channels.find((c) => c.name === ch.name || c.id === ch.id);
            return { id: ch.id, name: ch.name, messages: existing?.messages ?? [] };
          });
          // ensure we have at least one channel
          const fallback = nextChannels.length ? nextChannels : [{ id: crypto.randomUUID(), name: 'general', messages: [] }];
          // re-pick the active channel id by name
          const newActive = (prevActiveName && fallback.find((c) => c.name === prevActiveName)) || fallback[0];
          // set outside of setServers to avoid stale closure
          if (newActive && newActive.id !== activeChannelId) setActiveChannelId(newActive.id);
          return { ...s, channels: fallback };
        })
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeServerId, isDmHub]);

  // Pull messages for the active channel (on switch).
  useEffect(() => {
    if (!activeServerId || !activeChannelId || isDmHub) return;
    let cancelled = false;
    (async () => {
      const msgs = await apiListMessages(activeServerId, activeChannelId);
      if (cancelled) return;
      if (!msgs.length) return; // keep local (maybe first post)
      setServers((prev) =>
        prev.map((s) =>
          s.id !== activeServerId
            ? s
            : {
                ...s,
                channels: s.channels.map((c) => (c.id !== activeChannelId ? c : { ...c, messages: msgs })),
              }
        )
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [activeServerId, activeChannelId, isDmHub]);

  // Light polling so other users' messages show up without a reload.
  useEffect(() => {
    if (!activeServerId || !activeChannelId || isDmHub) return;
    const tick = async () => {
      const msgs = await apiListMessages(activeServerId, activeChannelId);
      if (!msgs.length) return;
      setServers((prev) =>
        prev.map((s) =>
          s.id !== activeServerId
            ? s
            : {
                ...s,
                channels: s.channels.map((c) => {
                  if (c.id !== activeChannelId) return c;
                  // simple replace; backend is source of truth
                  return { ...c, messages: msgs };
                }),
              }
        )
      );
    };
    const id = window.setInterval(tick, 10_000);
    return () => window.clearInterval(id);
  }, [activeServerId, activeChannelId, isDmHub]);

  //Helpers to mutate current thread/channel message list
  const updateMessages = (fn: (arr: Message[]) => Message[]) => {
    if (isDmHub) {
      if (!activeDm) return;
      setDmThreads((prev) => prev.map((t) => (t.id === activeDm.id ? { ...t, messages: fn(t.messages) } : t)));
    } else if (activeServer && activeChannel) {
      setServers((prev) =>
        prev.map((s) =>
          s.id !== activeServer.id
            ? s
            : {
                ...s,
                channels: s.channels.map((c) =>
                  c.id !== activeChannel.id ? c : { ...c, messages: fn(c.messages) }
                ),
              }
        )
      );
    }
  };
  const appendMessage = (m: Message) => updateMessages((arr) => [...arr, m]);

  // Servers sync from backend after accepting an invite ===
  const hydrateServerIfMissing = (list: Server[], srv: { id: string; name: string }): Server[] => {
    // respect tombstones
    if (leftServerIds.includes(srv.id)) return list;
    if (list.some((s) => s.id === srv.id)) {
      // If name changed on backend, update it locally.
      return list.map((s) =>
        s.id === srv.id
          ? { ...s, name: srv.name || s.name, icon: (srv.name || s.name || 'S').charAt(0).toUpperCase() }
          : s
      );
    }
    const newSrv: Server = {
      id: srv.id,
      name: srv.name || srv.id,
      icon: (srv.name || 'S').charAt(0).toUpperCase(),
      channels: [
        { id: crypto.randomUUID(), name: 'general', messages: [] },
        { id: crypto.randomUUID(), name: 'start-here', messages: [] },
        { id: crypto.randomUUID(), name: 'announcements', messages: [] },
      ],
    };
    return [...list, newSrv];
  };

  const refreshServersFromBackend = async (email?: string | null, preferServerId?: string | null) => {
    const list = await fetchMyServers(email);
    if (!list.length) return;
    setServers((prev) => {
      let next = [...prev];
      for (const s of list) {
        if (leftServerIds.includes(s.id)) continue; // honor tombstones
        next = hydrateServerIfMissing(next, s);
      }
      if (preferServerId && list.some((s) => s.id === preferServerId) && !leftServerIds.includes(preferServerId)) {
        setIsDmHub(false);
        setActiveServerId(preferServerId);
        const srv = next.find((x) => x.id === preferServerId);
        const firstCh = srv?.channels?.[0]?.id ?? null;
        setActiveChannelId(firstCh);
      }
      return next;
    });
  };

  // Quick “pending invites” badge
  const refreshPendingCount = async () => {
    const email = getIdentityEmail();
    const pending = await fetchPendingInvites(email);
    setPendingCount(pending.length);
  };

  useEffect(() => {
    if (!userId) return;
    refreshPendingCount();
    const tm = window.setInterval(refreshPendingCount, 60_000);
    return () => window.clearInterval(tm);
  }, [userId]);

  /* ===== actions ===== */
  const switchToDmHub = () => {
    setIsDmHub(true);
    setMenuOpen(false);
    setPlusOpen(false);
    if (!activeDmId && dmThreads[0]) setActiveDmId(dmThreads[0].id);
  };
  const switchServer = (id: string) => {
    setIsDmHub(false);
    setMenuOpen(false);
    setPlusOpen(false);
    setActiveServerId(id);
    const srv = servers.find((s) => s.id === id);
    setActiveChannelId(srv?.channels[0]?.id ?? null);
  };
  const addServer = () => {
    const name = prompt('New server name (e.g., Neuro Lab)')?.trim();
    if (!name) return;
    const icon = name[0]?.toUpperCase() || 'S';
    const ns: Server = {
      id: crypto.randomUUID(),
      name,
      icon,
      channels: [
        { id: crypto.randomUUID(), name: 'general', messages: [] },
        { id: crypto.randomUUID(), name: 'start-here', messages: [] },
      ],
    };
    setServers((prev) => [...prev, ns]);
    setIsDmHub(false);
    setActiveServerId(ns.id);
    setActiveChannelId(ns.channels[0].id);
  };
  const leaveServer = (serverId: string) => {
    const srv = servers.find((s) => s.id === serverId);
    if (!srv) return;
    const ok = confirm(`Leave server “${srv.name}”?`);
    if (!ok) return;
    setServers((prev) => {
      const next = prev.filter((s) => s.id !== serverId);
      if (!isDmHub && activeServerId === serverId) {
        if (next.length) {
          const fallback = next[0];
          setActiveServerId(fallback.id);
          setActiveChannelId(fallback.channels[0]?.id ?? null);
        } else {
          setIsDmHub(true);
          setActiveServerId(null);
          setActiveChannelId(null);
        }
      }
      return next;
    });
    // add tombstone so backend hydration won't re-add it later
    setLeftServerIds((prev) => (prev.includes(serverId) ? prev : [...prev, serverId]));
  };
  const switchChannel = (id: string) => {
    setMenuOpen(false);
    setPlusOpen(false);
    setActiveChannelId(id);
  };
  const selectDm = (id: string) => {
    setActiveDmId(id);
    setPlusOpen(false);
  };

  const sendMessage = async () => {
    if (!draft.trim()) return;
    const text = draft.trim();
    // optimistic local append
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    appendMessage({ id: crypto.randomUUID(), kind: 'text', author: me, text, time: now });
    setDraft('');
    setIsTyping(false);
    if (typingTimer.current) {
      window.clearTimeout(typingTimer.current);
      typingTimer.current = null;
    }
    // persist to backend for channels
    if (!isDmHub && activeServerId && activeChannelId) {
      await apiPostMessage(activeServerId, activeChannelId, { kind: 'text', text }, me);
      // quick refresh to align ids + order
      const msgs = await apiListMessages(activeServerId, activeChannelId);
      if (msgs.length) {
        setServers((prev) =>
          prev.map((s) =>
            s.id !== activeServerId
              ? s
              : {
                  ...s,
                  channels: s.channels.map((c) => (c.id !== activeChannelId ? c : { ...c, messages: msgs })),
                }
          )
        );
      }
    }
  };
  const handleDraftChange = (v: string) => {
    setDraft(v);
    if (!isTyping) setIsTyping(true);
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => setIsTyping(false), 1200);
  };

  // "+" quick actions
  const sendQuick = async (kind: 'upload' | 'thread' | 'poll' | 'notes') => {
    setPlusOpen(false);
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (kind === 'upload') {
      const name = prompt('File name to show (demo only):', 'report.pdf') || 'file.txt';
      appendMessage({
        id: crypto.randomUUID(),
        kind: 'text',
        author: me,
        text: `📎 **Uploaded a file:** ${name} (demo)`,
        time: now,
      });
      return;
    }
    if (kind === 'thread') {
      const title = prompt('Thread title:', 'Follow-up on atlas viewer') || 'New thread';
      appendMessage({
        id: crypto.randomUUID(),
        kind: 'text',
        author: me,
        text: `🧵 **Created a thread:** ${title} (demo)`,
        time: now,
      });
      return;
    }
    if (kind === 'poll') {
      const q = prompt('Poll question:', 'Which level to test next?') || 'Untitled poll';
      appendMessage({
        id: crypto.randomUUID(),
        kind: 'text',
        author: me,
        text: `📊 **Poll:** ${q}\n• Option A\n• Option B\n• Option C`,
        time: now,
      });
      return;
    }
    if (kind === 'notes') {
      if (isDmHub) {
        alert('Sharing notes is enabled for channels first. Switch to a server channel to share.');
        return;
      }
      setNotesOpen(true);
      setNotesLoading(true);
      setNotesError(null);
      setNoteTitles([]);
      setNotesQuery('');
      setNotesSelectedTitle(null);
      try {
        const titles = await fetchMyNoteTitles();
        if (!titles.length) setNotesError("Couldn't find any of your notes.");
        setNoteTitles(titles);
      } catch {
        setNotesError('Failed to load your notes.');
      } finally {
        setNotesLoading(false);
      }
      return;
    }
  };

  // share note title
  const shareSelectedNote = async () => {
    if (!notesSelectedTitle) return;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const text = `📝 **Shared note:** ${notesSelectedTitle}`;
    appendMessage({
      id: crypto.randomUUID(),
      kind: 'text',
      author: me,
      text,
      time: now,
    });
    setNotesOpen(false);
    if (!isDmHub && activeServerId && activeChannelId) {
      await apiPostMessage(activeServerId, activeChannelId, { kind: 'text', text }, me);
      const msgs = await apiListMessages(activeServerId, activeChannelId);
      if (msgs.length) {
        setServers((prev) =>
          prev.map((s) =>
            s.id !== activeServerId
              ? s
              : {
                  ...s,
                  channels: s.channels.map((c) => (c.id !== activeChannelId ? c : { ...c, messages: msgs })),
                }
          )
        );
      }
    }
  };

  // Insert Loop message
  const insertLoopIntoDraft = async () => {
    const payload: LoopPayload = {
      title: loopTitle || 'Add a title',
      activeTool,
      paragraph: loopParaRef.current?.innerText ?? loopBody ?? '',
      table,
      bulleted,
      checklist,
      tasks,
      numbered,
    };
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    appendMessage({ id: crypto.randomUUID(), kind: 'loop', author: me, loop: { ...EMPTY_LOOP, ...payload }, time: now });
    setLoopOpen(false);

    if (!isDmHub && activeServerId && activeChannelId) {
      await apiPostMessage(activeServerId, activeChannelId, { kind: 'loop', loop: payload }, me);
      const msgs = await apiListMessages(activeServerId, activeChannelId);
      if (msgs.length) {
        setServers((prev) =>
          prev.map((s) =>
            s.id !== activeServerId
              ? s
              : {
                  ...s,
                  channels: s.channels.map((c) => (c.id !== activeChannelId ? c : { ...c, messages: msgs })),
                }
          )
        );
      }
    }
  };

  // Message actions
  const toggleReaction = (id: string, emoji: string) => {
    updateMessages((arr) =>
      arr.map((m) => {
        if (m.id !== id) return m;
        const counts = { ...(m.reactions || {}) };
        const mine = { ...(m.myReactions || {}) };
        if (mine[emoji]) {
          counts[emoji] = Math.max(0, (counts[emoji] || 0) - 1);
          delete mine[emoji];
          if (!counts[emoji]) delete counts[emoji];
        } else {
          counts[emoji] = (counts[emoji] || 0) + 1;
          mine[emoji] = true;
        }
        return { ...m, reactions: counts, myReactions: mine };
      })
    );
  };

  const startEditText = (m: TextMessage) => {
    setEditingTextId(m.id);
    setEditingText(m.text);
  };
  const saveEditText = () => {
    if (!editingTextId) return;
    updateMessages((arr) =>
      arr.map((m) => (m.id === editingTextId && m.kind === 'text' ? { ...m, text: editingText } : m))
    );
    setEditingTextId(null);
    setEditingText('');
  };
  const cancelEditText = () => {
    setEditingTextId(null);
    setEditingText('');
  };

  const replyWithQuote = (m: Message) => {
    const quoted = m.kind === 'text' ? m.text : renderLoopAsPlain((m as LoopMessage).loop);
    const block = quoted
      .split('\n')
      .map((l) => `> ${l}`)
      .join('\n');
    setDraft(`${block}\n\n${draft}`);
  };

  const forwardMessage = (m: Message) => {
    const dest = prompt('Forward to:\n- #channel-name  (current server)\n- @username      (DM)', '#general');
    if (!dest) return;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const copy: Message =
      m.kind === 'text'
        ? { id: crypto.randomUUID(), kind: 'text', author: me, text: (m as TextMessage).text, time: now }
        : {
            id: crypto.randomUUID(),
            kind: 'loop',
            author: me,
            loop: { ...EMPTY_LOOP, ...((m as LoopMessage).loop ?? {}) },
            time: now,
          };

    if (dest.startsWith('#') && activeServer) {
      const name = dest.slice(1).trim();
      setServers((prev) =>
        prev.map((s) =>
          s.id !== activeServer.id
            ? s
            : {
                ...s,
                channels: s.channels.map((c) => (c.name === name ? { ...c, messages: [...c.messages, copy] } : c)),
              }
        )
      );
      return;
    }
    if (dest.startsWith('@')) {
      const who = dest.slice(1).trim();
      const member = demoMembers.find((mb) => mb.name === who);
      if (!member) {
        alert('User not found in demo list.');
        return;
      }
      const existing = dmThreads.find((t) => t.user.name === who);
      if (existing) {
        setDmThreads((prev) => prev.map((t) => (t.id === existing.id ? { ...t, messages: [...t.messages, copy] } : t)));
      } else {
        const thread: DmThread = { id: crypto.randomUUID(), user: member, messages: [copy] };
        setDmThreads((prev) => [...prev, thread]);
      }
      return;
    }
  };

  const deleteMessage = (id: string) => {
    const ok = confirm('Delete this message?');
    if (!ok) return;
    updateMessages((arr) => arr.filter((m) => m.id !== id));
  };

  const togglePin = (id: string) =>
    updateMessages((arr) => arr.map((m) => (m.id === id ? { ...m, pinned: !m.pinned } : m)));

  // Jump to pinned
  const jumpToMessage = (id: string) => {
    const el = msgRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightId(id);
      window.setTimeout(() => setHighlightId(null), 1300);
    }
  };

  // Helpers
  function renderLoopAsPlain(loop: LoopPayload): string {
    const L = { ...EMPTY_LOOP, ...(loop ?? {}) };
    const parts: string[] = [`**${L.title}**`];
    switch (L.activeTool) {
      case 'Paragraph':
        parts.push(L.paragraph || '');
        break;
      case 'Table': {
        const head = '| ' + L.table[0].join(' | ') + ' |';
        const sep = '| ' + L.table[0].map(() => '---').join(' | ') + ' |';
        const rows = L.table
          .slice(1)
          .map((r) => '| ' + r.join(' | ') + ' |')
          .join('\n');
        parts.push([head, sep, rows].filter(Boolean).join('\n'));
        break;
      }
      case 'Bulleted list':
        parts.push(L.bulleted.map((i) => `• ${i}`).join('\n'));
        break;
      case 'Checklist':
        parts.push(L.checklist.map((i) => `${i.done ? '☑' : '☐'} ${i.text}`).join('\n'));
        break;
      case 'Task list': {
        const head = '| Task | Assigned to | Due date | Bucket |\n| --- | --- | --- | --- |';
        const rows = L.tasks.map((t) => `| ${t.task} | ${t.assignee} | ${t.due} | ${t.bucket} |`).join('\n');
        parts.push(`${head}\n${rows}`);
        break;
      }
      case 'Numbered list':
        parts.push(L.numbered.map((i, idx) => `${idx + 1}. ${i}`).join('\n'));
        break;
    }
    return parts.join('\n');
  }

  /**
   * Keep loopPad in sync with the Loop panel height using ResizeObserver.
   * Also, when loopPad changes, if the user is at/near the bottom, bump the
   * scrollTop by the delta so nothing gets covered by the composer.
   */
  useEffect(() => {
    if (!loopOpen) {
      setLoopPad(0);
      prevPadRef.current = 0;
      return;
    }

    const el = loopPanelRef.current;
    const measure = () => {
      if (!el) return;
      const h = el.getBoundingClientRect().height || 0;
      const pad = Math.ceil(h + 16); // breathing room
      setLoopPad(pad);
    };

    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(() => requestAnimationFrame(measure));
    if (el) ro.observe(el);

    const onResize = () => requestAnimationFrame(measure);
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [loopOpen]);

  // Preserve bottom visibility when loopPad changes
  useEffect(() => {
    const scroller = messagesScrollRef.current;
    if (!scroller) return;

    const atBottomThreshold = 48;
    const maxTop = scroller.scrollHeight - scroller.clientHeight;
    const distFromBottom = Math.max(0, maxTop - scroller.scrollTop);
    const nearBottom = distFromBottom <= atBottomThreshold;

    const prev = prevPadRef.current;
    const delta = loopPad - prev;

    if (delta !== 0) {
      if (nearBottom) {
        scroller.scrollTop = Math.min(scroller.scrollTop + delta, scroller.scrollHeight);
      }
      prevPadRef.current = loopPad;
    }
  }, [loopPad]);

  // Invite sending handler
  const handleSendInvites = async (emails: string[]) => {
    if (!activeServer) return { ok: false, message: 'No active server selected.' };
    const serverId = activeServer.id;
    try {
      const res = await fetch(`${API}/servers/${encodeURIComponent(serverId)}/invites`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails, serverId, serverName: activeServer.name }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      appendMessage({
        id: crypto.randomUUID(),
        kind: 'text',
        author: me,
        text: `✉️ Invited ${emails.length} ${emails.length === 1 ? 'person' : 'people'} to “${activeServer.name}”.`,
        time: now,
      });
      return { ok: true, message: 'Invites sent.' };
    } catch {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const token = btoa(activeServer.name).replace(/=+$/, '').slice(0, 12);
      const link = `${origin}/join/${activeServer.id}?t=${token}`;
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      appendMessage({
        id: crypto.randomUUID(),
        kind: 'text',
        author: me,
        text: `🔗 Couldn’t reach invite API. Share this link instead:\n${link}`,
        time: now,
      });
      return { ok: false, message: 'Invite API unreachable. Fallback link posted in chat.' };
    }
  };

  //Render
  return (
    <div className="h-screen w-full flex overflow-hidden 
     bg-[var(--page-bg)] text-[var(--page-text)]">

      {/* Server / DM rail */}
      <aside
  className="
    w-[64px] shrink-0
    bg-[var(--panel-bg)]
    text-[var(--panel-text)]
    border-r border-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]
    flex flex-col
    sticky top-16
    mt-[64px]      /* FIXED OFFSET */
    h-screen
    overflow-y-auto
  "
>


        <button
        title="Direct Messages"
        onClick={switchToDmHub}
        className={`h-12 w-12 grid place-items-center transition-all ${
        isDmHub
        ? 'rounded-xl bg-[color:var(--rail-active-bg)] text-[color:var(--rail-active-text)]'
        : 'rounded-2xl bg-white/10 hover:bg-white/20'
        }`}
        >
        {/* SEND ICON */}
        <svg
        viewBox="0 0 24 24"
        className="h-6 w-6"
        fill="currentColor"
        >
        <path d="M2 3l20 9-20 9 5-9-5-9z" />
        </svg>
        </button>
        {servers.map((s) => {
          const active = !isDmHub && s.id === activeServerId;
          return (
            <button
              key={s.id}
              title={s.name}
              onClick={() => switchServer(s.id)}
              className={`h-12 w-12 grid place-items-center transition-all ${
              active
              ? 'rounded-xl bg-[color:var(--rail-active-bg)] text-[color:var(--rail-active-text)]'
              : 'rounded-2xl bg-white/10 hover:bg-white/20'
      }`}
            >
              <span className="font-black text-xl">{s.icon ?? s.name.charAt(0).toUpperCase()}</span>
            </button>
          );
        })}
        <button
          onClick={addServer}
          title="Add server"
          className="mt-2 h-12 w-12 rounded-2xl grid place-items-center bg-white/10 hover:bg-white/20 transition"
        >
          <PlusIcon />
        </button>
      </aside>

      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-[var(--panel-bg)] text-[var(--panel-text)] border-r border-[color-mix(in_oklab,var(--panel-text)_10%,transparent)] flex flex-col sticky top-16 h-screen overflow-y-auto">



        <div className="px-4 h-12 relative flex items-center justify-between border-b border-white/10">
          <div className="font-semibold tracking-wide truncate">
            {isDmHub ? 'Direct Messages' : activeServer?.name ?? '—'}
          </div>
          </div>
          {/* Small invites bell (always visible) */}
          <button
            title="My Invites"
            onClick={() => {
              setInvitesOpen(true);
              refreshPendingCount();
            }}
            className="mr-2 p-1 rounded hover:bg-white/10 relative"
          >
            <BellIcon />
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[10px]">
                {pendingCount}
              </span>
            )}
          </button>
          {!isDmHub && (
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1 rounded hover:bg-white/10"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 opacity-80" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          )}
          {menuOpen && !isDmHub && activeServer && (
  <div
    className="
      absolute right-2 top-12 z-50 w-56 rounded-md
      bg-[var(--panel-bg)]
      text-[var(--panel-text)]
      border border-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]
      shadow-xl
    "
    role="menu"
  >
    <button
      className="w-full px-3 py-2 text-left hover:bg-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]"
      onClick={() => {
        setInviteOpen(true);
        setMenuOpen(false);
      }}
    >
      Invite People
    </button>

    <button
      className="w-full px-3 py-2 text-left hover:bg-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]"
      onClick={() => {
        setInvitesOpen(true);
        setMenuOpen(false);
        refreshPendingCount();
      }}
    >
      View My Invites {pendingCount > 0 ? `(${pendingCount})` : ''}
    </button>

    <button className="w-full px-3 py-2 text-left hover:bg-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]">
      Server Settings
    </button>

    <button className="w-full px-3 py-2 text-left hover:bg-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]">
      Create Event
    </button>

    <div className="my-1 h-px bg-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]" />

    <button
      onClick={() => {
        setMenuOpen(false);
        leaveServer(activeServer.id);
      }}
      className="w-full px-3 py-2 text-left text-red-400 hover:bg-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]"
    >
      Leave Server
    </button>
  </div>
)}


        <div className="p-3 space-y-6">
          {isDmHub ? (
            <>
              <div className="px-2">
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-md px-2 py-2">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 opacity-70" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                  <input
                    placeholder="Search"
                    className="bg-transparent outline-none text-sm text-[var(--panel-text)] placeholder:text-[var(--panel-text)] placeholder:opacity-50 flex-1"
                  />
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[var(--panel-text)] opacity-70 px-2 mb-2">
                  Online — {dmThreads.filter((d) => d.user.online).length}
                </div>
                {dmThreads.map((d) => {
                  const active = d.id === activeDmId;
                  return (
                    <button
                      key={d.id}
                      onClick={() => selectDm(d.id)}
                      className={`w-full flex items-center gap-3 px-2 py-2 rounded-md ${
                        active ? 'bg-white/10' : 'hover:bg-white/10'
                      }`}
                    >
                      <span
                        className={`h-7 w-7 rounded-full grid place-items-center text-xs font-semibold ${
                          d.user.online ? 'bg-emerald-500' : 'bg-gray-500'
                        }`}
                      >
                        {d.user.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0 text-left">
                        <div className="font-medium text-sm truncate">{d.user.name}</div>
                        <div className="text-xs text-[var(--panel-text)] opacity-70 truncate">
                          {d.messages[d.messages.length - 1]?.kind === 'text'
                            ? (d.messages[d.messages.length - 1] as TextMessage).text
                            : '[Loop block]'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              
            </>
          ) : (
            <>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[var(--panel-text)] opacity-70 px-2 mb-2">
                  Text Channels
                </div>
                {activeServer?.channels.map((ch) => {
                  const active = ch.id === activeChannelId;
                  return (
                    <button
                      key={ch.id}
                      onClick={() => switchChannel(ch.id)}
                      className={`w-full flex items-center gap-2 px-2 py-2 rounded-md text-[var(--panel-text)] ${
                        active ? 'bg-white/10' : 'hover:bg-white/10'
                      }`}
                  >
  <span className="opacity-70">#</span>
  <span className="font-medium">{ch.name}</span>
</button>

                  );
                })}
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[var(--panel-text)] opacity-70 px-2 mb-2">
                  Voice Channels
                </div>
                <button className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-white/10">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 8v8a3 3 0 003 3h2l4 3V5l-4 3H8a3 3 0 00-3 3z" />
                  </svg>
                  <span className="text-[var(--panel-text)]">General</span>
                </button>
              </div>
              <div className="pt-2">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 text-[var(--panel-text)] opacity-70 hover:opacity-100 transition px-2"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  Home
                </Link>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Main chat + Members rail */}
      <section className="flex-1 flex min-w-0 min-h-0">
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {/* Sticky header (title + pins together) */}
          <div className="sticky top-16 z-30 backdrop-blur">
            <div className="h-12 border-b border-[color-mix(in_oklab,var(--panel-text)_10%,transparent)] bg-[var(--panel-bg)] flex items-center px-4 gap-2">

              <span className="text-[var(--page-text)] opacity-70">{isDmHub ? '@' : '#'}</span>

          <h1 className="font-semibold text-[var(--page-text)]">
            {isDmHub ? activeDm?.user.name ?? '—' : activeChannel?.name ?? '—'}
          </h1>

             <div className="ml-auto text-sm text-[var(--page-text)] opacity-50">
            {isTyping && `${me} is typing…`}
            </div>
            </div>

            {/* Pinned bar */}
            {pinned.length > 0 && (
              <div className="border-b border-black/10 bg-white/90 px-4 py-2 flex items-center gap-3">
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 text-indigo-600"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M14 9l7-7m-7 7l-4 10-2-6-6-2 10-4z" />
                </svg>
                <span className="font-medium">Pinned</span>
                <div className="flex flex-wrap gap-2">
                  {pinned.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => jumpToMessage(p.id)}
                      className="h-7 min-w-[28px] px-2 rounded-full border border-black/10 bg-white hover:bg-black/5 text-sm"
                    >
                      {p.kind === 'text'
                        ? (p as TextMessage).text.slice(0, 18) || 'Message'
                        : (p as LoopMessage).loop.title || 'Loop'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Messages */}
          <div
            className="flex-1 min-h-0 overflow-y-auto px-6 pt-20 pb-4 space-y-6
      bg-[var(--panel-bg)] text-[var(--page-text)]"

            ref={messagesScrollRef}
            style={{ paddingBottom: loopPad ? `${loopPad}px` : undefined }}
          >
            {threadMessages.map((m) => (
              <div
                key={m.id}
                ref={(el) => {
                  msgRefs.current[m.id] = el;
                }}
                className={`rounded-lg ${
                  highlightId === m.id ? 'ring-2 ring-indigo-400 ring-offset-[var(--page-bg)]' : ''
                }`}
              >
                <MessageRow
                  me={me}
                  message={m}
                  onToggleReaction={toggleReaction}
                  onEditStart={startEditText}
                  onEditSave={saveEditText}
                  onEditCancel={cancelEditText}
                  editingTextId={editingTextId}
                  editingText={editingText}
                  setEditingText={setEditingText}
                  onReply={replyWithQuote}
                  onForward={forwardMessage}
                  onDelete={deleteMessage}
                  onPin={togglePin}
                  openReactionFor={openReactionFor}
                  setOpenReactionFor={setOpenReactionFor}
                  optionsOpenFor={optionsOpenFor}
                  setOptionsOpenFor={setOptionsOpenFor}
                />
              </div>
            ))}
            {!threadMessages.length && <div className="text-black/40 text-sm">No messages yet.</div>}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <div className="p-4">
            <div className="relative bg-[var(--panel-bg)] text-[var(--panel-text)] border border-[color-mix(in_oklab,var(--panel-text)_10%,transparent)] rounded-lg flex items-stretch overflow-visible">

              {/* + menu */}
              <div ref={plusRef} className="relative z-10" data-actions-bar>
                <button
                  type="button"
                  onClick={() => setPlusOpen((v) => !v)}
                  title="Create..."
                  className="h-full px-3 border-r border-black/10 hover:bg-black/5"
                >
                  <PlusIcon />
                </button>
                {plusOpen && (
                  <div
                    className="absolute bottom-12 left-0 z-50 w-56 rounded-md border border-black/10 bg-white shadow-md"
                    data-popover
                  >
                    <button
                      type="button"
                      onClick={() => sendQuick('upload')}
                      className="w-full px-3 py-2 text-left hover:bg-black/5 flex items-center gap-2"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 16V4M7 9l5-5 5 5" />
                        <path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" />
                      </svg>
                      Upload a File
                    </button>
                    <button
                      type="button"
                      onClick={() => sendQuick('thread')}
                      className="w-full px-3 py-2 text-left hover:bg-black/5 flex items-center gap-2"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                      </svg>
                      Create Thread
                    </button>
                    <button
                      type="button"
                      onClick={() => sendQuick('poll')}
                      className="w-full px-3 py-2 text-left hover:bg-black/5 flex items-center gap-2"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M6 20V10" />
                        <path d="M12 20V4" />
                        <path d="M18 20v-6" />
                      </svg>
                      Create Poll
                    </button>
                    <button
                      type="button"
                      onClick={() => sendQuick('notes')}
                      className="w-full px-3 py-2 text-left hover:bg-black/5 flex items-center gap-2"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M3 5h18" />
                        <path d="M3 12h18" />
                        <path d="M3 19h18" />
                      </svg>
                      Share Notes
                    </button>
                  </div>
                )}
              </div>

              {/* input */}
              <input
                type="text"
                value={draft}
                onChange={(e) => handleDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') sendMessage();
                }}
                placeholder={
                  isDmHub ? `Message @${activeDm?.user.name ?? ''}` : `Message #${activeChannel?.name ?? ''}`
                }
                className="flex-1 px-3 py-3
                bg-[var(--panel-bg)]
                text-[15px] text-[var(--page-text)]
                placeholder:text-[var(--page-text)] placeholder:opacity-40
                outline-none"
                disabled={isDmHub ? !activeDm : !activeChannel}
              />

              {/* Loop button */}
              <button
              type="button"
              title="Insert Loop"
              onClick={() => setLoopOpen((v) => !v)}
              className="px-3 border-l border-black/10 hover:bg-black/5"
              >
              <span className="
              inline-grid h-6 w-6 place-items-center
              rounded bg-[#0A2EBE] text-white
               text-[12px] font-bold
              ">
              L
              </span>
              </button>


              {/* Send */}
              <button
                type="button"
                onClick={sendMessage}
                className="px-4
    rounded-r-lg
    bg-[color:var(--chat-btn-bg,#ffffff)]
    text-[color:var(--chat-btn-text,#000000)]
    hover:opacity-80
    disabled:opacity-40
    transition

              "
                disabled={(isDmHub ? !activeDm : !activeChannel) || !draft.trim()}
              >
                Send
              </button>

              {/* LOOP PANEL */}
              {loopOpen && (
                <div className="absolute bottom-[56px] left-2 right-2 z-50" ref={loopPanelRef}>
                  <div
                    className="loop-animated-border rounded-xl p-[2px] shadow-[0_10px_30px_rgba(0,0,0,0.12)]"
                    data-popover
                  >
                    <div className="rounded-[10px] bg-[var(--panel-bg)] text-[var(--page-text)]">

                      {/* top bar */}
                      <div className="flex items-center gap-2 px-4 py-3
            border-b border-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]">

                        <div className="flex items-center gap-2">
                          <span className="inline-grid h-6 w-6 place-items-center rounded bg-indigo-600 text-white text-xs font-bold">
                            L
                          </span>
                          <div className="text-sm font-medium">Loop</div>
                          <div className="mx-2 h-4 w-px bg-[color-mix(in_oklab,var(--panel-text)_15%,transparent)]" />

                          <div className="text-xs text-[color-mix(in_oklab,var(--panel-text)_70%,transparent)]">
                          Specific people with the link can edit
                          </div>

                        </div>
                        <div className="ml-auto">
                          <button
                            onClick={() => setLoopOpen(false)}
                            className="p-1 rounded hover:bg-black/5"
                            aria-label="Close"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="h-5 w-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M6 6l12 12M18 6L6 18" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* content */}
                      <div className="px-4 pt-3 pb-4 space-y-4 bg-[var(--panel-bg)] text-[var(--page-text)]">

                        <input
                          value={loopTitle}
                          onChange={(e) => setLoopTitle(e.target.value)}
                          placeholder="Add a title"
                          className="w-full text-[20px] font-semibold outline-none
                          text-[var(--page-text)]
                          placeholder-[color-mix(in_oklab,var(--panel-text)_40%,transparent)]"
                        />

                        <div
                          ref={loopParaRef}
                          contentEditable={activeTool === 'Paragraph'}
                          suppressContentEditableWarning
                          data-placeholder="Share ideas with Loop. Just start typing…"
                          className={`min-h-[28px] outline-none text-[15px] leading-snug ${
                          activeTool === 'Paragraph'
                          ? 'paragraph-hint text-[var(--page-text)]'
                          : 'hidden'
                      }`}
                          onInput={(e) => setLoopBody((e.target as HTMLDivElement).innerText)}
                        />

                        {/* TOOLBAR */}
                        <div className="flex flex-wrap gap-2">
                          {(
                            [
                              'Table',
                              'Bulleted list',
                              'Checklist',
                              'Task list',
                              'Numbered list',
                              'Paragraph',
                            ] as LoopTool[]
                          ).map((t) => (
                            <button
                              key={t}
                              type="button"
                              className={`px-3 py-2 rounded-md border text-sm ${
                                activeTool === t
                                  ? 'border-indigo-300 bg-indigo-50'
                                  : 'border-black/10 hover:bg-black/5'
                              }`}
                              onClick={() => setActiveTool(t)}
                            >
                              {t}
                            </button>
                          ))}
                        </div>

                        {/* Editors */}
                        {activeTool === 'Table' && (
                          <div className="overflow-x-auto">
                            <table className="w-full border-separate border-spacing-0 rounded-lg overflow-hidden">
                              <thead>
                                <tr>
                                  {table[0].map((h, ci) => (
                                    <th
                                      key={ci}
                                      className="bg-[color-mix(in_oklab,var(--panel-text)_5%,transparent)]
                                      text-left px-3 py-2
                                      border border-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]"
                                    >
                                      <input
                                        value={h}
                                        onChange={(e) => {
                                          const next = table.map((r) => [...r]);
                                          next[0][ci] = e.target.value;
                                          setTable(next);
                                        }}
                                        className="w-full bg-transparent outline-none"
                                      />
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {table.slice(1).map((row, ri) => (
                                  <tr key={ri}>
                                    {row.map((cell, ci) => (
                                      <td key={ci} className="px-3 py-2 border border-black/10">
                                        <input
                                          value={cell}
                                          onChange={(e) => {
                                            const next = table.map((r) => [...r]);
                                            next[ri + 1][ci] = e.target.value;
                                            setTable(next);
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
                                  setTable((prev) => [...prev, new Array(prev[0].length).fill('')])
                                }
                              >
                                + Row
                              </button>
                              <button
                                className="px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
                                onClick={() =>
                                  setTable((prev) =>
                                    prev.map((r, i) =>
                                      i === 0 ? [...r, `Column ${r.length + 1}`] : [...r, '']
                                    )
                                  )
                                }
                              >
                                + Column
                              </button>
                            </div>
                          </div>
                        )}

                        {activeTool === 'Bulleted list' && (
                          <div>
                            <ul className="space-y-2">
                              {bulleted.map((it, i) => (
                                <li key={i} className="flex items-center gap-2">
                                  <span>•</span>
                                  <input
                                    value={it}
                                    onChange={(e) =>
                                      setBulleted((p) =>
                                        p.map((v, idx) => (idx === i ? e.target.value : v))
                                      )
                                    }
                                    className="flex-1 bg-transparent outline-none border border-black/10 rounded px-2 py-1"
                                  />
                                  <button
                                    className="text-xs px-2 py-1 border border-black/10 rounded hover:bg-black/5"
                                    onClick={() =>
                                      setBulleted((p) => p.filter((_, idx) => idx !== i))
                                    }
                                  >
                                    Remove
                                  </button>
                                </li>
                              ))}
                            </ul>
                            <button
                              className="mt-3 px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
                              onClick={() => setBulleted((p) => [...p, ''])}
                            >
                              + Add item
                            </button>
                          </div>
                        )}

                        {activeTool === 'Checklist' && (
                          <div>
                            <ul className="space-y-2">
                              {checklist.map((it, i) => (
                                <li key={i} className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={it.done}
                                    onChange={(e) =>
                                      setChecklist((p) =>
                                        p.map((v, idx) =>
                                          idx === i ? { ...v, done: e.target.checked } : v
                                        )
                                      )
                                    }
                                  />
                                  <input
                                    value={it.text}
                                    onChange={(e) =>
                                      setChecklist((p) =>
                                        p.map((v, idx) =>
                                          idx === i ? { ...v, text: e.target.value } : v
                                        )
                                      )
                                    }
                                    className="flex-1 bg-transparent outline-none border border-black/10 rounded px-2 py-1"
                                  />
                                  <button
                                    className="text-xs px-2 py-1 border border-black/10 rounded hover:bg-black/5"
                                    onClick={() =>
                                      setChecklist((p) => p.filter((_, idx) => idx !== i))
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
                                setChecklist((p) => [...p, { text: '', done: false }])
                              }
                            >
                              + Add item
                            </button>
                          </div>
                        )}

                        {activeTool === 'Task list' && (
                          <div className="overflow-x-auto">
                            <table className="w-full border-separate border-spacing-0 rounded-lg overflow-hidden">
                              <thead>
                                <tr>
                                  {['Task', 'Assigned to', 'Due date', 'Bucket'].map((h) => (
                                    <th
                                      key={h}
                                      className="bg-black/5 text-left px-3 py-2 border border-black/10"
                                    >
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {tasks.map((row, i) => (
                                  <tr key={i}>
                                    <td className="px-3 py-2 border border-black/10">
                                      <input
                                        value={row.task}
                                        onChange={(e) =>
                                          setTasks((p) =>
                                            p.map((r, idx) =>
                                              idx === i ? { ...r, task: e.target.value } : r
                                            )
                                          )
                                        }
                                        className="w-full bg-transparent outline-none"
                                      />
                                    </td>
                                    <td className="px-3 py-2 border border-black/10">
                                      <input
                                        value={row.assignee}
                                        onChange={(e) =>
                                          setTasks((p) =>
                                            p.map((r, idx) =>
                                              idx === i ? { ...r, assignee: e.target.value } : r
                                            )
                                          )
                                        }
                                        className="w-full bg-transparent outline-none"
                                      />
                                    </td>
                                    <td className="px-3 py-2 border border-black/10">
                                      <input
                                        type="date"
                                        value={row.due}
                                        onChange={(e) =>
                                          setTasks((p) =>
                                            p.map((r, idx) =>
                                              idx === i ? { ...r, due: e.target.value } : r
                                            )
                                          )
                                        }
                                        className="w-full bg-transparent outline-none"
                                      />
                                    </td>
                                    <td className="px-3 py-2 border border-black/10">
                                      <input
                                        value={row.bucket}
                                        onChange={(e) =>
                                          setTasks((p) =>
                                            p.map((r, idx) =>
                                              idx === i ? { ...r, bucket: e.target.value } : r
                                            )
                                          )
                                        }
                                        className="w-full bg-transparent outline-none"
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div className="flex gap-2 mt-3">
                              <button
                                className="px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
                                onClick={() =>
                                  setTasks((p) => [
                                    ...p,
                                    {
                                      task: 'Task name',
                                      assignee: '',
                                      due: '',
                                      bucket: 'To do',
                                    },
                                  ])
                                }
                              >
                                + Add task
                              </button>
                            </div>
                          </div>
                        )}

                        {activeTool === 'Numbered list' && (
                          <div>
                            <ol className="space-y-2">
                              {numbered.map((it, i) => (
                                <li key={i} className="flex items-center gap-2">
                                  <span className="w-6 text-right">{i + 1}.</span>
                                  <input
                                    value={it}
                                    onChange={(e) =>
                                      setNumbered((p) =>
                                        p.map((v, idx) => (idx === i ? e.target.value : v))
                                      )
                                    }
                                    className="flex-1 bg-transparent outline-none border border-black/10 rounded px-2 py-1"
                                  />
                                  <button
                                    className="text-xs px-2 py-1 border border-black/10 rounded hover:bg-black/5"
                                    onClick={() =>
                                      setNumbered((p) => p.filter((_, idx) => idx !== i))
                                    }
                                  >
                                    Remove
                                  </button>
                                </li>
                              ))}
                            </ol>
                            <button
                              className="mt-3 px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
                              onClick={() => setNumbered((p) => [...p, ''])}
                            >
                              + Add item
                            </button>
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setLoopOpen(false)}
                            className="px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={insertLoopIntoDraft}
                            className="px-4 rounded-r-lg
                            bg-[var(--chat-btn-bg)]
                            text-[var(--chat-btn-text)]
                            hover:opacity-80
                            disabled:opacity-40
                          "
                          >
                            Insert
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Members rail */}
        <MembersRail />
      </section>

      {/* Share Notes Modal */}
      {notesOpen && (
        <NotesModal
          filteredTitles={filteredTitles}
          notesLoading={notesLoading}
          notesError={notesError}
          notesQuery={notesQuery}
          setNotesQuery={setNotesQuery}
          setNotesOpen={setNotesOpen}
          notesSelectedTitle={notesSelectedTitle}
          setNotesSelectedTitle={setNotesSelectedTitle}
          shareSelectedNote={shareSelectedNote}
          activeChannelName={activeChannel?.name ?? 'channel'}
        />
      )}

      {/* Invite People Modal */}
      {inviteOpen && activeServer && (
        <InvitePeopleModal
          serverName={activeServer.name}
          onClose={() => setInviteOpen(false)}
          onSend={handleSendInvites}
        />
      )}

      {/* View My Invites Modal */}
      {invitesOpen && (
        <InvitesModal
          userEmail={getIdentityEmail() || undefined}
          onClose={() => setInvitesOpen(false)}
          onAccepted={async (serverId, serverName) => {
            // removing tombstone if re-joining a previously left server
            setLeftServerIds((prev) => prev.filter((id) => id !== serverId));
            await refreshServersFromBackend(getIdentityEmail(), serverId);
            // channels+messages will hydrate via effects (activeServerId / activeChannelId watchers)
            setInvitesOpen(false);
            setPendingCount(Math.max(0, pendingCount - 1));
            const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            appendMessage({
              id: crypto.randomUUID(),
              kind: 'text',
              author: me,
              text: `✅ Joined “${serverName || serverId}”.`,
              time: now,
            });
          }}
          onDeclined={() => {
            setPendingCount(Math.max(0, pendingCount - 1));
          }}
        />
      )}

      {/* CSS */}
      <style jsx>{`
        @property --angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        .loop-animated-border {
          --angle: 0deg;
          background: conic-gradient(from var(--angle), #3b82f6, #8b5cf6, #9ca3af, #3b82f6);
          animation: spin-angle 6s linear infinite;
        }
        @keyframes spin-angle {
          to {
            --angle: 360deg;
          }
        }
        .paragraph-hint[data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
          white-space: pre-wrap;
        }
      `}</style>
    </div>
  );
}

//Small Components

function MembersRail() {
  const online = demoMembers.filter((m) => m.online);
  const offline = demoMembers.filter((m) => !m.online);
  return (
    <aside className="w-64 shrink-0 bg-[var(--panel-bg)] border-l border-[color-mix(in_oklab,var(--panel-text)_10%,transparent)] text-[var(--panel-text)] flex flex-col sticky top-16 mt-[64px] h-screen overflow-y-auto">

      <div className="px-4 h-12 flex items-center border-b border-black/10 font-medium">Members</div>
      <div className="p-3 space-y-6">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--panel-text)] opacity-70 mb-2">
            Online — {online.length}
          </div>
          <ul className="space-y-2">
            {online.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-2 py-1 rounded-md hover:bg-black/5">
                <span className="h-7 w-7 rounded-full bg-emerald-500 grid place-items-center text-white text-xs font-semibold">
                  {m.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{m.name}</div>
                  {m.role && (
                    <div className="text-xs text-[var(--panel-text)] opacity-70">{m.role}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--panel-text)] opacity-70 mb-2">
            Offline — {offline.length}
          </div>
          <ul className="space-y-2">
            {offline.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-2 py-1 rounded-md hover:bg-black/5">
                <span className="h-7 w-7 rounded-full bg-gray-400 grid place-items-center text-white text-xs font-semibold">
                  {m.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--panel-text)]">{m.name}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}

function NotesModal(props: {
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
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
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
              strokeWidth="2"
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

//Invite People modal
function InvitePeopleModal(props: {
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
          <button onClick={onClose} className="p-1 rounded hover:bg-black/5" aria-label="Close">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
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
              className="flex-1 bg-white border border-black/10 rounded-md px-3 py-2 outline-none"
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

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/* View My Invites modal (no "Signed in as" header text; Accept + Decline inline) */
function InvitesModal(props: {
  userEmail?: string;
  onClose: () => void;
  onAccepted: (serverId: string, serverName?: string) => void | Promise<void>;
  onDeclined?: () => void;
}) {
  const { userEmail, onClose, onAccepted, onDeclined } = props;

  // identity email from props/cookie; allow editing via a toggle
  const [email, setEmail] = useState<string>(userEmail ?? getIdentityEmail() ?? '');
  const [editingEmail, setEditingEmail] = useState<boolean>(false);

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

  // initial load (if we have identity)
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
      res.serverName || res.server?.name || invite.serverName || invite.serverId
    );
  };

  const decline = async (invite: PendingInvite) => {
    const who = email || getIdentityEmail();
    const token = getTokenFromLink(invite.joinLink);
    setDeclining(invite.serverId);
    // Try backend decline if available; otherwise fall back to client-only removal
    let ok = false;
    if (token) {
      const res = await declineInviteToken(token, who);
      ok = res.ok;
    }
    setDeclining(null);
    if (!ok) {
      // still remove locally for now
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
      <div className="w-full max-w-2xl
  bg-[var(--panel-bg)]
  text-[var(--panel-text)]
  rounded-xl shadow-xl
  border border-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]
  overflow-hidden
">
        <div className="px-4 py-3 border-b border-black/10 flex items-center justify-between">
          <div className="font-semibold">My Invites</div>
          {/* Right-aligned controls only (no "Signed in as ..." text) */}
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

        {/* Identity row (only an input when editing) */}
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
          <div className="px-6 pb-6 text-[color-mix(in_oklab,var(--panel-text)_70%,transparent)]">You have no pending invites.</div>
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
              className="px-3 py-2 rounded-md text-sm
  border border-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]
  hover:bg-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]
  text-[var(--panel-text)]"
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

/* Live, inline-editable Loop block for sent messages */
/*  🔥 REMOVED — this function was deleted intentionally
    because LiveLoopBlock now lives in chatUI.tsx          */

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
            <span className="text-xs text-[color-mix(in_oklab,var(--page-text)_85%,transparent)]">{m.time}</span>
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

      {/* Emoji popover */}
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

      {/* Options */}
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
