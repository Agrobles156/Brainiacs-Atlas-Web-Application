// app/chat/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import GeneralSidebar from '@/components/Sidebar';

const ChatRoot = dynamic(() => import('@/components/Chat/ChatRoot'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full p-8 text-gray-400">
      Loading chat…
    </div>
  ),
});

const API = '/flask-api';

async function fetchWhoAmI(): Promise<string> {
  try {
    const res = await fetch(`${API}/whoami`, { credentials: 'include' });
    const data = await res.json();
    return (data?.message ?? '').toString().trim() || 'anonymous';
  } catch {
    return 'anonymous';
  }
}

function setWhoamiCookie(name: string) {
  try {
    if (!name || typeof document === 'undefined') return;
    document.cookie = `whoami=${encodeURIComponent(name)}; path=/; SameSite=Lax;`;
  } catch {
    // ignore
  }
}

export default function ChatPage() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await fetchWhoAmI();
      if (!cancelled) {
        setUserId(id);
        setWhoamiCookie(id || 'anonymous');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const role = userId && userId !== 'anonymous' ? 'user' : 'not user';

  return (
    <div className="min-h-0 flex-1 bg-[var(--page-bg,#020617)] text-[var(--page-text,#0b1220)]">
      {/* Top nav / global shell */}
      <GeneralSidebar user={userId ?? null} role={role} />

      {/* Chat area under the fixed nav, with dark-theme support */}
      <div className="w-full flex overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
        <ChatRoot />
      </div>
    </div>
  );
}
