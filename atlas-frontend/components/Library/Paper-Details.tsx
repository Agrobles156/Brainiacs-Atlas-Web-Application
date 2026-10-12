'use client';
import React from 'react';

interface PaperDetailsProps {
  formData: {
    title: string;
    authors?: string[];
    journal?: string;
    year?: string;
    abstract?: string;
    pdf_url?: string;
    user_notes?: string;
  };
}

export default function PaperDetails({ formData }: PaperDetailsProps) {
  return (
    <div className="p-4 rounded-lg bg-[var(--panel-bg)] text-[var(--panel-text)] transition-colors duration-200">
      {/* Title */}
      <h2 className="text-xl font-bold mb-2 text-[var(--panel-text)]">
        {formData.title}
      </h2>

      {/* Authors */}
      <p className="text-sm italic opacity-80 mb-2 text-[var(--panel-text)]">
        {formData.authors?.join(', ')}
      </p>

      {/* Journal & Year */}
      <p className="text-sm mb-1 text-[var(--panel-text)]">
        <strong>Journal:</strong> {formData.journal || 'N/A'}
      </p>
      <p className="text-sm mb-4 text-[var(--panel-text)]">
        <strong>Year:</strong> {formData.year || 'N/A'}
      </p>

      {/* Abstract */}
      {formData.abstract && (
        <div className="mb-4">
          <h4 className="font-semibold text-sm mb-1 text-[var(--panel-text)]">Abstract</h4>
          <p className="text-sm whitespace-pre-line opacity-90 text-[var(--panel-text)]">
            {formData.abstract}
          </p>
        </div>
      )}

      {/* PDF Link */}
      {formData.pdf_url && (
        <a
          href={formData.pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--tile-hover)] underline text-sm block mt-2 transition-colors duration-200 hover:text-[var(--tile-selected)]"
        >
          View PDF
        </a>
      )}

      {/* User Notes */}
      <div className="mt-4">
        <h4 className="font-semibold text-sm mb-1 text-[var(--panel-text)]">Your Notes</h4>
        <p className="text-sm opacity-90 text-[var(--panel-text)]">
          {formData.user_notes || 'No notes yet.'}
        </p>
      </div>
    </div>
  );
}
