'use client';

import React from 'react';

type Invite = {
  serverId: string;
  email: string;
  invitedBy?: string;
  joinLink: string;
};

export default function InvitesPage() {
  const [invites, setInvites] = React.useState<Invite[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const load = async () => {
      try {

        const r = await fetch('/flask-api/invites/pending', { credentials: 'include' });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || 'Failed to load invites');
        setInvites(j.invites || []);
      } catch (e: any) {
        setError(e.message || 'Failed to load invites');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <div className="p-6">Loading invites…</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Your Invites</h1>
      {invites.length === 0 ? (
        <div>No pending invites.</div>
      ) : (
        <ul className="space-y-3">
          {invites.map((inv, i) => (
            <li key={i} className="border rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">Server: {inv.serverId}</div>
                <div className="text-sm text-gray-500">Invited as: {inv.email}</div>
              </div>
              <a
                href={inv.joinLink}
                className="px-4 py-2 rounded-lg border hover:bg-gray-50"
              >
                Open Invite
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
