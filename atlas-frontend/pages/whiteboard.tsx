'use client';
import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import "../app/globals.css";
import MainSide from '@/components/Sidebar';
import PaperSidebar from '@/components/Library/Paper-Sidebar';
import WhiteboardCanvas from '@/components/Whiteboard/WhiteboardCanvas';

export default function LibraryPage() {

  const baseUrl = '/flask-api';
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userID, setUserID] = useState('');
  const [userRole, setUserRole] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedPaper, setSelectedPaper] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('details');

  const mapId = searchParams?.get('mapId') || '';
  const legacyUploadId = searchParams?.get('uploadId') || '';

  const fetchUser = async () => {
    try {
      const res = await fetch(`${baseUrl}/whoami`, { credentials: 'include' });
      if (!res.ok) throw new Error('Not authenticated');
      const data = await res.json();
      setUserID(data.message);
      setUserRole(data.role);
      setAuthenticated(true);
    } catch (error) {
      console.error(error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, [router]);

  /// When uploadId is present but there is no mapId, call POST /flask-api/maps/create?user_id=... with {from_upload_id, title}, then
  /// router.replace('/whiteboard?mapId=...')
  /// Essentially takes preestablished maps and updates them to fit the new backend structure (maps now having their own background properties as opposed to pulling from the user's upload collection)
  useEffect(() => {
    const createFromOldMap = async () => {
      if (!authenticated || !userID) return;
      if (!legacyUploadId || mapId) return;

      try {
        const res = await fetch(`${baseUrl}/maps/create?user_id=${encodeURIComponent(userID)}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from_upload_id: legacyUploadId,
            title: 'New Map',
          }),
        }
        );
        if (!res.ok) throw new Error(await res.text());
        const jsonMap = await res.json();
        const newId = jsonMap?.map_id;
        if (!newId) throw new Error('map_id could not be obtained');
        router.replace(`/whiteboard?mapId=${encodeURIComponent(newId)}`);
      } catch (error) {
        console.log(error);
      }
    };
    createFromOldMap();
  }, [authenticated, userID, legacyUploadId, mapId, baseUrl, router]);

  if (loading) return <p className="p-6 text-gray-500">Loading...</p>;
  if (!authenticated) return null;

  return (
    <div className="flex h-screen w-screen bg-[var(--panel-bg)] text-[var(--panel-text)] overflow-hidden">
      {/* Sidebar */}


      {/* Main Content */}
      <div className='flex-1 flex h-full overflow-hidden'>
        <div className={`${selectedPaper ? 'w-2/3' : 'w-full'} flex flex-col h-full p-6 transition-all duration-300`}>
          <div className="flex-1 min-h-0 flex justify-center">
            <div className='flex-1 min-h-0 flex justify-center'>
              <div className='w-full max-w-5xl'>
                {mapId ? (<WhiteboardCanvas userID={userID} mapId={mapId} />) : (
                  <div className='h-full grid place-items-center text-gray-400'>
                    <div className='text-center'>
                      <div className='text-lg font-semibold'>
                        No Map Selected
                      </div>
                      <div className='text-sm opacity-80 mt-1'>
                        {legacyUploadId ? 'Creating Map From Upload' : 'Create a Map from your Uploads.'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}