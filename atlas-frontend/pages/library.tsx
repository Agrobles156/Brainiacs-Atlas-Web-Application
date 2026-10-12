'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import "../app/globals.css";
import UploadForm from '@/components/Library/Upload-Form';
import LibraryList from '@/components/Library/Library-List';
import PaperSidebar from '@/components/Library/Paper-Sidebar';
import GeneralSidebar from '@/components/Sidebar';

export default function LibraryPage() {
  const baseUrl = 'flask-api';
  const router = useRouter();
  const [userID, setUserID] = useState('');
  const [userRole, setUserRole] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [library, setLibrary] = useState([]);
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [activeTab, setActiveTab] = useState('details');

  const fetchUser = async () => {
    try {
      const res = await fetch(`${baseUrl}/whoami`, { credentials: 'include' });
      if (!res.ok) throw new Error('Not authenticated');
      const data = await res.json();
      setUserID(data.message);
      setUserRole(data.role);
      setAuthenticated(true);
    } catch (err) {
      console.error(err);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    if (authenticated && userID) fetchLibrary();
  }, [authenticated, userID]);

  const fetchLibrary = async () => {
    try {
      const res = await fetch(`${baseUrl}/library?user_id=${userID}`);
      const data = await res.json();
      setLibrary(data);
    } catch (err) {
      console.error('Failed to fetch library:', err);
    }
  };

  if (loading) return <p className="p-6 text-[var(--panel-text)] opacity-70">Loading...</p>;
  if (!authenticated) return null;

  return (
    <div className="flex h-screen w-screen bg-[var(--panel-bg)] text-[var(--panel-text)] transition-colors duration-300">
      {/* Sidebar / Navbar */}
      <GeneralSidebar user={userID} role={userRole} onLogoutSuccess={fetchUser} />

      {/* Main Content */}
      <div className="flex flex-col w-full h-full">
        <div className="flex-1 p-6 pt-28 overflow-y-auto border-r transition-colors duration-300
                        bg-[var(--panel-bg)] border-[var(--border-color)]">
          {/* Library & Upload Section */}
          <UploadForm userID={userID} onUploadComplete={fetchLibrary} />
          <LibraryList library={library} onSelect={setSelectedPaper} />
        </div>

        {/* Paper Details Sidebar */}
        {selectedPaper && (
          <div className="w-1/3 absolute right-0 top-28 bottom-0 border-l transition-colors duration-300
                          border-[var(--border-color)] bg-[var(--panel-bg)] text-[var(--panel-text)]">
            <PaperSidebar
              paper={selectedPaper}
              setPaper={setSelectedPaper}
              userID={userID}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              fetchLibrary={fetchLibrary}
            />
          </div>
        )}
      </div>
    </div>
  );
}