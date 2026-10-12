'use client';

import React, { Dispatch, SetStateAction, useState } from 'react';
import { useRouter } from 'next/navigation';
import AddNotePopup from './Add-Note-Popup';

interface Note {
    _id: string;
    title: string;
    content: string;
    region?: string;
}

interface SearchNotesProps {
    user_id: string;
    addedNote: boolean;
    setAdded: Dispatch<SetStateAction<boolean>>;
}

export default function SearchBar({ user_id, addedNote, setAdded }: SearchNotesProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const router = useRouter();
    const [showModal, setShowModal] = useState(false);
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const search_notes = (e: React.FormEvent) => {
        e.preventDefault();
        // Implement your search functionality here
    }

    return (
        <div className="inline-flex items-center gap-2">
            <form onSubmit={search_notes} className="flex items-center gap-2">
                <input 
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search Notes..."
                    className="border border-[var(--border-color)] rounded-md px-4 py-2
                               bg-[var(--input-bg)] text-[var(--panel-text)]
                               placeholder-[var(--placeholder-text)]
                               focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]
                               transition-colors duration-300"
                />
                <button
                    type="submit"
                    className="px-4 py-2 rounded-md border border-[var(--border-color)]
                            bg-[var(--panel-bg)] hover:bg-[var(--panel-bg-alt)]
                            text-[var(--panel-text)]
                            transition-colors duration-300"
                >
                    Search
                </button>

            </form>

            <button
                onClick={() => setShowModal(true)}
                className="px-4 py-2 rounded-md border border-[var(--border-color)]
                           bg-[var(--button-bg)] text-[var(--button-text)]
                           hover:bg-[var(--button-hover)] transition-colors duration-300"
            >
                Add New
            </button>

            {showModal && (
                <AddNotePopup
                    isOpen={showModal}
                    onClose={() => setShowModal(false)}
                    userID={user_id}
                    addedNote={addedNote}
                    setAdded={setAdded}
                />
            )}
        </div>
    )
}
