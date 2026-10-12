'use client';

import { useState, useEffect, Dispatch, SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import SearchBar from './SearchBar';
import GeneralSidebar from '../Sidebar';

interface LayoutProps {
  children: React.ReactNode;
  addedNote: boolean;
  setAdded: Dispatch<SetStateAction<boolean>>;
}

const NotesLayout: React.FC<LayoutProps> = ({ children, addedNote, setAdded }) => {
  const [whoami, setWhoAmI] = useState<string>('');
  const [role, setRole] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const pullWhoAmI = async () => {
      try {
        const response = await fetch(`flask-api/whoami`);
        const data = await response.json();

        if (data.error) {
          console.log(data.error);
          router.push('/');
        } else {
          setWhoAmI(data.message);
          setRole(data.role);
        }
      } catch (err) {
        console.error("Failed to fetch user info");
      }
    };
    pullWhoAmI();
  }, []);

  if (role === null) return <div className="text-[var(--panel-text)] p-4">Loading...</div>;

  return (
    <div className="min-h-screen w-full flex bg-[var(--panel-bg)] text-[var(--panel-text)] transition-colors duration-300">
      
      {/* Sidebar */}
      <div className="flex-shrink-0">
        <GeneralSidebar user={whoami} role={role} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative">
        
        {/* Top Navbar */}
        <div
          className="fixed top-20 left-0 right-0 z-50 flex items-center justify-end
                     py-2 px-4 bg-[var(--panel-bg)] text-[var(--panel-text)] 
                     border-b border-[var(--border-color)] transition-colors duration-300"
        >
          <SearchBar user_id={whoami} addedNote={addedNote} setAdded={setAdded} />
        </div>

        {/* Main Content */}
        <main className="pt-24 mt-20 px-6 pb-6 transition-colors duration-300">
          {children}
        </main>
      </div>
    </div>
  );
};

export default NotesLayout;
