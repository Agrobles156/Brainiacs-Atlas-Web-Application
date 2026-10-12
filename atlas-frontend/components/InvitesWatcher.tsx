"use client";

import * as React from "react";

type Invite = {
  serverId: string;
  token: string;
  joinLink: string;
  createdAt: string;
  expiresAt: string;
};

export default function InvitesWatcher({ userEmail }: { userEmail?: string }) {
  const [invites, setInvites] = React.useState<Invite[]>([]);
  const [loading, setLoading] = React.useState(false);
  const email =
    userEmail ||
    (typeof window !== "undefined" ? localStorage.getItem("email") || "" : "");

  React.useEffect(() => {
    if (!email) return;
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `/flask-api/invites/pending?email=${encodeURIComponent(email)}`
        );
        const data = await res.json();
        if (!cancelled && data?.ok && Array.isArray(data.invites)) {
          setInvites(data.invites);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // load once on mount and then every 60s while on the page
    load();
    const id = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [email]);

  const accept = async (token: string) => {
    const res = await fetch("/flask-api/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (data?.ok) {
      // Drop the accepted one and optionally refresh server list in your app state
      setInvites((prev) => prev.filter((i) => i.token !== token));
      // If you have a sidebar store, trigger a reload here
      // e.g. serversStore.refresh()
      alert("Joined server: " + (data?.server?.name || data?.server?.id));
    } else {
      alert(data?.error || "Could not accept invite.");
    }
  };

  if (!email || loading || invites.length === 0) return null;

  // very small inline banner; style to taste
  return (
    <div className="fixed bottom-4 right-4 max-w-md rounded-xl border border-gray-700 bg-gray-900/95 text-white shadow-xl p-4 space-y-3">
      <div className="font-semibold">You have {invites.length} invite(s)</div>
      <ul className="space-y-2">
        {invites.map((inv) => (
          <li
            key={inv.token}
            className="flex items-center justify-between gap-3 rounded-lg bg-gray-800 px-3 py-2"
          >
            <div>
              <div className="text-sm">
                Server: <span className="font-mono">{inv.serverId}</span>
              </div>
              <div className="text-xs opacity-75">
                Expires: {new Date(inv.expiresAt).toLocaleString()}
              </div>
            </div>
            <div className="flex gap-2">
              <a
                href={inv.joinLink}
                className="text-xs underline opacity-80 hover:opacity-100"
              >
                Open
              </a>
              <button
                onClick={() => accept(inv.token)}
                className="text-xs rounded-md bg-indigo-600 px-2 py-1 hover:bg-indigo-500"
              >
                Accept
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
