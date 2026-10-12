// app/saved-collections/Saved-Collections.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
// (Optional) remove if unused:
// import { Transition } from '@headlessui/react';
// import { Menu, Folder } from 'lucide-react';
import CollSide from '../User-Collection/Sidebar-Collection';

interface Notes {
  _id: string;
  title: string;
  content: string;
  region?: string;
}

interface CollectionItem {
  name: string;
  notes: Notes[];
  last_updated: Date;
}

interface LayoutProps {
  children: React.ReactNode;
}

const SavedCollection: React.FC<LayoutProps> = ({ children }) => {
  const baseUrl = `/flask-api`;
  const router = useRouter();

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [collectionName, setCollectionName] = useState('');
  const [collection, setCollection] = useState<CollectionItem[]>([]);
  const [openCollection, setOpenCollection] = useState<Set<string>>(new Set());
  const [hoveredCollection, setHoveredCollection] = useState<string | null>(null);

  const [whoami, setWhoAmI] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  useEffect(() => {
    const pullWhoAmI = async () => {
      try {
        const response = await fetch(`${baseUrl}/whoami`, {
          method: 'GET',
          credentials: 'include',
        });
        const data = await response.json();

        if (data.error) {
          console.log(data.error);
          router.push('/');
        } else {
          setWhoAmI(data.message);
          setRole(data.role);
        }
      } catch {
        console.error("didn't even get data");
        router.push('/');
      }
    };
    pullWhoAmI();
  }, [router]);

  useEffect(() => {
    fetchCollection();
  }, []);

  // CREATE a new collection
  const createNewCollection = async (name: string) => {
    try {
      if (!name.trim()) return;

      const response = await fetch(`${baseUrl}/collections`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        // Backend accepts either "name" or "collectionName"; we send "name"
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!response.ok) {
        console.log('Failed to create collection');
        return;
      }

      await response.json();
      setCollection((prev) => [...prev, { name: name.trim(), notes: [], last_updated: new Date() }]);
      setCollectionName('');
      fetchCollection();
    } catch (e) {
      console.error('Error creating collection:', e);
    }
  };

  // FETCH all collections
  const fetchCollection = async () => {
    try {
      const response = await fetch(`${baseUrl}/collections`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        console.log('Failed to fetch collection of notes.');
        return;
      }

      const data = await response.json();

      // Be resilient to either shape:
      // 1) { collections: [{ name, notes, last_updated }, ...] }
      // 2) { collection: { [name]: { notes, last_updated } } }
      let list: CollectionItem[] = [];

      if (Array.isArray(data.collections)) {
        list = data.collections.map((c: any) => ({
          name: c.name,
          notes: (c.notes || []) as Notes[],
          last_updated: c.last_updated ? new Date(c.last_updated) : new Date(),
        }));
      } else if (data.collection && typeof data.collection === 'object') {
        list = Object.entries(data.collection).map(([name, obj]: any) => ({
          name,
          notes: (obj.notes || []) as Notes[],
          last_updated: obj.last_updated ? new Date(obj.last_updated) : new Date(),
        }));
      }

      setCollection(list);
      console.log('Collection', list);
    } catch (e) {
      console.error('Error fetching collection:', e);
    }
  };

  // DELETE a collection
  const deleteCollection = async (name: string) => {
    const confirmation = window.confirm('Are you sure you want to delete this collection?');
    if (!confirmation) return;

    try {
      const response = await fetch(`${baseUrl}/collections/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        console.log(`Failed to delete ${name}`);
      }
      await response.json();
      fetchCollection();
    } catch (e) {
      console.error('Error deleting collection:', e);
    }
  };

  // REMOVE a note from a collection
  const removeNote = async (noteID: string, name: string) => {
    try {
      const response = await fetch(`${baseUrl}/collections/${encodeURIComponent(name)}/remove`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteID }),
      });

      if (!response.ok) {
        console.log(`Failed to remove note from ${name}`);
        return false;
      }

      setCollection((prev) =>
        prev.map((col) => (col.name === name ? { ...col, notes: col.notes.filter((n) => n._id !== noteID) } : col)),
      );
      return true;
    } catch (e) {
      console.error('Error removing note:', e);
      return false;
    }
  };

  // Toggle open/close a collection row
  const toggleOpen = (name: string) => {
    setOpenCollection((prev) => {
      const selected = new Set(prev);
      selected.has(name) ? selected.delete(name) : selected.add(name);
      return selected;
    });
  };

  return (
    <div className="h-screen w-screen overflow-y-auto bg-gray-100 flex flex-col">
      <div className="flex">
        <div>
          <CollSide user={whoami} role={role} />
        </div>
      </div>

      <div className="flex-1 ml-56">
        <div className="py-2 px-6">
          <div className="p-4 mt-2 flex items-center justify-end">
            <input
              type="text"
              placeholder="Collection Name"
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              className="border border-gray-300 rounded-md focus:outline-none focus:border-blue-400 p-2 mr-2"
            />
            <button
              onClick={() => createNewCollection(collectionName)}
              className="bg-white border px-4 py-2 mr-2 rounded hover:bg-gray-200"
            >
              Create Collection
            </button>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-300 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-6 py-4 text-left font-medium tracking-wider">Collection Name</th>
                  <th className="px-6 py-4 text-left font-medium tracking-wider">Date Modified</th>
                  <th className="px-6 py-4 text-left font-medium tracking-wider">Size</th>
                </tr>
              </thead>
              <tbody>
                {collection.length > 0 ? (
                  collection.map((col) => (
                    <React.Fragment key={col.name}>
                      <tr
                        className="hover:bg-gray-100"
                        onMouseEnter={() => setHoveredCollection(col.name)}
                        onMouseLeave={() => setHoveredCollection(null)}
                      >
                        <td className="px-6 py-4 whitespace-wrap text-sm font-medium text-gray-800">
                          {col.name}
                          {hoveredCollection === col.name && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => toggleOpen(col.name)}
                                className="text-gray-500 hover:text-blue-500 text-sm"
                              >
                                {openCollection.has(col.name) ? 'Close' : 'Open'}
                              </button>
                              <button
                                onClick={() => deleteCollection(col.name)}
                                className="text-gray-500 hover:text-red-500 text-sm"
                              >
                                Delete Collection
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-wrap text-sm font-medium text-gray-800">
                          {col.last_updated ? new Date(col.last_updated).toLocaleString() : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-wrap text-sm font-medium text-gray-800">
                          {col.notes.length} note{col.notes.length !== 1 ? 's' : ''}
                        </td>
                      </tr>

                      {openCollection.has(col.name) &&
                        col.notes.map((note) => (
                          <tr key={note._id} className="bg-green-100">
                            <td colSpan={3} className="px-4 py-3.5 text-sm">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p>{note.title}</p>
                                  <p>{note.content}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </React.Fragment>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-4 text-left text-gray-500">No collections found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SavedCollection;
