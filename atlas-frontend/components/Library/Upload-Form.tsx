'use client';
import React, { useRef, useState } from 'react';

export default function UploadForm({ userID, onUploadComplete }) {
  const [identifier, setIdentifier] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const baseUrl = 'flask-api';

  const handleUpload = async () => {
    setLoading(true);
    setMessage(null);
    const formData = new FormData();
    formData.append('user_id', userID);
    if (identifier) formData.append('identifier', identifier);
    if (file) formData.append('file', file);

    try {
      const res = await fetch(`${baseUrl}/library/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setMessage("Upload successful!");
        setIdentifier('');
        setFile(null);
        onUploadComplete();
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        setMessage(data.error || "Upload failed.");
      }
    } catch (e) {
      console.error(e);
      setMessage("Server error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 rounded mb-4 border transition-colors duration-300
                    bg-[var(--panel-bg)] border-[var(--border-color)] text-[var(--panel-text)]">
      <h3 className="text-lg font-bold mb-2">Add to Library</h3>

      <input
        type="text"
        placeholder="Paste DOI, PMCID, PMID, arXiv ID..."
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        className="w-full mb-2 p-2 rounded border transition-colors duration-300
                   bg-[var(--panel-bg)] border-[var(--border-color)] text-[var(--panel-text)]"
      />

      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="mb-2 text-[var(--panel-text)]"
      />

      <button
        onClick={handleUpload}
        className="px-4 py-2 rounded transition-colors duration-300
                   bg-[var(--save-bg,#3b82f6)] text-white hover:opacity-90 disabled:opacity-50"
        disabled={loading}
      >
        {loading ? 'Uploading...' : 'Upload'}
      </button>

      {message && (
        <p className="mt-2 text-sm text-[var(--panel-text)] opacity-80">{message}</p>
      )}
    </div>
  );
}
