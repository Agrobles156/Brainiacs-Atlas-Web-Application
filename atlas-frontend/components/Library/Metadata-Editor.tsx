'use client';

import React from 'react';

export default function MetadataEditor({
  formData,
  onChange,
  onNestedChange,
  onSave,
  onDelete,
  onClose,
}) {
  return (
    <div className="text-[var(--panel-text)] bg-[var(--panel-bg)] transition-colors duration-300 p-4 rounded-md">
      {/* Title */}
      <label className="block font-bold mb-1">Title</label>
      <input
        value={formData.title || ''}
        onChange={(e) => onChange('title', e.target.value)}
        className="w-full border border-[var(--border-color)] bg-[var(--panel-bg)] text-[var(--panel-text)] 
                   p-2 mb-2 rounded transition-colors duration-300"
      />

      {/* Authors */}
      <label className="block font-bold mb-1">Authors</label>
      <textarea
        value={formData.authors?.join(', ') || ''}
        onChange={(e) =>
          onChange(
            'authors',
            e.target.value.split(',').map((a) => a.trim())
          )
        }
        className="w-full border border-[var(--border-color)] bg-[var(--panel-bg)] text-[var(--panel-text)] 
                   p-2 mb-2 rounded transition-colors duration-300"
      />

      {/* Dynamic Identifiers */}
      {Object.entries({ ...(formData.identifiers || {}) }).map(([key, value]) => (
        <div key={key} className="mb-2">
          <label className="block font-bold mb-1">{key.toUpperCase()}</label>
          <input
            value={value || ''}
            onChange={(e) => onNestedChange('identifiers', key, e.target.value)}
            className="w-full border border-[var(--border-color)] bg-[var(--panel-bg)] text-[var(--panel-text)] 
                       p-2 rounded transition-colors duration-300"
          />
        </div>
      ))}

      {/* Journal */}
      <label className="block font-bold mb-1">Journal</label>
      <input
        value={formData.journal || ''}
        onChange={(e) => onChange('journal', e.target.value)}
        className="w-full border border-[var(--border-color)] bg-[var(--panel-bg)] text-[var(--panel-text)] 
                   p-2 mb-2 rounded transition-colors duration-300"
      />

      {/* Year */}
      <label className="block font-bold mb-1">Year</label>
      <input
        value={formData.year || ''}
        onChange={(e) => onChange('year', e.target.value)}
        className="w-full border border-[var(--border-color)] bg-[var(--panel-bg)] text-[var(--panel-text)] 
                   p-2 mb-2 rounded transition-colors duration-300"
      />

      {/* Notes */}
      <label className="block font-bold mb-1">Notes</label>
      <textarea
        value={formData.user_notes || ''}
        onChange={(e) => onChange('user_notes', e.target.value)}
        className="w-full border border-[var(--border-color)] bg-[var(--panel-bg)] text-[var(--panel-text)] 
                   p-2 mb-2 rounded transition-colors duration-300"
      />

      {/* Buttons */}
      <div className="flex justify-between mt-4 items-center">
        <button
          onClick={onClose}
          className="text-sm text-[var(--panel-text)] opacity-70 hover:opacity-100 underline transition-opacity duration-200"
        >
          Close
        </button>
        <div className="flex gap-2">
          <button
            onClick={onDelete}
            className="px-3 py-1 rounded bg-[var(--delete-bg,#ef4444)] text-white hover:opacity-90 transition-opacity duration-200"
          >
            Delete
          </button>
          <button
            onClick={onSave}
            className="px-3 py-1 rounded bg-[var(--save-bg,#3b82f6)] text-white hover:opacity-90 transition-opacity duration-200"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
