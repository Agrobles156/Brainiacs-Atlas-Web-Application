'use client';

import React, { useRef } from 'react';
import dynamic from 'next/dynamic';

// Polyfill for older Node runtimes
if (!(Promise as any).withResolvers) {
  (Promise as any).withResolvers = function withResolvers<T = unknown>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// Dynamically import react-pdf on the client only
const Document = dynamic(async () => (await import('react-pdf')).Document, { ssr: false });
const Page = dynamic(async () => (await import('react-pdf')).Page, { ssr: false });

import 'react-pdf/dist/esm/Page/TextLayer.css';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';

// Configure PDF.js worker
const setWorkerSrc = () => {
  import('react-pdf').then(({ pdfjs }) => {
    pdfjs.GlobalWorkerOptions.workerSrc =
      `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }).catch(() => {});
};
if (typeof window !== 'undefined') setWorkerSrc();

export default function PDFViewer(props: {
  formData: any;
  zoom: number;
  setZoom: (z: number | ((prev: number) => number)) => void;
  highlightMode: boolean;
  setHighlightMode: (v: (p: boolean) => boolean) => void;
  annotations: any[];
  onDeleteAnnotation: (id: string) => void;
  onDocumentLoadSuccess: (info: any) => void;
  formatDate: (d: string) => string;
}) {
  const {
    formData,
    zoom,
    setZoom,
    highlightMode,
    setHighlightMode,
    annotations,
    onDeleteAnnotation,
    onDocumentLoadSuccess,
    formatDate,
  } = props;

  const annotationsRef = useRef<HTMLDivElement | null>(null);

  const scrollToAnnotations = () => {
    annotationsRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="h-[80vh] overflow-y-auto bg-[var(--panel-bg)] text-[var(--panel-text)] transition-colors duration-200 p-4">
      <h3 className="text-lg font-bold mb-4">PDF Viewer</h3>

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setHighlightMode(prev => !prev)}
          className={`px-2 py-1 rounded border transition-colors duration-200
            ${highlightMode
              ? 'bg-[var(--tile-selected)] text-[var(--panel-bg)] border-[var(--tile-selected)]'
              : 'bg-[var(--tile-bg)] text-[var(--panel-text)] border-[var(--panel-text)] hover:bg-[var(--tile-hover)]'}`}
        >
          {highlightMode ? 'Highlighting...' : 'Highlight'}
        </button>

        <button
          onClick={() => setZoom(prev => (typeof prev === 'number' ? Math.max(prev - 0.1, 0.5) : 1))}
          className="px-2 py-1 rounded border border-[var(--panel-text)] hover:bg-[var(--tile-hover)] transition-colors duration-200"
        >
          ➖ Zoom Out
        </button>

        <span className="text-sm text-[var(--panel-text)]">Zoom: {(zoom * 100).toFixed(0)}%</span>

        <button
          onClick={() => setZoom(prev => (typeof prev === 'number' ? Math.min(prev + 0.1, 3) : 1))}
          className="px-2 py-1 rounded border border-[var(--panel-text)] hover:bg-[var(--tile-hover)] transition-colors duration-200"
        >
          ➕ Zoom In
        </button>

        <button
          onClick={scrollToAnnotations}
          className="px-2 py-1 rounded border border-[var(--panel-text)] hover:bg-[var(--tile-hover)] transition-colors duration-200"
        >
          Go to Annotations
        </button>
      </div>

      {formData?.pdf_url ? (
        <Document file={formData.pdf_url} onLoadSuccess={onDocumentLoadSuccess} className="border border-[var(--panel-text)] rounded-md">
          {Array.from(new Array(formData.numPages || 1), (_, index) => (
            <Page key={`page_${index + 1}`} pageNumber={index + 1} width={650 * zoom} />
          ))}
        </Document>
      ) : formData?.source_url ? (
        <a
          href={formData.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 underline text-sm"
        >
          View Source Article
        </a>
      ) : (
        <p className="text-sm text-[var(--panel-text)] opacity-60">No PDF or source available</p>
      )}

      <div className="mt-4" ref={annotationsRef}>
        <h4 className="font-bold text-sm mb-1">Annotations</h4>
        {annotations.length === 0 ? (
          <p className="text-sm italic text-[var(--panel-text)] opacity-60">No Annotations yet.</p>
        ) : (
          <ul className="text-sm space-y-2">
            {annotations.map((ann) => (
              <li
                key={ann.id}
                className="flex justify-between items-start p-2 rounded bg-[var(--tile-bg)] hover:bg-[var(--tile-hover)] transition-colors duration-200"
              >
                <div>
                  <div>{ann.text}</div>
                  <div className="text-xs text-[var(--panel-text)] opacity-70">{formatDate(ann.created_at)}</div>
                </div>
                <button
                  onClick={() => onDeleteAnnotation(ann.id)}
                  className="text-xs text-red-500 hover:underline ml-2"
                >
                  ✖
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
