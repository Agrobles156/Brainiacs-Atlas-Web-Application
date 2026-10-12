'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import LandingPage from '@/components/Main-Dash/Landing-Page';

export default function Home() {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const pullWhoAmI = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || ''}/flask-api/whoami`, { credentials: 'include' });
        const data = await response.json();
        if (!data?.error) setRole(data.role ?? null);
      } catch {
        setRole(null);
      }
    };
    pullWhoAmI();
  }, []);

  const isAuthed = Boolean(role);

  return (
    <div className="h-full flex flex-col justify-between">
      <LandingPage />
    </div>
  );
}
