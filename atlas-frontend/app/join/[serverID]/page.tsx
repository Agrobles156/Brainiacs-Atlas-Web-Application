'use client';

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

type AcceptResp =
  | { ok: true; alreadyAccepted?: boolean; server?: { _id: string; name?: string; members?: string[] } }
  | { ok: false; error: string };

const API_PREFIX = '/flask-api';

export default function JoinServerPage() {
  
  const rawParams = useParams() as Record<string, string | string[] | undefined>;
  const serverId = typeof rawParams?.serverId === 'string' ? rawParams.serverId : '';
  const search = useSearchParams(); // can be null in types
  const router = useRouter();

  const [stage, setStage] = React.useState<'idle' | 'accepting' | 'ok' | 'already' | 'error'>('idle');
  const [msg, setMsg] = React.useState<string>('');
  const [serverName, setServerName] = React.useState<string>(serverId);

  React.useEffect(() => {
    const token = search?.get('t') ?? search?.get('token');

    if (!serverId) {
      setStage('error');
      setMsg('Missing server id in URL.');
      return;
    }
    if (!token) {
      setStage('error');
      setMsg('Missing invite token in URL.');
      return;
    }

    setStage('accepting');

    (async () => {
      try {
        const res = await fetch(`${API_PREFIX}/invites/accept`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data: AcceptResp = await res.json().catch(() => ({ ok: false, error: 'Invalid response' } as any));

        if ('ok' in data && data.ok) {
          const name = data.server?.name || serverId;
          setServerName(name);

          try {
            const key = 'joinedServers';
            const prev = JSON.parse(localStorage.getItem(key) || '[]') as string[];
            if (!prev.includes(serverId)) localStorage.setItem(key, JSON.stringify([...prev, serverId]));
          } catch {}

          setStage(data.alreadyAccepted ? 'already' : 'ok');
          setMsg(data.alreadyAccepted ? 'You already joined this server.' : 'You joined the server!');
        } else {
          setStage('error');
          setMsg((data as any)?.error || 'Invite could not be accepted.');
        }
      } catch (e: any) {
        setStage('error');
        setMsg(e?.message || 'Network error while accepting invite.');
      }
    })();
  }, [serverId, search]);

  const goHome = () => router.push('/');
  const goToChat = () => router.push('/chat');

  return (
    <main className="min-h-screen w-full bg-[#0f172a] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl bg-white/5 border border-white/10 p-6 shadow-xl">
        <h1 className="text-2xl font-semibold mb-2">Join “{serverName || 'server'}”</h1>

        {stage === 'accepting' && <div className="mt-3 text-white/80">Working on your invite…</div>}
        {stage === 'ok' && <div className="mt-3 text-emerald-300">✅ {msg}</div>}
        {stage === 'already' && <div className="mt-3 text-amber-300">ℹ️ {msg}</div>}
        {stage === 'error' && <div className="mt-3 text-red-300">❌ {msg}</div>}

        <div className="mt-6 flex gap-2">
          <button onClick={goHome} className="px-4 py-2 rounded-md border border-white/15 bg-white/5 hover:bg-white/10">
            Home
          </button>
          <button onClick={goToChat} className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700">
            Open Chat
          </button>
        </div>

        <p className="mt-4 text-xs text-white/50">
          This page reads <code>serverId</code> from the URL and expects <code>?t=…</code>, then POSTs to
          <code className="mx-1">/flask-api/invites/accept</code>.
        </p>
      </div>
    </main>
  );
}
