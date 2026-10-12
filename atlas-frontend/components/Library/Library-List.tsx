'use client';
import React, { useState, useMemo } from 'react';

interface Paper {
  _id: string;
  title: string;
  journal?: string;
  year?: string;
  user_notes?: string;
}

interface LibraryListProps {
  library: Paper[];
  onSelect: (paper: Paper) => void;
}

export default function LibraryList({ library, onSelect }: LibraryListProps) {
  const [sortOption, setSortOption] = useState('title-az');

  const sortedLibrary = useMemo(() => {
    return [...library].sort((a, b) => {
      if (sortOption === 'title-az') return a.title.localeCompare(b.title);
      if (sortOption === 'title-za') return b.title.localeCompare(a.title);
      if (sortOption === 'year-newest') return (Number(b.year) || 0) - (Number(a.year) || 0);
      if (sortOption === 'year-oldest') return (Number(a.year) || 0) - (Number(b.year) || 0);
      return 0;
    });
  }, [library, sortOption]);

  return (
    <>
      {/* Header and Sort Menu */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-bold text-[var(--panel-text)]">
          Your Library
        </h2>
        <select
          value={sortOption}
          onChange={(e) => setSortOption(e.target.value)}
          className="border border-[var(--panel-text)] bg-[var(--panel-bg)] text-[var(--panel-text)]
                     rounded-md px-3 py-1 text-sm transition-colors duration-200"
        >
          <option value="title-az">Title A–Z</option>
          <option value="title-za">Title Z–A</option>
          <option value="year-newest">Year Newest → Oldest</option>
          <option value="year-oldest">Year Oldest → Newest</option>
        </select>
      </div>

      {/* Column Headers */}
      <div
        className="grid grid-cols-4 gap-4 px-4 py-2 border-b
                   text-sm font-semibold bg-[var(--panel-bg)] text-[var(--panel-text)]"
      >
        <span>Title</span>
        <span>Journal</span>
        <span>Year</span>
        <span>Notes</span>
      </div>

      {/* Paper Entries */}
      <div className="space-y-2">
        {sortedLibrary.map((paper) => (
          <div
            key={paper._id}
            onClick={() => onSelect(paper)}
            className="grid grid-cols-4 gap-4 px-4 py-2 cursor-pointer border border-transparent
                       rounded-md bg-[var(--panel-bg)] text-[var(--panel-text)]
                       hover:bg-[rgba(255,255,255,0.05)] transition-colors duration-200"
          >
            <div className="font-medium">{paper.title}</div>
            <div className="opacity-80">{paper.journal || '—'}</div>
            <div className="opacity-80">{paper.year || '—'}</div>
            <div className="italic opacity-70">{paper.user_notes || 'No notes'}</div>
          </div>
        ))}
      </div>
    </>
  );
}
