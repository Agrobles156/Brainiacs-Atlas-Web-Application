'use client';

import React, { useEffect, useState } from 'react';

interface RegionInfoProps {
  selectedRegion: string | null;
}

interface UserNote {
  author: string;
  content: string;
  title: string;
}

interface PaperResult {
  reference: string;
  title?: string;
  link?: string;
  snippet?: string;
  error?: string;
  alreadyAdded?: boolean;
}

const RegionInfo: React.FC<RegionInfoProps> = ({ selectedRegion }) => {
  const [regionName, setRegionName] = useState<string | null>(null);
  const [endnote, setEndnote] = useState<string | null>(null);
  const [papers, setPapers] = useState<PaperResult[]>([]);
  const [userNotes, setUserNotes] = useState<UserNote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userID, setUserID] = useState<string | null>(null);
  const [libraryMessages, setLibraryMessages] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'ref' | 'notes'>('ref');

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/flask-api/whoami', { credentials: 'include' });
        const data = await res.json();
        if (data?.message) setUserID(data.message);
      } catch {
        console.error('Failed to fetch user ID');
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    if (!selectedRegion) return;

    const fetchRegionDetails = async () => {
      try {
        const res = await fetch(`/flask-api/get_endnote?abbr=${encodeURIComponent(selectedRegion)}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setRegionName(data.names?.join(', ') || '');
        setEndnote(data.endnotes?.join('\n') || '');
        setError(null);
      } catch (err: any) {
        setError(err.message);
        setRegionName(null);
        setEndnote(null);
        setPapers([]);
      }
    };

    fetchRegionDetails();
  }, [selectedRegion]);

  useEffect(() => {
    if (!selectedRegion || !userID) return;

    const fetchPapers = async () => {
      try {
        const res = await fetch(`/flask-api/region-papers-by-abbr/${encodeURIComponent(selectedRegion)}?user_id=${userID}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setPapers(data.papers || []);
      } catch (err: any) {
        setError(err.message);
        setPapers([]);
      }
    };

    const fetchNotes = async () => {
      try {
        const res = await fetch('/flask-api/find-public-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ region: selectedRegion })
        });
        const data = await res.json();
        setUserNotes(data?.message || []);
      } catch {
        setUserNotes([]);
      }
    };

    fetchPapers();
    fetchNotes();
  }, [selectedRegion, userID]);

  const handleAddToLibrary = async (paper: PaperResult) => {
    if (!userID || !paper.title || !paper.link) {
      setLibraryMessages(prev => ({ ...prev, [paper.reference]: '⚠️ Missing data.' }));
      return;
    }
    try {
      const res = await fetch('/flask-api/library/add-region-paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          user_id: userID,
          title: paper.title,
          link: paper.link,
          reference: paper.reference
        })
      });
      const data = await res.json();
      setLibraryMessages(prev => ({ ...prev, [paper.reference]: res.ok ? data.message : `❌ ${data.error}` }));
      if (res.ok) {
        setPapers(prev => prev.map(p => p.reference === paper.reference ? { ...p, alreadyAdded: true } : p));
      }
    } catch {
      setLibraryMessages(prev => ({ ...prev, [paper.reference]: '⚠️ Server error.' }));
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <p className="text-lg font-semibold pt-2">Selected Region Info</p>
      <p>Region Abbreviation: {selectedRegion}</p>
      <p>Region Name: {regionName || ''}</p>

      <p className="font-semibold mt-4">Swanson Notes:</p>
      <div className="pl-2">
        <p>{endnote ? `${endnote.split(' ').slice(0, 10).join(' ')}...` : 'Select a Region'}</p>
      </div>

      <div className="flex border-b border-gray-500 text-center mt-2">
        <button
          onClick={() => setActiveTab('ref')}
          className={`px-3 py-1 -mb-px font-semibold border-b-2 ${activeTab === 'ref' ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-black'}`}>Ref Papers</button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`px-3 py-1 -mb-px font-semibold border-b-2 ${activeTab === 'notes' ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-black'}`}>User Notes</button>
      </div>

      <div className="mt-1">
        {activeTab === 'ref' && (
          papers.length > 0 ? papers.map((paper, idx) => (
            <div key={idx} className="border border-black rounded bg-gray-100 mb-2 p-2 max-h-64 overflow-y-auto">
              <p className="font-semibold text-black">{paper.reference}</p>
              {paper.title && paper.link ? (
                <a href={paper.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                  {paper.title.split(' ').slice(0, 5).join(' ')}...
                </a>
              ) : (
                <p className="italic text-black">No paper found</p>
              )}
              {paper.snippet && <p className="text-sm text-black-100">{paper.snippet.split(' ').slice(0, 25).join(' ')}</p>}
              {paper.error && <p className="text-red-500">{paper.error}</p>}
              {paper.title && paper.link && (
                <>
                  {paper.alreadyAdded ? (
                    <p className="text-green-600 text-sm mt-1">✅ Already in Library</p>
                  ) : (
                    <button
                      onClick={() => handleAddToLibrary(paper)}
                      className="mt-1 px-3 py-1 text-sm bg-green-600 text-white rounded">
                      Add to Library
                    </button>
                  )}
                  {libraryMessages[paper.reference] && <p className="text-sm text-blue-500 mt-1">{libraryMessages[paper.reference]}</p>}
                </>
              )}
            </div>
          )) : <p>Select a Region</p>
        )}

        {activeTab === 'notes' && (
          userNotes.length > 0 ? userNotes.map((note, idx) => (
            <div key={idx} className="border border-black rounded bg-gray-100 mb-2 p-2 max-h-48 overflow-y-auto">
              <p className="font-semibold text-black">Title: {note.title}</p>
              <p className="font-semibold text-black">Author: {note.author}</p>
              <p className="text-gray-600">{note.content}</p>
            </div>
          )) : <p>No Public User Notes for Region</p>
        )}
      </div>

      {error && <p className="text-red-600 mt-4">Error: {error}</p>}
    </div>
  );
};

export default RegionInfo;