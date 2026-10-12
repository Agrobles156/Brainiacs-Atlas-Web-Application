'use client';

import { useEffect, useState } from 'react';

interface HydrationSafeLayoutProps {
  children: React.ReactNode;
}

export default function HydrationSafeLayout({ children }: HydrationSafeLayoutProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    <div suppressHydrationWarning={true}>
      {isClient ? children : null}
    </div>
  );
}
