'use client';

import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react';
import "../app/globals.css";
import GeneralSidebar from '@/components/Sidebar';

interface Article {
  uid?: string;
  title?: string;
  authors?: { name: string }[];
  fulljournalname?: string;
  pubdate?: string;
  sortpubdate?: string;
  source?: string;
  abstract?: string;
  alreadyAdded?: boolean;
  [key: string]: any;
}

export const formatDate = (dateStr: string | number | Date) => {
  if (!dateStr) return 'No date available';
  const date = new Date(dateStr);
  const options = { year: 'numeric', month: 'short', day: 'numeric' } as const;
  return date.toLocaleDateString('en-US', options);
};

export default function SearchResults() {
  const router = useRouter();
  const { query, db } = router.query;
  const [results, setResults] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<null | Error>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [userID, setUserID] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [libraryMessages, setLibraryMessages] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedDatabase, setSelectedDatabase] = useState("pubmed");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [mode, setMode] = useState("semantic");

  const [whoami, setWhoami] = useState<string>('');

  // Fetch user info
  useEffect(() => {
    fetch("/flask-api/whoami")
      .then(res => res.json())
      .then(data => {
        setUserID(data?.message || null);
        if (data?.role) setRole(data.role);
        else setRole("not user");
      })
      .catch(() => setRole("not user"));
  }, []);

  const formatDateForNCBI = (dateStr: string) => {
    return new Date(dateStr).toISOString().split('T')[0].replace(/-/g, '/');
  };

  // Fetch search results
  useEffect(() => {
    if (!query || !db) return;

    const fetchResults = async () => {
      setLoading(true);
      try {
        const baseUrl = "flask-api/search";
        const params = new URLSearchParams({
          query: query as string,
          db: db as string,
          page: currentPage.toString(),
          mode,
        });
        if (startDate) params.append("start_date", formatDateForNCBI(startDate));
        if (endDate) params.append("end_date", formatDateForNCBI(endDate));

        const response = await fetch(`${baseUrl}?${params.toString()}`);
        const data = await response.json();

        let fetchedResults: any[] = Array.isArray(data.results)
          ? data.results
          : Object.values(data.results?.result || {}).filter((v: any) => typeof v === "object" && v.title);

        // Track already added
        const alreadyAddedMessages: Record<string, string> = {};
        fetchedResults.forEach((article: any) => {
          if (article.alreadyAdded) {
            alreadyAddedMessages[article.uid] = "✅ Already in Library";
          }
        });
        setLibraryMessages(alreadyAddedMessages);

        if (startDate && endDate) {
          const start = new Date(startDate);
          const end = new Date(endDate);
          end.setDate(end.getDate() + 1);

          fetchedResults = fetchedResults.filter((item: any) => {
            const itemDate = new Date(item.sortpubdate || item.pubdate || "1000-01-01");
            return itemDate >= start && itemDate < end;
          });
        }

        setTotalPages(data.pagination?.total_pages || 1);
        setResults(fetchedResults);
      } catch (err) {
        console.error(`Error fetching results from ${db}:`, err);
        if (err instanceof Error) setError(err);
      } finally {
        setLoading(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    };

    fetchResults();
  }, [query, db, startDate, endDate, currentPage]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  // Add article to library
  const handleAddToLibrary = async (article: any, source: 'pubmed' | 'pmc') => {
    if (!userID || !article.title || !article.uid) {
      setLibraryMessages(prev => ({ ...prev, [article.uid]: "⚠️ Missing user or article data." }));
      return;
    }

    try {
      const res = await fetch('/flask-api/library/add-pubmed-paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          user_id: userID,
          title: article.title,
          source,
          uid: article.uid,
          authors: article.authors?.map((a: any) => a.name) || [],
          journal: article.fulljournalname || '',
          year: article.pubdate || article.epubdate || article.sortpubdate || '',
          abstract: article.abstract || ''
        })
      });
      const data = await res.json();
      setLibraryMessages(prev => ({ ...prev, [article.uid]: data.message || '✅ Added to library' }));

      if (res.ok) {
        setResults(prev =>
          prev.map(a => a.uid === article.uid ? { ...a, alreadyAdded: true } : a)
        );
      }
    } catch {
      setLibraryMessages(prev => ({ ...prev, [article.uid]: '⚠️ Server error' }));
    }
  };

  if (role === null) return <div className="text-[var(--panel-text)] p-4">Loading sidebar...</div>;

  return (
    <div className="flex h-screen w-screen bg-[var(--panel-bg)] text-[var(--panel-text)] transition-colors duration-300">
      <GeneralSidebar user={whoami} role={role} />
      <div className="flex-1 p-6 overflow-y-auto">
        <h1 className="text-4xl font-bold mb-4 text-[var(--panel-text)]">Search Results for: {query}</h1>

        {/* Filters */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const params = new URLSearchParams({
              query: searchQuery,
              db: selectedDatabase,
              mode,
              start_date: startDate,
              end_date: endDate,
            });
            router.push(`/search-results?${params.toString()}`);
          }}
          className="flex flex-wrap items-end gap-3 p-4 rounded-md shadow-md bg-[var(--panel-bg-alt)]"
        >
          {/* Query */}
          <div className="flex-grow min-w-[250px]">
            <label htmlFor="query" className="block text-sm font-semibold mb-1">Search Query</label>
            <input
              type="text"
              id="query"
              value={searchQuery}
              onChange={handleInputChange}
              placeholder="e.g. rat brain cell"
              className="w-full px-3 py-2 rounded-md border border-[var(--border-color)] bg-[var(--input-bg)] text-[var(--panel-text)] placeholder-[var(--placeholder-text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
            />
          </div>

          {/* Database */}
        {/* Database */}
        <div className="min-w-[130px]">
        <label htmlFor="db" className="block text-sm font-semibold mb-1 text-[var(--panel-text)]">Database</label>
        <select
            id="db"
            value={selectedDatabase}
            onChange={(e) => setSelectedDatabase(e.target.value)}
            className="w-full rounded-md px-2 py-2 border border-[var(--border-color)] bg-[var(--panel-bg)] text-[var(--panel-text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
        >
            <option value="pubmed">PubMed</option>
            <option value="pmc">PMC</option>
        </select>
        </div>

        {/* Mode */}
        <div className="min-w-[150px]">
        <label htmlFor="rankingMode" className="block text-sm font-semibold mb-1 text-[var(--panel-text)]">Ranking Mode</label>
        <select
            id="rankingMode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="w-full rounded-md px-2 py-2 border border-[var(--border-color)] bg-[var(--panel-bg)] text-[var(--panel-text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
        >
            <option value="hybrid">Hybrid (Best Match)</option>
            <option value="semantic">Semantic</option>
            <option value="bm25">BM25</option>
        </select>
        </div>

          {/* Dates */}
          <div className="min-w-[250px]">
            <label className="block text-sm font-semibold mb-1">Date Range</label>
            <div className="flex space-x-2">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="flex-1 rounded-md px-2 py-2 border border-[var(--border-color)] bg-[var(--input-bg)] text-[var(--panel-text)]" />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="flex-1 rounded-md px-2 py-2 border border-[var(--border-color)] bg-[var(--input-bg)] text-[var(--panel-text)]" />
            </div>
          </div>

          {/* Submit */}
          <div>
            <button
              type="submit"
              className="px-4 py-2 rounded-md border border-[var(--border-color)]
                        bg-[var(--panel-bg)] hover:bg-[var(--panel-bg-alt)]
                        text-[var(--panel-text)]
                        transition-colors duration-300"
          >
              Search
          </button>

          </div>
        </form>

        {/* Results */}
        <div className="mt-6 space-y-4">
        {loading && <p>Loading...</p>}
        {error && <p>Error: {error.message}</p>}
        {results.length === 0 && !loading && <p>No results found.</p>}
        {results.map((article, index) => (
            <div
            key={index}
            className="p-4 border border-[var(--border-color)] rounded-md shadow-sm hover:shadow-md transition bg-[var(--panel-bg-alt)] flex justify-between items-start"
            >
            {/* Left side: article info */}
            <div className="flex-1">
                <h2 className="text-xl font-semibold mb-2">{article.title}</h2>
                <p><strong>Authors:</strong> {article.authors?.map(a => a.name).slice(0, 2).join(', ') || 'No authors listed'}</p>
                <p><strong>Journal:</strong> {article.fulljournalname || article.source || '—'}</p>
                <p><strong>Date:</strong> {formatDate(article.pubdate || article.sortpubdate)}</p>
                <a
                href={`https://pubmed.ncbi.nlm.nih.gov/${article.articleids?.find((id: any) => id.idtype === 'pmid')?.value || article.uid}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent-color)] hover:underline"
                >
                Read Article
                </a>
            </div>

            {/* Right side: Add to Library button */}
            {userID && (
                <div className="ml-4 flex flex-col items-end">
                {article.alreadyAdded ? (
                    <p className="text-green-500 text-sm">✅ Already in Library</p>
                ) : (
                    <button
                    onClick={() => handleAddToLibrary(article, 'pubmed')}
                    className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                    Add to Library
                    </button>
                )}
                {libraryMessages[article.uid] && (
                    <p className="text-blue-400 mt-1 text-sm">{libraryMessages[article.uid]}</p>
                )}
                </div>
            )}
            </div>
        ))}
        </div>


        {/* Pagination */}
        <div className="flex justify-center mt-6 space-x-4">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            className="px-4 py-2 rounded border border-[var(--border-color)] disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-4 py-2 font-semibold">Page {currentPage} of {totalPages}</span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            className="px-4 py-2 rounded border border-[var(--border-color)] disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
