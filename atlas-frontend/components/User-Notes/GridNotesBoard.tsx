
'use client';

import React, { useEffect, useMemo, useState } from "react";
import { Pencil, Share2, Copy, Trash2, FolderPlus } from "lucide-react";

export type GridNote = {
  id: string;
  title: string;
  authors: string;
  details: string;
  region?: string;
  year?: string | number;
  updatedAt?: string | Date;
};

type Props = {
  notes: GridNote[];
  onEdit: (n: GridNote) => void;
  onShare: (n: GridNote) => void;
  onCopyLink: (n: GridNote) => void;
  onDownload: (n: GridNote) => void;
  onDelete: (n: GridNote) => void;
  /** Open a note (navigates to Atlas with saved state) */
  onOpen?: (n: GridNote) => void;
  viewSwitcher?: React.ReactNode;
  searchBar?: React.ReactNode;
};

function cleanDetails(details: string) {
  if (!details) return "";
  const trimmed = details
    .replace(/```atlas_dual\s*[\s\S]*?```/gi, "")
    .replace(/```atlas\s*[\s\S]*?```/gi, "")
    .replace(/^```[a-zA-Z]*\n?|```$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return trimmed.length > 220 ? trimmed.slice(0, 220) + "…" : trimmed;
}

function formatDate(dt?: string | Date) {
  if (!dt) return "";
  try {
    const d = new Date(dt);
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(d);
  } catch {
    return "";
  }
}

/** Extract saved atlas JSON from a note's details, if present (single-pane). */
function extractAtlasJSON(details?: string | null): any | null {
  if (!details) return null;
  const fenced = details.match(/```atlas\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      /* ignore */
    }
  }
  const ix = details.toLowerCase().indexOf("atlas");
  if (ix >= 0) {
    const brace = details.indexOf("{", ix);
    if (brace >= 0) {
      const tail = details.slice(brace);
      const end = tail.lastIndexOf("}");
      if (end >= 0) {
        try {
          return JSON.parse(tail.slice(0, end + 1));
        } catch {
          /* ignore */
        }
      }
    }
  }
  return null;
}

/** Extract dual-pane atlas JSON if present: { left: {...}, right: {...} } */
function extractAtlasDualJSON(
  details?: string | null
): { left: any; right: any } | null {
  if (!details) return null;
  const fenced = details.match(/```atlas_dual\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      const obj = JSON.parse(fenced[1]);
      if (obj && typeof obj === "object" && (obj.left || obj.right)) {
        return { left: obj.left ?? {}, right: obj.right ?? {} };
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Color map for selected tile fills. */
function toHex(c: string | undefined): string {
  const m: Record<string, string> = {
    blue: "#60A5FA",
    red: "#F87171",
    green: "#34D399",
    yellow: "#FBBF24",
    purple: "#A78BFA",
    orange: "#FB923C",
    teal: "#2DD4BF",
    pink: "#F472B6",
  };
  if (!c) return m.blue;
  return m[c.toLowerCase()] ?? c; // accept hex/rgb strings too
}

/* Cache the raw SVG text for each base file so multiple cards don’t re-fetch. */
const rawSvgCache = new Map<string, string>();

async function fetchSvgText(path: string): Promise<string> {
  if (rawSvgCache.has(path)) return rawSvgCache.get(path)!;
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  const txt = await res.text();
  rawSvgCache.set(path, txt);
  return txt;
}

/** Build an object URL for a tiny, customized preview SVG based on saved atlas JSON. */
async function buildPreviewUrlFromAtlas(meta: any): Promise<string | null> {
  if (!meta) return null;

  // Normalize fields (accept both snake_case and camelCase)
  const lvl = Number(meta?.atlas_level ?? meta?.selectedLevel ?? 29);
  const isCheck = !!(meta?.is_check ?? meta?.isCheck);
  const isCheckTest = !!(meta?.is_check_test ?? meta?.isCheckTest);
  const layers: string[] = Array.isArray(meta?.active_layers)
    ? meta.active_layers
    : Array.isArray(meta?.activeLayers)
    ? meta.activeLayers
    : [];
  const tiles: string[] = Array.isArray(meta?.selected_tiles)
    ? meta.selected_tiles
    : Array.isArray(meta?.selectedTiles)
    ? meta.selectedTiles
    : [];
  const selectedRegion =
    meta?.selected_region ?? meta?.selectedRegion ?? null;

  // Decide which base SVG to use (same rules as Atlas)
  const basePath = isCheck
    ? `/completes/level-${lvl}-grid-brain.svg`
    : isCheckTest
    ? `/grid/level-${lvl}-grid.svg`
    : `/levels/level-${lvl}.svg`;

  let svgText: string;
  try {
    svgText = await fetchSvgText(basePath);
  } catch {
    return null;
  }

  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement;

  if (!svg.getAttribute("viewBox")) {
    const w = svg.getAttribute("width") || "1200";
    const h = svg.getAttribute("height") || "900";
    svg.setAttribute("viewBox", `0 0 ${parseFloat(w as string)} ${parseFloat(h as string)}`);
  }

  // 1) Toggle layers
  layers.forEach((id) => {
    const el = doc.getElementById(id);
    if (el) el.setAttribute("style", "display:inline");
  });

  // 2) Grid + selected tiles
  const grid = doc.getElementById("layer-grid");
  if (grid) {
    grid.setAttribute("style", tiles.length ? "display:inline" : "display:none");
    const color = toHex(meta?.highlight_color ?? meta?.highlightColor ?? "blue");
    const rects = doc.querySelectorAll("#layer-grid rect[id]");
    rects.forEach((r) => {
      const id = r.getAttribute("id") || "";
      if (tiles.includes(id)) {
        r.setAttribute("fill", color);
        r.setAttribute("fill-opacity", "0.35");
        r.setAttribute("stroke", color);
        r.setAttribute("stroke-width", "2");
      } else {
        r.setAttribute("fill", "white");
        r.setAttribute("fill-opacity", "1");
        r.removeAttribute("stroke");
        r.removeAttribute("stroke-width");
      }
    });
  }

  // 3) Emphasize selected region label
  if (selectedRegion) {
    const color = "#0EA5E9";
    const texts = Array.from(doc.querySelectorAll("text"));
    for (const t of texts) {
      if ((t.textContent || "").trim() === String(selectedRegion).trim()) {
        t.setAttribute("fill", color);
        t.setAttribute("font-weight", "700");
      }
    }
  }

  const serialized = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([serialized], { type: "image/svg+xml" });
  return URL.createObjectURL(blob);
}

function metaKey(meta: any | null): string | null {
  if (!meta) return null;
  const lvl = Number(meta?.atlas_level ?? meta?.selectedLevel ?? 29);
  const isCheck = !!(meta?.is_check ?? meta?.isCheck);
  const isCheckTest = !!(meta?.is_check_test ?? meta?.isCheckTest);
  const layers = Array.isArray(meta?.active_layers)
    ? meta.active_layers
    : Array.isArray(meta?.activeLayers)
    ? meta.activeLayers
    : [];
  const tiles = Array.isArray(meta?.selected_tiles)
    ? meta.selected_tiles
    : Array.isArray(meta?.selectedTiles)
    ? meta.selectedTiles
    : [];
  const color = meta?.highlight_color ?? meta?.highlightColor ?? "blue";
  const region = meta?.selected_region ?? meta?.selectedRegion ?? "";
  return JSON.stringify({ lvl, isCheck, isCheckTest, layers, tiles, color, region });
}

/** Hook: produce an object URL for a single meta payload (or null). */
function usePreviewFromMeta(meta: any | null) {
  const [url, setUrl] = useState<string | null>(null);
  const key = useMemo(() => metaKey(meta), [meta]);

  useEffect(() => {
    let cancelled = false;
    let objUrl: string | null = null;

    async function go() {
      if (!key || !meta) {
        setUrl(null);
        return;
      }
      try {
        const u = await buildPreviewUrlFromAtlas(meta);
        if (!cancelled) {
          objUrl = u;
          setUrl(u);
        }
      } catch {
        if (!cancelled) setUrl(null);
      }
    }
    go();

    return () => {
      cancelled = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [key, meta]);

  return url;
}

/** Hook: examine details and return preview URLs for single or dual notes. */
function useDualAwarePreview(details?: string) {
  const dual = useMemo(() => extractAtlasDualJSON(details), [details]);
  const single = useMemo(
    () => (dual ? null : extractAtlasJSON(details)),
    [details, dual]
  );

  const leftUrl = usePreviewFromMeta(dual?.left ?? null);
  const rightUrl = usePreviewFromMeta(dual?.right ?? null);
  const singleUrl = usePreviewFromMeta(single);

  return {
    type: dual ? ("dual" as const) : single ? ("single" as const) : ("none" as const),
    leftUrl,
    rightUrl,
    singleUrl,
  };
}

export default function GridNotesBoard({
  notes,
  onEdit,
  onShare,
  onCopyLink,
  onDownload,
  onDelete,
  onOpen,
  viewSwitcher,
  searchBar,
}: Props) {
  const colors = Array(6).fill("bg-white dark:bg-white");
  const items = useMemo(() => notes ?? [], [notes]);

  return (
    <div className="w-full">
      {(searchBar || viewSwitcher) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex-1">{searchBar}</div>
          <div className="shrink-0">{viewSwitcher}</div>
        </div>
      )}

      {/* exactly 3 columns on md+ screens */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-3 gap-6"
        role="list"
        aria-label="Notes grid"
      >
        {items.map((n, idx) => (
          <Card
            key={n.id}
            note={n}
            colorClass={colors[idx % colors.length]}
            onEdit={() => onEdit(n)}
            onShare={() => onShare(n)}
            onCopyLink={() => onCopyLink(n)}
            onDownload={() => onDownload(n)}
            onDelete={() => onDelete(n)}
            onOpen={onOpen ? () => onOpen(n) : undefined}
          />
        ))}
      </div>

      {items.length === 0 && <EmptyState />}
    </div>
  );
}

function Card({
  note,
  colorClass,
  onEdit,
  onShare,
  onCopyLink,
  onDownload,
  onDelete,
  onOpen,
}: {
  note: GridNote;
  colorClass: string;
  onEdit: () => void;
  onShare: () => void;
  onCopyLink: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onOpen?: () => void;
}) {
  const lastUpdated = formatDate(note.updatedAt);
  const { type, leftUrl, rightUrl, singleUrl } = useDualAwarePreview(
    note.details
  );

  const titleProps = onOpen
    ? {
        role: "button" as const,
        tabIndex: 0,
        onClick: onOpen,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        },
        className:
          "line-clamp-2 text-lg font-semibold tracking-tight text-neutral-900 " +
          "dark:text-neutral-950/90 hover:underline cursor-pointer",
        title: "Open note",
        "aria-label": `Open note ${note.title || "Untitled"}`,
      }
    : {
        className:
          "line-clamp-2 text-lg font-semibold tracking-tight text-neutral-900 " +
          "dark:text-neutral-950/90",
      };

  return (
    <article
      role="listitem"
      aria-label={note.title}
      className={`relative isolate ${colorClass} rounded-2xl p-4 shadow-[0_15px_30px_-15px_rgba(0,0,0,0.3)] min-h-[220px] hover:shadow-[0_25px_45px_-15px_rgba(0,0,0,0.35)] transition-shadow ring-1 ring-black/5`}
    >
      {/* tape & pin */}
      <div className="absolute -top-2 left-8 h-6 w-24 rotate-[-2deg] bg-white/70 dark:bg-white/50 shadow-sm backdrop-blur rounded-[2px]" />
      <div className="absolute -top-2 right-5 h-4 w-4 rounded-full bg-neutral-400/70 dark:bg-neutral-300/70 shadow" />

      <div className="flex h-full flex-col">
        <header className="mb-2">
          <h3 {...titleProps}>{note.title || "Untitled"}</h3>
          <p className="mt-1 text-xs text-neutral-700/80">
            by <span className="font-medium">{note.authors}</span>
          </p>
        </header>

        {/* --- Preview thumbnail --- */}
        {type === "dual" && (leftUrl || rightUrl) && (
          <div className="mb-2 grid grid-cols-2 gap-1 rounded-md bg-white dark:bg-white overflow-hidden border border-neutral-200">
            <div className="bg-white dark:bg-white">
              {leftUrl ? (
                <img
                  src={leftUrl}
                  alt="Left preview"
                  className="w-full max-h-40 object-contain bg-white dark:bg-white"
                  loading="lazy"
                />
              ) : (
                <div className="h-24" />
              )}
            </div>
            <div className="bg-white dark:bg-white">
              {rightUrl ? (
                <img
                  src={rightUrl}
                  alt="Right preview"
                  className="w-full max-h-40 object-contain bg-white dark:bg-white"
                  loading="lazy"
                />
              ) : (
                <div className="h-24" />
              )}
            </div>
          </div>
        )}

        {type === "single" && singleUrl && (
          <div className="mb-2 rounded-md bg-white dark:bg-white overflow-hidden">
            <img
              src={singleUrl}
              alt="Preview"
              className="w-full max-h-40 object-contain bg-white dark:bg-white"
              loading="lazy"
            />
          </div>
        )}

        <p className="prose prose-sm dark:prose-invert line-clamp-5 text-[13px] leading-5 text-neutral-800/90">
          {cleanDetails(note.details)}
        </p>

        <div className="mt-auto pt-3 flex items-center justify-between gap-2">
          <dl className="text-[11px] text-neutral-700/80">
            {(note.region || note.year) && (
              <div className="flex gap-2">
                {note.region && (
                  <dd className="rounded-md bg-black/5 px-2 py-0.5 dark:bg-black/10">
                    {note.region}
                  </dd>
                )}
                {note.year && (
                  <dd className="rounded-md bg-black/5 px-2 py-0.5 dark:bg-black/10">
                    {String(note.year)}
                  </dd>
                )}
              </div>
            )}
            {lastUpdated && (
              <div className="mt-1">
                <dd className="italic">Updated {lastUpdated}</dd>
              </div>
            )}
          </dl>

          <div className="flex items-center gap-1">
            <IconBtn label="Edit" onClick={onEdit}>
              <Pencil size={16} />
            </IconBtn>
            <IconBtn label="Share" onClick={onShare}>
              <Share2 size={16} />
            </IconBtn>
            {/* Add to collection */}
            <IconBtn label="Add to collection" onClick={onCopyLink}>
              <FolderPlus size={16} />
            </IconBtn>
            {/* Duplicate */}
            <IconBtn label="Duplicate" onClick={onDownload}>
              <Copy size={16} />
            </IconBtn>
            <IconBtn label="Delete" tone="danger" onClick={onDelete}>
              <Trash2 size={16} />
            </IconBtn>
          </div>
        </div>
      </div>
    </article>
  );
}

function IconBtn({
  children,
  onClick,
  label,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  tone?: "default" | "danger";
}) {
  const base =
    "inline-flex items-center justify-center rounded-xl p-2 text-neutral-800/90 hover:bg-black/5 active:scale-95 transition dark:text-neutral-900";
  const danger = "hover:bg-red-500/10 text-red-600";
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`${base} ${tone === "danger" ? danger : ""}`}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="mt-20 flex flex-col items-center justify-center text-center">
      <div className="rounded-2xl border border-dashed border-neutral-300/70 px-6 py-12 dark:border-neutral-700/50">
        <p className="text-lg font-medium">No notes yet</p>
        <p className="mt-1 text-sm text-neutral-600">
          Create your first note to get started.
        </p>
      </div>
    </div>
  );
}
