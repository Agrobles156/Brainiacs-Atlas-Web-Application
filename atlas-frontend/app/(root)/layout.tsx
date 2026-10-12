'use client';

import { usePathname } from 'next/navigation';
import Navbar from '@/components/Navbar';
import ThemeWrapper from '@/components/ThemeWrapper'; // ← import your ThemeWrapper
import React from 'react';

export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname() || '/';

  // Pages that should NOT show the navbar
  const noNavBar = [
    '/atlas',
    '/login',
    '/register',
    '/admin',
    '/notes',
    '/collections',
    '/create',
    '/maps',
    '/chat',
    '/settings',
    '/',
  ];

  return (
    <ThemeWrapper> {/* ← wrap everything in ThemeWrapper */}
      <main className="flex flex-col h-screen font-work-sans relative transition-colors duration-300">
        {!noNavBar.includes(pathname) && <Navbar />}
        <div className="flex-1 min-h-0">{children}</div>
      </main>
    </ThemeWrapper>
  );
}
