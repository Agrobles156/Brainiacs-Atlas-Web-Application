'use client';
import React, { useEffect, useState } from 'react';
import PaperDetails from './Paper-Details';
import MetadataEditor from './Metadata-Editor';
import PDFViewer from './PDF-Viewer';

const TABS = [
  { key: 'details', icon: '📄', label: 'Details' },
  { key: 'edit', icon: '✏️', label: 'Edit Metadata' },
  { key: 'view', icon: '📑', label: 'View PDF' }
];

export default function PaperSidebar({
  paper,
  setPaper,
  userID,
  activeTab,
  setActiveTab,
  fetchLibrary
}) {
  const baseUrl = 'flask-api';
  const [formData, setFormData] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [highlightMode, setHighlightMode] = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [numPages, setNumPages] = useState(null);

  useEffect(() => {
    if (paper) {
      setFormData({ ...paper, user_id: userID });
      setAnnotations(paper.annotations || []);
    } else {
      setFormData(null);
      setAnnotations([]);
    }
  }, [paper]);

  useEffect(() => {
    if (!highlightMode) return;

    const handleMouseUp = async () => {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();

      if (selectedText && formData) {
        const newHighlight = {
          id: Date.now(),
          text: selectedText,
          created_at: new Date().toISOString()
        };

        const updatedAnnotations = [...annotations, newHighlight];
        setAnnotations(updatedAnnotations);
        selection?.removeAllRanges();

        const updatedFormData = { ...formData, annotations: updatedAnnotations };
        const res = await fetch(`${baseUrl}/library/update/${formData._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedFormData)
        });

        if (res.ok) fetchLibrary();
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [highlightMode, annotations, formData]);

  const handleChange = (field, value) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const handleNestedChange = (section, key, value) =>
    setFormData(prev => ({
      ...prev,
      [section]: { ...(prev[section] || {}), [key]: value }
    }));

  const handleSave = async () => {
    const res = await fetch(`${baseUrl}/library/update/${formData._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    if (res.ok) fetchLibrary();
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this paper?")) return;
    const res = await fetch(`${baseUrl}/library/delete/${formData._id}?user_id=${userID}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      fetchLibrary();
      setPaper(null);
    }
  };

  const handleDeleteAnnotation = async (id) => {
    const updated = annotations.filter(a => a.id !== id);
    setAnnotations(updated);
    const updatedFormData = { ...formData, annotations: updated };
    const res = await fetch(`${baseUrl}/library/update/${formData._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedFormData)
    });
    if (res.ok) fetchLibrary();
  };

  const formatDate = (timestamp) => {
    const now = new Date();
    const created = new Date(timestamp);
    const isToday = now.toDateString() === created.toDateString();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = yesterday.toDateString() === created.toDateString();
    const timeString = created.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (isToday) return `Today at ${timeString}`;
    if (isYesterday) return `Yesterday at ${timeString}`;
    return created.toLocaleString();
  };

  const onDocumentLoadSuccess = ({ numPages }) => setNumPages(numPages);

  if (!formData) {
    return <p className="italic text-[var(--panel-text)] opacity-70">Select a paper to view details</p>;
  }

  return (
    <div className="w-full h-full overflow-y-auto p-6 border-l border-[var(--panel-text)] bg-[var(--panel-bg)] text-[var(--panel-text)] transition-colors duration-200">
      {/* Tabs */}
      <div className="flex justify-between mb-4 items-center">
        <div className="flex gap-4">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`text-lg px-2 py-1 rounded transition-colors duration-200
                ${activeTab === tab.key 
                  ? 'text-[var(--tile-selected)] font-bold border-b-2 border-[var(--tile-selected)]' 
                  : 'text-[var(--panel-text)] hover:text-[var(--tile-hover)]'}`}
            >
              {tab.icon}
            </button>
          ))}
        </div>
        <button
          onClick={() => setPaper(null)}
          className="text-sm hover:underline text-[var(--panel-text)] hover:text-[var(--tile-hover)] transition-colors duration-200"
        >
          ✖ Close
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'details' && <PaperDetails formData={formData} />}

      {activeTab === 'edit' && (
        <MetadataEditor
          formData={formData}
          onChange={handleChange}
          onNestedChange={handleNestedChange}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setPaper(null)}
        />
      )}

      {activeTab === 'view' && (
        <PDFViewer
          formData={{ ...formData, numPages }}
          zoom={zoom}
          setZoom={setZoom}
          highlightMode={highlightMode}
          setHighlightMode={setHighlightMode}
          annotations={annotations}
          onDeleteAnnotation={handleDeleteAnnotation}
          onDocumentLoadSuccess={onDocumentLoadSuccess}
          formatDate={formatDate}
        />
      )}
    </div>
  );
}
