'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as d3 from 'd3';

import GeneralSidebar from '@/components/Sidebar';

/**
 * One-page Loop docs UI
 * - Left: list of docs (titles only), search, + new
 * - Right: editor for selected doc
 * - Paragraph tool supports inline images inside a contentEditable area.
 * - Add up to 4 embedded atlas maps (inline D3 loader).
 * - Autosaves to /flask-api/loops (if available) with localStorage fallback.
 */

type LoopTool =
  | 'Paragraph'
  | 'Table'
  | 'Bulleted list'
  | 'Checklist'
  | 'Task list'
  | 'Numbered list';

type ChecklistItem = { text: string; done: boolean };
type TaskRow = { task: string; assignee: string; due: string; bucket: string };

/* Rectangular highlights */
type HighlightRect = { id: string; x: number; y: number; w: number; h: number; color: string };

/* Freehand stroke */
type FreehandStroke = { id: string; color: string; width: number; d: string };

/* Layer toggles (labels match your UI) */
type LayerKey =
  | 'gridSolid'
  | 'stCoordinates'
  | 'box3d'
  | 'nissl'
  | 'blueVentricle'
  | 'mappingAtlas'
  | 'subdivision'
  | 'yellowMask'
  | 'physicalCoords';

type LayerState = Record<LayerKey, boolean>;

const DEFAULT_LAYERS: LayerState = {
  gridSolid: false,
  stCoordinates: false,
  box3d: false,
  nissl: false,
  blueVentricle: false,
  mappingAtlas: true, // plain atlas by default
  subdivision: false,
  yellowMask: false,
  physicalCoords: false,
};

/* Per-map metadata (additions are strictly additive) */
type MapEmbed = {
  id: string;
  title?: string;
  src?: string;
  level?: number;
  transform?: { k: number; x: number; y: number } | null;

  selectedRegion?: string | null;
  selectedTiles?: string[];
  noteTitle?: string;
  noteDetails?: string;

  highlights?: HighlightRect[]; // rectangular HL
  highlightColor?: string; // per-map HL color
  layers?: LayerState; // per-map layer visibility
  shapeIds?: string[]; // ids of clicked shapes (all layers)

  /* NEW: freehand drawing state (per map) */
  freehand?: FreehandStroke[];
  penColor?: string; // current pencil color
  penWidth?: number; // current pencil width
};

type LoopPayload = {
  docId?: string;
  title: string;
  activeTool: LoopTool;
  paragraph: string;
  richHtml?: string;
  maps?: MapEmbed[];
  table: string[][];
  bulleted: string[];
  checklist: ChecklistItem[];
  tasks: TaskRow[];
  numbered: string[];
};

// --- Tuning constants ---
const FIXED_IMG_WIDTH = 520;
const MAX_MAPS = 4;
const MAP_BOX_PX = 380;

const EMPTY_LOOP: LoopPayload = {
  docId: undefined,
  title: 'Untitled',
  activeTool: 'Paragraph',
  paragraph: '',
  richHtml: '',
  maps: [],
  table: [['Column 1', 'Column 2']],
  bulleted: [],
  checklist: [],
  tasks: [],
  numbered: [],
};

const API = '/flask-api';
const LOOPS_API = `${API}/loops`;
const LS_LOOPS = 'loop_docs.v1';
const LS_USERNAME = 'loop.username.display';

/* ───────────────────────────────────────────────────────────
   Local storage helpers
   ─────────────────────────────────────────────────────────── */
function readLocalLoops(): Record<string, LoopPayload> {
  try {
    return JSON.parse(localStorage.getItem(LS_LOOPS) || '{}') || {};
  } catch {
    return {};
  }
}
function writeLocalLoops(map: Record<string, LoopPayload>) {
  try {
    localStorage.setItem(LS_LOOPS, JSON.stringify(map));
  } catch {}
}
function createLocalLoopDoc(loop: LoopPayload): string {
  const id = crypto.randomUUID();
  const map = readLocalLoops();
  map[id] = { ...EMPTY_LOOP, ...loop, docId: id };
  writeLocalLoops(map);
  return id;
}
function updateLocalLoopDoc(id: string, patch: Partial<LoopPayload>) {
  const map = readLocalLoops();
  const prev = map[id] || { ...EMPTY_LOOP, docId: id };
  map[id] = { ...prev, ...patch, docId: id };
  writeLocalLoops(map);
}

async function apiCreateLoopDoc(loop: LoopPayload): Promise<string | null> {
  try {
    const res = await fetch(LOOPS_API, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: loop.title || 'Untitled', loop }),
    });
    const data = await res.json().catch(() => ({}));
    return (data?.id || data?._id || data?.docId || null) as string | null;
  } catch {
    return null;
  }
}
async function apiUpdateLoopDoc(id: string, loop: Partial<LoopPayload>): Promise<boolean> {
  try {
    const res = await fetch(`${LOOPS_API}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: loop.title, loop }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok || !!data?.ok;
  } catch {
    return false;
  }
}
async function apiDeleteLoopDoc(id: string): Promise<void> {
  try {
    await fetch(`${LOOPS_API}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
  } catch {}
}
async function ensureLoopDocId(loop: LoopPayload): Promise<string> {
  if (loop.docId) return loop.docId;
  const remote = await apiCreateLoopDoc(loop);
  if (remote) return remote;
  return createLocalLoopDoc(loop);
}

/* ───────────────────────────────────────────────────────────
   Utils
   ─────────────────────────────────────────────────────────── */
const fmtStatus = (s: 'idle' | 'saving' | 'saved' | 'error') =>
  s === 'saving' ? 'Saving…' : s === 'saved' ? 'Saved' : s === 'error' ? 'Save failed' : '';

function escapeForHtml(s: string) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}
function insertNodeAtCaret(node: Node, container: HTMLElement) {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    range.collapse(false);
    range.insertNode(node);
    range.setStartAfter(node);
    range.setEndAfter(node);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    container.appendChild(node);
  }
}
function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function applyFixedImageSizing(container: HTMLElement | null) {
  if (!container) return;
  const imgs = Array.from(container.querySelectorAll('img'));
  for (const im of imgs) {
    const el = im as HTMLImageElement;
    if (!el.classList.contains('loop-inline-img')) el.classList.add('loop-inline-img');
    el.style.width = `${FIXED_IMG_WIDTH}px`;
    el.style.maxWidth = '100%';
    el.style.height = 'auto';
    el.style.borderRadius = '8px';
    el.style.display = 'block';
    el.style.margin = '8px 0';
  }
}
function hexToRgba(hex: string, alpha = 0.25) {
  if (hex.startsWith('rgba(') || hex.startsWith('rgb(')) return hex;
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
const cssEscape = (id: string) =>
  id.replace(/([ #;?%&,.+*~\':"!^$[\]()=>|\/@])/g, '\\$1');

/* Heuristic layer group selectors (suffix match; ids are namespaced) */
type LayerQueryMap = Record<LayerKey, string[]>;
const LAYER_QUERIES: LayerQueryMap = {
  gridSolid: ['[id$="layer-grid"]', '[id*="grid"]'],
  stCoordinates: ['[id$="layer-st"]', '[id*="stereotax"]', '[id*="st-"]'],
  box3d: ['[id$="layer-box"]', '[id*="box"]', '[id*="3d"]'],
  nissl: ['[id$="layer-nissl"]', '[id*="nissl"]'],
  blueVentricle: ['[id$="layer-blueVentricle"]', '[id*="ventricle"]', '[id*="blue"]'],
  mappingAtlas: ['[id$="layer-MC3"]', '[id*="mc3"]', '[id*="mapping"]'],
  subdivision: ['[id$="layer-subdivision"]', '[id*="subdivision"]', '[id*="color"]'],
  yellowMask: ['[id$="layer-yellow"]', '[id*="yellow"]', '[id*="mask"]'],
  physicalCoords: ['[id$="layer-phys"]', '[id*="physical"]', '[id*="coord"]'],
};

/* ───────────────────────────────────────────────────────────
   Map Pane
   ─────────────────────────────────────────────────────────── */
const LEVELS = [22, 23, 24, 25, 26, 27, 28, 29, 30];
const PEN_COLORS = [
  '#111827',
  '#4b5563',
  '#000000',
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#ef4444',
  '#6366f1',
  '#0ea5e9',
  '#f43f5e',
  '#10b981',
  '#a855f7',
  '#f97316',
];

function MapPane({
  map,
  onChange,
  onRemove,
  onFocus,
  focused,
}: {
  map: MapEmbed;
  onChange: (patch: Partial<MapEmbed>) => void;
  onRemove: () => void;
  onFocus: (id: string) => void;
  focused: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [level, setLevel] = useState<number>(map.level ?? 29);

  // selections + notes
  const [selectedText, setSelectedText] = useState<string | null>(map.selectedRegion ?? null);
  const [selectedTiles, setSelectedTiles] = useState<Set<string>>(new Set(map.selectedTiles ?? []));
  const [noteTitle, setNoteTitle] = useState<string>(map.noteTitle ?? '');
  const [noteDetails, setNoteDetails] = useState<string>(map.noteDetails ?? '');
  const selectedTilesRef = useRef<Set<string>>(selectedTiles);
  useEffect(() => {
    selectedTilesRef.current = selectedTiles;
  }, [selectedTiles]);

  // per-map layers
  const layers: LayerState = useMemo(
    () => ({ ...DEFAULT_LAYERS, ...(map.layers ?? {}) }),
    [map.layers],
  );

  // rect highlight + color
  const [hlColor, setHlColor] = useState<string>(map.highlightColor ?? '#2563eb');
  const [drawMode, setDrawMode] = useState(false);

  // shape highlights
  const [shapeIds, setShapeIds] = useState<Set<string>>(new Set(map.shapeIds ?? []));
  const shapeIdsRef = useRef<Set<string>>(shapeIds);
  useEffect(() => {
    shapeIdsRef.current = shapeIds;
  }, [shapeIds]);

  // pencil / eraser
  const [penEnabled, setPenEnabled] = useState(false);
  const [penErase, setPenErase] = useState(false);
  const [penColor, setPenColor] = useState<string>(map.penColor ?? '#4b5563'); // pencil gray
  const [penWidth, setPenWidth] = useState<number>(map.penWidth ?? 2);
  const [showPalette, setShowPalette] = useState(false);

  // persist upward
  useEffect(() => {
    onChange({
      selectedRegion: selectedText ?? null,
      selectedTiles: Array.from(selectedTiles),
      noteTitle,
      noteDetails,
      highlightColor: hlColor,
      shapeIds: Array.from(shapeIds),
      penColor,
      penWidth,
    });
  }, [selectedText, selectedTiles, noteTitle, noteDetails, hlColor, shapeIds, penColor, penWidth]); // eslint-disable-line

  const ACCENT = '#2563eb';

  const applyLayerVisibility = (
    gSelection: d3.Selection<SVGGElement, unknown, null, undefined>,
  ) => {
    (Object.keys(LAYER_QUERIES) as LayerKey[]).forEach(k => {
      const want = layers[k];
      const sel = gSelection.selectAll<SVGGElement, unknown>(LAYER_QUERIES[k].join(','));
      if (!sel.empty()) sel.attr('style', want ? 'display: inline' : 'display: none');
    });
  };

  // namespace + render svg
  useEffect(() => {
    const svgNode = svgRef.current;
    if (!svgNode) return;
    const svgSel = d3.select(svgNode);
    svgSel.selectAll('*').remove();
    svgSel.attr('width', '100%').attr('height', '100%').style('touch-action', 'none');

    const g = svgSel.append('g');
    gRef.current = g.node();

    // center/fit helper
    const centerFit = () => {
      if (!svgRef.current || !gRef.current || !zoomRef.current) return;
      const cw = svgRef.current.clientWidth || MAP_BOX_PX;
      const ch = svgRef.current.clientHeight || MAP_BOX_PX;
      const bbox = (gRef.current as SVGGElement).getBBox();
      if (
        !isFinite(bbox.width) ||
        !isFinite(bbox.height) ||
        bbox.width === 0 ||
        bbox.height === 0
      )
        return;
      const margin = 0.88;
      const scale = Math.min((cw * margin) / bbox.width, (ch * margin) / bbox.height);
      const tx = (cw - bbox.width * scale) / 2 - bbox.x * scale;
      const ty = (ch - bbox.height * scale) / 2 - bbox.y * scale;
      const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
      (svgSel as any).transition().duration(250).call((zoomRef.current as any).transform, t);
      onChange({ transform: { k: t.k, x: t.x, y: t.y } });
    };

    const url = `/levels/level-${level}.svg`;
    d3.xml(url).then(data => {
      const foreignRoot = data.documentElement as unknown as SVGSVGElement;
      const gSelection = d3.select(gRef.current!);

      // inject
      gSelection.html(foreignRoot.innerHTML);
      gSelection.selectAll('style').remove(); // prevent bleed

      // namespace ids
      const prefix = `m-${map.id}-`;
      const idMap = new Map<string, string>();
      (gRef.current as SVGGElement).querySelectorAll('[id]').forEach(el => {
        const oldId = el.getAttribute('id')!;
        const newId = `${prefix}${oldId}`;
        idMap.set(oldId, newId);
        el.setAttribute('id', newId);
      });
      const fixAttr = (el: Element, attr: string) => {
        const val = el.getAttribute(attr);
        if (!val) return;
        let next = val.replace(/url\(#([^)]+)\)/g, (_, id) =>
          idMap.has(id) ? `url(#${idMap.get(id)})` : `url(#${id})`,
        );
        next = next.replace(/^#(.+)$/, (m, id) =>
          idMap.has(id) ? `#${idMap.get(id)}` : m,
        );
        if (next !== val) el.setAttribute(attr, next);
      };
      (gRef.current as SVGGElement).querySelectorAll<SVGElement>('*').forEach(el => {
        [
          'clip-path',
          'mask',
          'filter',
          'fill',
          'stroke',
          'marker-start',
          'marker-mid',
          'marker-end',
          'href',
          'xlink:href',
          'style',
        ].forEach(a => fixAttr(el, a));
      });

      /* NEW: Clean baseline — show *only* the atlas layer by default (no grid/lines) */
      const cleanBaselineToAtlas = () => {
        const root = gRef.current as SVGGElement;
        if (!root) return;
        const allGroups = Array.from(root.querySelectorAll<SVGGElement>('g'));
        allGroups.forEach(grp => ((grp as any).style.display = 'none'));

        const atlasGroup =
          (root.querySelector<SVGGElement>('[id$="layer-MC3"]') as SVGGElement | null) ||
          (root.querySelector<SVGGElement>('[id*="mc3"]') as SVGGElement | null) ||
          (root.querySelector<SVGGElement>('[id*="mapping"]') as SVGGElement | null) ||
          (root.querySelector<SVGGElement>('[id*="atlas"]') as SVGGElement | null);

        if (atlasGroup) {
          (atlasGroup as any).style.display = 'inline';
          return;
        }

        // Fallback: show the largest group by visual bbox (usually the base drawing).
        let best: SVGGElement | null = null;
        let bestArea = -1;
        for (const grp of allGroups) {
          try {
            const bb = (grp as any).getBBox?.();
            const area = bb ? bb.width * bb.height : 0;
            if (area > bestArea) {
              best = grp;
              bestArea = area;
            }
          } catch {}
        }
        if (best) (best as any).style.display = 'inline';
      };
      cleanBaselineToAtlas();

      // apply layer vis (keeps your per-map toggles on top of the clean baseline)
      applyLayerVisibility(gSelection);

      // clickable labels
      gSelection
        .selectAll('text')
        .attr('fill', '#000')
        .style('cursor', 'pointer')
        .on('mouseover', function () {
          d3.select(this).attr('fill', ACCENT);
        })
        .on('mouseout', function () {
          const el = d3.select(this);
          if (el.text() !== (selectedText || '')) el.attr('fill', '#000');
        })
        .on('click', function () {
          const clicked = d3.select(this).text();
          setSelectedText(prev => (prev === clicked ? null : clicked));
          gSelection.selectAll('text').attr('fill', '#000');
          if (clicked) {
            gSelection
              .selectAll('text')
              .filter(function () {
                return d3.select(this).text() === clicked;
              })
              .attr('fill', ACCENT);
          }
        });

      // tiles (grid) — rects
      const grid = gSelection.select('[id$="layer-grid"], [id*="grid"]');
      if (!grid.empty()) {
        const tiles = grid.selectAll<SVGRectElement, unknown>('rect');
        const paint = (set: Set<string>) => {
          tiles.each(function () {
            const t = d3.select(this);
            const id = t.attr('id') || '';
            const active = id && set.has(id);
            t.style('stroke', active ? (hlColor || ACCENT) : '')
              .style('stroke-width', active ? '3' : '0')
              .style('fill', active ? hexToRgba(hlColor, 0.25) : 'transparent');
          });
          if (set.size > 0) grid.attr('style', 'display: inline');
        };
        tiles
          .style('cursor', 'pointer')
          .on('click', function (event: any) {
            event.stopPropagation(); // avoid generic handler below
            const id = d3.select(this).attr('id') || 'unknown';
            setSelectedTiles(prev => {
              const next = new Set(prev);
              if (event.shiftKey) {
                next.has(id) ? next.delete(id) : next.add(id);
              } else {
                next.clear();
                next.add(id);
              }
              paint(next);
              return next;
            });
          });
        // restore selected tiles
        if (selectedTilesRef.current.size) paint(selectedTilesRef.current);
      }

      // GENERIC SHAPE CLICK — works for all visible layers (skip while drawing)
      const isInGrid = (el: Element | null) => {
        let node: Element | null = el;
        while (node) {
          const id = (node as HTMLElement).id || '';
          if (/layer-?grid/i.test(id) || /(^|-)grid($|-)/i.test(id)) return true;
          node = node.parentElement;
        }
        return false;
      };
      gSelection
        .selectAll<SVGElement, unknown>('path,polygon,polyline,rect,circle,ellipse,line')
        .style('cursor', 'pointer')
        .on('click', function (event: any) {
          if (isInGrid(this)) return;
          if (penEnabled || penErase || drawMode) return;
          const el = this as SVGElement;
          let sid = el.getAttribute('id');
          if (!sid) {
            sid = `m-${map.id}-auto-${crypto.randomUUID()}`;
            el.setAttribute('id', sid);
          }
          setShapeIds(prev => {
            const next = new Set(prev);
            if (event.shiftKey) {
              next.has(sid!) ? next.delete(sid!) : next.add(sid!);
            } else {
              if (next.size === 1 && next.has(sid!)) {
                next.delete(sid!);
              } else {
                next.clear();
                next.add(sid!);
              }
            }
            return next;
          });
          event.stopPropagation();
        });

      // zoom/pan
      const zoom = d3
        .zoom<SVGSVGElement, unknown>()

        .scaleExtent([0.25, 6])
        .on('zoom', ev => {
          d3.select(gRef.current).attr('transform', ev.transform as any);
          onChange({
            transform: {
              k: (ev.transform as any).k,
              x: (ev.transform as any).x,
              y: (ev.transform as any).y,
            },
          });
        });
      svgSel.call(zoom as any);
      zoomRef.current = zoom;

      const t = map.transform;
      if (t && typeof t.k === 'number') {
        (svgSel as any).call(
          (zoom as any).transform,
          d3.zoomIdentity.translate(t.x, t.y).scale(t.k),
        );
      } else {
        centerFit();
      }

      // keep selected label tinted
      if (selectedText) {
        gSelection
          .selectAll('text')
          .filter(function () {
            return d3.select(this).text() === selectedText;
          })
          .attr('fill', ACCENT);
      }

      // Draw saved rectangles
      const ensureRectLayer = () => {
        let hl = gSelection.select<SVGGElement>('#loop-hl-layer');
        if (hl.empty())
          hl = gSelection
            .append('g')
            .attr('id', 'loop-hl-layer') as d3.Selection<
            SVGGElement,
            unknown,
            null,
            undefined
          >;
        return hl;
      };
      const drawRects = () => {
        const hl = ensureRectLayer();
        const dataRects = map.highlights || [];
        const sel = hl
          .selectAll<SVGRectElement, HighlightRect>('rect.loop-hl')
          .data(dataRects as any, (d: any, i: number) => d?.id ?? `k${i}`);
        sel
          .enter()
          .append('rect')
          .attr('class', 'loop-hl')
          .attr('rx', 2)
          .attr('ry', 2)
          .style('stroke', hlColor || ACCENT)
          .style('stroke-width', 1.2 as any)
          .style('cursor', 'pointer')
          .merge(sel as any)
          .attr('x', (d: any) => d.x)
          .attr('y', (d: any) => d.y)
          .attr('width', (d: any) => d.w)
          .attr('height', (d: any) => d.h)
          .style('fill', (d: any) => d.color)
          .on('click', (e: MouseEvent, d: any) => {
            if (e.altKey || e.metaKey || e.shiftKey) {
              const next = (map.highlights || []).filter(h => h.id !== d.id);
              onChange({ highlights: next });
            }
          });
        sel.exit().remove();
      };
      drawRects();

      // Rect draw mode
      const toWorld = (px: number, py: number) => {
        const tr = d3.zoomTransform(svgNode);
        return {
          x: (px - (tr as any).x) / (tr as any).k,
          y: (py - (tr as any).y) / (tr as any).k,
        };
      };
      const beginDraw = (ev: PointerEvent) => {
        if (!drawMode) return;
        ev.stopPropagation();
        ev.preventDefault();
        const gSelection = d3.select(gRef.current!);
        const hl = gSelection.select('#loop-hl-layer').empty()
          ? (gSelection.append('g').attr('id', 'loop-hl-layer') as any)
          : gSelection.select('#loop-hl-layer');
        const [sx, sy] = d3.pointer(ev, svgNode);
        const s = toWorld(sx, sy);
        const temp = hl
          .append('rect')
          .attr('class', 'loop-hl drawing')
          .attr('x', s.x)
          .attr('y', s.y)
          .attr('width', 0)
          .attr('height', 0)
          .attr('rx', 2)
          .attr('ry', 2)
          .style('fill', hexToRgba(hlColor, 0.22))
          .style('stroke', hlColor || ACCENT)
          .style('stroke-width', 1.2 as any)
          .style('pointer-events', 'none');

        const move = (mv: PointerEvent) => {
          const [mx, my] = d3.pointer(mv, svgNode);
          const m = toWorld(mx, my);
          const x = Math.min(m.x, s.x);
          const y = Math.min(m.y, s.y);
          const w = Math.abs(m.x - s.x);
          const h = Math.abs(m.y - s.y);
          temp.attr('x', x).attr('y', y).attr('width', w).attr('height', h);
        };
        const up = (upEv: PointerEvent) => {
          window.removeEventListener('pointermove', move, true);
          window.removeEventListener('pointerup', up, true);
          const [ux, uy] = d3.pointer(upEv, svgNode);
          const u = toWorld(ux, uy);
          const x = Math.min(u.x, s.x);
          const y = Math.min(u.y, s.y);
          const w = Math.abs(u.x - s.x);
          const h = Math.abs(u.y - s.y);
          temp.remove();
          if (w < 2 || h < 2) return;
          const rect: HighlightRect = {
            id: crypto.randomUUID(),
            x,
            y,
            w,
            h,
            color: hexToRgba(hlColor, 0.22),
          };
          onChange({ highlights: [...(map.highlights || []), rect] });
        };
        window.addEventListener('pointermove', move, true);
        window.addEventListener('pointerup', up, true);
      };
      svgNode.addEventListener('pointerdown', beginDraw, { passive: false });

      // cleanup for this load
      return () => {
        svgNode.removeEventListener('pointerdown', beginDraw);
      };
    });

    // recenter on resize if no saved transform
    const ro = new ResizeObserver(() => {
      if (!map.transform && svgRef.current && zoomRef.current && gRef.current) {
        const cw = svgRef.current.clientWidth || MAP_BOX_PX;
        const ch = svgRef.current.clientHeight || MAP_BOX_PX;
        const bbox = (gRef.current as SVGGElement).getBBox();
        if (isFinite(bbox.width) && bbox.width > 0) {
          const margin = 0.88;
          const scale = Math.min((cw * margin) / bbox.width, (ch * margin) / bbox.height);
          const tx = (cw - bbox.width * scale) / 2 - bbox.x * scale;
          const ty = (ch - bbox.height * scale) / 2 - bbox.y * scale;
          const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
          (d3.select(svgRef.current) as any).call(
            (zoomRef.current as any).transform,
            t,
          );
        }
      }
    });
    if (svgNode?.parentElement) ro.observe(svgNode.parentElement);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  /* Recolor existing tile/shape highlights when color changes */
  useEffect(() => {
    if (gRef.current) {
      const gSel = d3.select(gRef.current);
      const grid = gSel.select('[id$="layer-grid"], [id*="grid"]');
      if (!grid.empty()) {
        const tiles = grid.selectAll<SVGRectElement, unknown>('rect');
        tiles.each(function () {
          const t = d3.select(this);
          const id = t.attr('id') || '';
          const active = id && selectedTilesRef.current.has(id);
          t.style('stroke', active ? (hlColor || '#2563eb') : '')
            .style('stroke-width', active ? '3' : '0')
            .style('fill', active ? hexToRgba(hlColor, 0.25) : 'transparent');
        });
      }
    }
  }, [hlColor]);

  /* Render/refresh overlaid shape highlights */
  useEffect(() => {
    if (!gRef.current) return;
    const gSel = d3.select(gRef.current);
    let layer = gSel.select<SVGGElement>('#loop-hl-shapes');
    if (layer.empty())
      layer = gSel
        .append('g')
        .attr('id', 'loop-hl-shapes')
        .style('pointer-events', 'none') as any;

    layer.selectAll('*').remove();

    shapeIds.forEach(sid => {
      const target = (gRef.current as SVGGElement).querySelector<SVGElement>(
        `#${cssEscape(sid)}`,
      );
      if (!target) return;
      const tag = target.tagName.toLowerCase();
      const clone = target.cloneNode(true) as SVGElement;
      clone.removeAttribute('id');
      (clone.style as any).pointerEvents = 'none';

      const strokeable = /^(path|polyline|line|polygon|rect|circle|ellipse)$/i.test(tag);
      if (strokeable) {
        clone.setAttribute('stroke', hlColor);
        clone.setAttribute('stroke-width', '2.2');
      }
      if (/^(path|polygon|rect|circle|ellipse)$/i.test(tag)) {
        clone.setAttribute('fill', hexToRgba(hlColor, 0.25));
      } else {
        clone.setAttribute('fill', 'none');
      }

      const node = layer.node() as unknown as SVGGElement | null;
      if (node) node.appendChild(clone);
    });
  }, [shapeIds, hlColor]);

  /* Re-apply layer visibility when toggles change */
  useEffect(() => {
    if (!gRef.current) return;
    const gSel = d3.select(gRef.current);
    (Object.keys(LAYER_QUERIES) as LayerKey[]).forEach(k => {
      const want = layers[k];
      const selectors = LAYER_QUERIES[k].join(',');
      const sel = gSel.selectAll<SVGGElement, unknown>(selectors);
      if (!sel.empty()) sel.attr('style', want ? 'display: inline' : 'display: none');
    });
  }, [layers]);

  /* Render saved freehand strokes */
  useEffect(() => {
    if (!gRef.current) return;
    const gSel = d3.select(gRef.current);
    let layer = gSel.select<SVGGElement>('#loop-pen-strokes');
    if (layer.empty())
      layer = gSel.append('g').attr('id', 'loop-pen-strokes') as any;

    const data = map.freehand || [];
    const sel = layer
      .selectAll<SVGPathElement, FreehandStroke>('path.freehand')
      .data(data as any, (d: any, i: number) => d?.id ?? `k${i}`);
    sel
      .enter()
      .append('path')
      .attr('class', 'freehand')
      .attr('fill', 'none')
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')
      .merge(sel as any)
      .attr('d', (d: any) => d.d)
      .attr('stroke', (d: any) => d.color)
      .attr('stroke-width', (d: any) => String(d.width))
      .attr('opacity', 0.96 as any)
      .attr('data-id', (d: any) => d.id);
    sel.exit().remove();
  }, [map.freehand]);

  /* Freehand & Eraser drawing handlers */
  useEffect(() => {
    const svgNode = svgRef.current;
    if (!svgNode) return;
    const gSel = d3.select(gRef.current!);

    const toWorld = (px: number, py: number) => {
      const tr = d3.zoomTransform(svgNode);
      return {
        x: (px - (tr as any).x) / (tr as any).k,
        y: (py - (tr as any).y) / (tr as any).k,
      };
    };
    const ensurePenLayer = () => {
      let layer = gSel.select<SVGGElement>('#loop-pen-strokes');
      if (layer.empty()) layer = gSel.append('g').attr('id', 'loop-pen-strokes') as any;
      return layer;
    };

    let drawing = false;
    let dStr = '';
    let path: d3.Selection<SVGPathElement, unknown, null, undefined> | null = null;

    const down = (ev: PointerEvent) => {
      if (!penEnabled && !penErase) return;
      ev.preventDefault();
      ev.stopPropagation();

      if (penErase) {
        // erase by clicking/dragging over strokes
        tryErase(ev);
        window.addEventListener('pointermove', tryErase, true);
        const upErase = () => {
          window.removeEventListener('pointermove', tryErase, true);
          window.removeEventListener('pointerup', upErase, true);
        };
        window.addEventListener('pointerup', upErase, true);
        return;
      }

      // draw mode
      const [sx, sy] = d3.pointer(ev, svgNode);
      const s = toWorld(sx, sy);
      dStr = `M ${s.x} ${s.y}`;
      const layer = ensurePenLayer();
      path = layer
        .append('path')
        .attr('class', 'freehand temp')
        .attr('fill', 'none')
        .attr('stroke', penColor)
        .attr('stroke-width', String(penWidth))
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .attr('opacity', 0.96 as any)
        .attr('d', dStr);
      drawing = true;
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
    };
    const move = (ev: PointerEvent) => {
      if (!drawing || !path) return;
      const [mx, my] = d3.pointer(ev, svgNode);
      const m = toWorld(mx, my);
      dStr += ` L ${m.x} ${m.y}`;
      path.attr('d', dStr);
    };
    const up = () => {
      if (!drawing) return;
      drawing = false;
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      if (path) {
        path.classed('temp', false);
        const stroke: FreehandStroke = {
          id: crypto.randomUUID(),
          color: penColor,
          width: penWidth,
          d: dStr,
        };
        onChange({ freehand: [...(map.freehand || []), stroke] });
        path = null;
      }
    };

    const tryErase = (ev: PointerEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      // Only erase freehand paths
      if (
        target.tagName.toLowerCase() === 'path' &&
        (target as any).classList?.contains('freehand')
      ) {
        const idAttr = (target as any).getAttribute('data-id');
        if (!idAttr) return;
        const next = (map.freehand || []).filter(s => s.id !== idAttr);
        onChange({ freehand: next });
        (target as any).remove();
      }
    };

    svgNode.addEventListener('pointerdown', down, { passive: false });
    return () => {
      svgNode.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
    };
  }, [penEnabled, penErase, penColor, penWidth, map.freehand]);

  useEffect(() => {
    if (svgRef.current) {
      const c = penEnabled ? 'crosshair' : penErase ? 'crosshair' : 'default';
      (svgRef.current as SVGSVGElement).style.cursor = c;
    }
  }, [penEnabled, penErase]);

  const handleLevelChange = (lvl: number) => {
    setLevel(lvl);
    setSelectedText(null);
    setSelectedTiles(new Set());
    setShapeIds(new Set());
    onChange({ level: lvl, selectedRegion: null, selectedTiles: [], shapeIds: [] });
  };

  const handleRecenter = () => {
    const svgNode = svgRef.current;
    const zoom = zoomRef.current;
    if (!svgNode || !zoom || !gRef.current) return;
    const svgSel = d3.select(svgNode);
    const cw = svgNode.clientWidth || MAP_BOX_PX;
    const ch = svgNode.clientHeight || MAP_BOX_PX;
    const bbox = (gRef.current as SVGGElement).getBBox();
    if (!isFinite(bbox.width) || bbox.width === 0) return;
    const margin = 0.88;
    const scale = Math.min((cw * margin) / bbox.width, (ch * margin) / bbox.height);
    const tx = (cw - bbox.width * scale) / 2 - bbox.x * scale;
    const ty = (ch - bbox.height * scale) / 2 - bbox.y * scale;
    const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
    (svgSel as any).transition().duration(250).call((zoom as any).transform, t);
    onChange({
      transform: {
        k: (t as any).k,
        x: (t as any).x,
        y: (t as any).y,
      },
    });
  };

  // tile helpers
  const clearTileHighlights = () => {
    setSelectedTiles(new Set());
    if (!gRef.current) return;
    const gSel = d3.select(gRef.current);
    const grid = gSel.select('[id$="layer-grid"], [id*="grid"]');
    if (!grid.empty())
      grid
        .selectAll('rect')
        .style('fill', 'transparent')
        .style('stroke', '')
        .style('stroke-width', '');
  };
  const selectAllTiles = () => {
    if (!gRef.current) return;
    const gSel = d3.select(gRef.current);
    const grid = gSel.select('[id$="layer-grid"], [id*="grid"]');
    if (grid.empty()) return;
    const ids: string[] = [];
    grid.selectAll<SVGRectElement, unknown>('rect').each(function () {
      const id = d3.select(this).attr('id') || '';
      if (id) ids.push(id);
    });
    const set = new Set(ids);
    setSelectedTiles(set);
    grid
      .selectAll<SVGRectElement, unknown>('rect')
      .style('fill', hexToRgba(hlColor, 0.25))
      .style('stroke', hlColor || '#2563eb')
      .style('stroke-width', '3');
    grid.attr('style', 'display: inline');
  };
  const clearSectionRects = () => onChange({ highlights: [] });

  // icon button component
  const IconBtn = ({
    title,
    onClick,
    active = false,
    children,
  }: {
    title: string;
    onClick: () => void;
    active?: boolean;
    children: React.ReactNode;
  }) => (
    <button
      onClick={onClick}
      title={title}
      className={`ml-1 rounded px-1.5 py-1 ${
        active ? 'bg-white/30' : 'bg-white/10 hover:bg-white/20'
      }`}
    >
      {children}
    </button>
  );

  return (
    <div
      className="border border-black/10 rounded-lg overflow-hidden bg-white"
      onPointerDown={() => onFocus(map.id)}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-2 py-1 text-xs ${
          focused ? 'bg-black/80' : 'bg-black/60'
        } text-white`}
      >
        <div className="flex items-center gap-2">
          <span className="opacity-80">{map.title || 'Map'}</span>
          <span className="opacity-60">Level:</span>
          <select
            value={level}
            onChange={e => handleLevelChange(Number(e.target.value))}
            className="rounded bg-white text-black px-1 py-0.5"
          >
            {LEVELS.map(lvl => (
              <option key={lvl} value={lvl}>
                {lvl}
              </option>
            ))}
          </select>
          <button
            onClick={handleRecenter}
            className="ml-2 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20"
            title="Recenter"
          >
            Recenter
          </button>

          {/* HL color */}
          <span className="ml-3 opacity-70">HL:</span>
          <select
            value={hlColor}
            onChange={e => setHlColor(e.target.value)}
            className="rounded bg-white text-black px-1 py-0.5"
            title="Highlight color"
          >
            <option value="#2563eb">Blue</option>
            <option value="#16a34a">Green</option>
            <option value="#f59e0b">Yellow</option>
            <option value="#ef4444">Red</option>
            <option value="#6366f1">Indigo</option>
            <option value="#0ea5e9">Cyan</option>
            <option value="#f43f5e">Rose</option>
          </select>

          {/* Icons only cluster */}
          {/* Rectangle highlight toggle */}
          <IconBtn
            title={drawMode ? 'Exit rectangle highlight' : 'Rectangle highlight'}
            onClick={() => {
              setDrawMode(v => {
                if (!v) {
                  setPenEnabled(false);
                  setPenErase(false);
                }
                return !v;
              });
            }}
            active={drawMode}
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
          </IconBtn>
          {/* Clear rect highlights */}
          <IconBtn title="Clear highlights" onClick={clearSectionRects}>
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path d="M7 7l10 10" />
            </svg>
          </IconBtn>

          {/* Pencil (toggle) */}
          <IconBtn
            title={penEnabled ? 'Disable pencil' : 'Pencil'}
            onClick={() => {
              setPenEnabled(v => {
                if (!v) {
                  setDrawMode(false);
                  setPenErase(false);
                }
                return !v;
              });
            }}
            active={penEnabled}
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke={penColor}
              strokeWidth="2"
            >
              <path d="M3 21l3-1 11-11a2 2 0 0 0-3-3L3 17l0 4z" />
            </svg>
          </IconBtn>
          {/* Color dot opens palette */}
          <button
            className="h-4 w-4 rounded-full border border-white/60 ml-1"
            style={{ backgroundColor: penColor }}
            title="Pick pen color"
            onClick={() => setShowPalette(s => !s)}
          />

          {/* Eraser (toggle) */}
          <IconBtn
            title={penErase ? 'Disable eraser' : 'Eraser'}
            onClick={() => {
              setPenErase(v => {
                if (!v) {
                  setPenEnabled(false);
                  setDrawMode(false);
                }
                return !v;
              });
            }}
            active={penErase}
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20 16l-7-7-9 9 3 3h7l6-5z" />
              <path d="M3 22h10" />
            </svg>
          </IconBtn>

          {/* Undo last stroke */}
          <IconBtn
            title="Undo"
            onClick={() => onChange({ freehand: (map.freehand || []).slice(0, -1) })}
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 14l-4-4 4-4" />
              <path d="M5 10h8a6 6 0 1 1 0 12H9" />
            </svg>
          </IconBtn>
        </div>

        <button
          onClick={onRemove}
          className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20"
          title="Remove this map"
        >
          Remove
        </button>
      </div>

      {/* Palette (circular) */}
      {showPalette && (
        <div className="relative">
          <div className="absolute left-2 top-2 z-20">
            <div
              className="relative bg-white/90 rounded-full shadow-lg"
              style={{ width: 140, height: 140 }}
            >
              {PEN_COLORS.map((c, i) => {
                const R = 56;
                const cx = 70 + R * Math.cos((2 * Math.PI * i) / PEN_COLORS.length);
                const cy = 70 + R * Math.sin((2 * Math.PI * i) / PEN_COLORS.length);
                return (
                  <button
                    key={c + i}
                    style={{
                      position: 'absolute',
                      left: cx - 12,
                      top: cy - 12,
                      width: 24,
                      height: 24,
                      borderRadius: '9999px',
                      background: c,
                      border: '2px solid white',
                    }}
                    title={c}
                    onClick={() => {
                      setPenColor(c);
                      setShowPalette(false);
                      onChange({ penColor: c });
                    }}
                  />
                );
              })}
              <button
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full border border-black/20 bg-white/70"
                title="Close"
                onClick={() => setShowPalette(false)}
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map canvas */}
      <div className="w-full" style={{ height: MAP_BOX_PX }}>
        <svg ref={svgRef} className="w-full h-full" />
      </div>

      {/* Notes + small tile actions */}
      <div className="bg-[#1f2733] text-white px-2 pb-2 pt-2 border-t border-black/10">
        <div className="flex gap-2">
          <input
            value={noteTitle}
            onChange={e => setNoteTitle(e.target.value)}
            placeholder="Note Title"
            className="flex-1 rounded-md bg-white text-black text-sm px-3 py-1"
          />
          <input
            value={selectedText ?? ''}
            readOnly
            placeholder="Selected Region"
            className="flex-1 rounded-md bg-white text-black text-sm px-3 py-1"
          />
        </div>
        <div className="mt-2">
          <textarea
            value={noteDetails}
            onChange={e => setNoteDetails(e.target.value)}
            placeholder="Enter details..."
            rows={2}
            className="w-full rounded-md bg-white text-black text-sm px-3 py-2"
          />
        </div>
        <div className="mt-2 text-[11px] text-white/80 flex items-center gap-3">
          <span className="opacity-70">Tiles:</span>
          <button onClick={selectAllTiles} className="underline hover:no-underline">
            Select all
          </button>
          <button onClick={clearTileHighlights} className="underline hover:no-underline">
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────
   Main page
   ─────────────────────────────────────────────────────────── */
export default function LoopsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const initialId = params?.get('id') || null;

  const [docs, setDocs] = useState<LoopPayload[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialId);
  const [data, setData] = useState<LoopPayload>({ ...EMPTY_LOOP });
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [query, setQuery] = useState('');
  const [focusedMapId, setFocusedMapId] = useState<string | null>(null);

  // Seed username from localStorage to avoid "Sign in" flicker on client-side
  const [userId, setUserId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(LS_USERNAME) ?? null;
    } catch {
      return null;
    }
  });
  const [role, setRole] = useState<string | null>(null);
  const [userLoaded, setUserLoaded] = useState(false); // controls when we render GeneralSidebar

  const editorRef = useRef<HTMLDivElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const firstLoadRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch current user so GeneralSidebar can render full nav with a username,
  // NOT the full email. We prefer explicit username fields, then fall back
  // to the local-part of the email (before "@").
  useEffect(() => {
    let cancelled = false;

    const fetchUser = async () => {
      try {
        const res = await fetch('/flask-api/whoami', {
          credentials: 'include',
        });
        if (!res.ok) return;

        const data = await res.json().catch(() => null);
        if (!data) return;

        // Prefer explicit username-like fields
        let displayName: string | null =
          data.username ??
          data.user?.username ??
          data.user_name ??
          data.user?.user_name ??
          data.name ??
          data.user?.name ??
          null;

        // If still nothing, fall back to ID (only if it looks like a username, not an email)
        if (!displayName) {
          const rawId =
            data.user_id ??
            data.id ??
            data.user?.id ??
            null;

          if (rawId && typeof rawId === 'string' && !rawId.includes('@')) {
            displayName = rawId;
          }
        }

        // As a last resort, derive username from email's local-part
        if (!displayName) {
          const email =
            data.email ??
            data.user?.email ??
            data.user_email ??
            null;
          if (email && typeof email === 'string') {
            displayName = email.split('@')[0] || email;
          }
        }

        const r =
          data.role ??
          data.user_role ??
          data.user?.role ??
          null;

        if (!cancelled) {
          if (displayName) {
            setUserId(String(displayName));
            try {
              localStorage.setItem(LS_USERNAME, String(displayName));
            } catch {}
          }
          if (r) setRole(String(r));
        }
      } catch (err) {
        console.error('Failed to fetch user info for LoopsPage', err);
      } finally {
        if (!cancelled) setUserLoaded(true);
      }
    };

    fetchUser();
    return () => {
      cancelled = true;
    };
  }, []);

  // initial load
  useEffect(() => {
    const map = readLocalLoops();
    const list = Object.values(map);
    setDocs(list.sort((a, b) => (a.title || '').localeCompare(b.title || '')));
    const pick = initialId && map[initialId] ? map[initialId] : list[0] ?? null;
    if (pick) {
      setActiveId(pick.docId!);
      setData({ ...EMPTY_LOOP, ...pick });
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML =
            pick.richHtml || escapeForHtml(pick.paragraph || '');
          applyFixedImageSizing(editorRef.current);
        }
      }, 0);
      if (pick.maps && pick.maps[0]) setFocusedMapId(pick.maps[0].id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // when activeId changes
  useEffect(() => {
    if (!activeId) return;
    const map = readLocalLoops();
    const pick = map[activeId];
    if (pick) {
      setData({ ...EMPTY_LOOP, ...pick });
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML =
            pick.richHtml || escapeForHtml(pick.paragraph || '');
          applyFixedImageSizing(editorRef.current);
        }
      }, 0);
      const url = new URL(window.location.href);
      url.searchParams.set('id', activeId);
      router.replace(url.pathname + '?' + url.searchParams.toString());
      if (pick.maps && pick.maps[0]) setFocusedMapId(pick.maps[0].id);
      else setFocusedMapId(null);
    }
  }, [activeId, router]);

  // debounced autosave
  useEffect(() => {
    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      return;
    }
    setStatus('saving');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      const id = await ensureLoopDocId(data);
      updateLocalLoopDoc(id, data);
      const ok = await apiUpdateLoopDoc(id, data);
      setData(d => ({ ...d, docId: id }));
      setStatus(ok ? 'saved' : 'error');
      const map = readLocalLoops();
      setDocs(
        Object.values(map).sort((a, b) =>
          (a.title || '').localeCompare(b.title || ''),
        ),
      );
      saveTimerRef.current = null;
    }, 700);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [data]);

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(d => (d.title || '').toLowerCase().includes(q));
  }, [docs, query]);

  const createDoc = async () => {
    const base: LoopPayload = { ...EMPTY_LOOP, title: 'Untitled' };
    const id = await ensureLoopDocId(base);
    const withId = { ...base, docId: id };
    updateLocalLoopDoc(id, withId);
    setDocs(Object.values(readLocalLoops()));
    setActiveId(id);
    setData(withId);
    setTimeout(() => {
      if (editorRef.current) editorRef.current.innerHTML = '';
    }, 0);
  };

  const deleteDoc = async (docId: string) => {
    const map = readLocalLoops();
    const name = map[docId]?.title || 'Untitled';
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    delete map[docId];
    writeLocalLoops(map);
    await apiDeleteLoopDoc(docId);
    const list = Object.values(readLocalLoops()).sort((a, b) =>
      (a.title || '').localeCompare(b.title || ''),
    );
    setDocs(list);
    const next = list[0]?.docId || null;
    setActiveId(next);
    setData(
      next ? { ...EMPTY_LOOP, ...readLocalLoops()[next] } : { ...EMPTY_LOOP },
    );
  };

  const handleRename = () => {
    const name = prompt('Title', data.title || 'Untitled')?.trim();
    if (!name) return;
    setData(d => ({ ...d, title: name }));
  };

  const onEditorInput = () => {
    const html = editorRef.current?.innerHTML || '';
    const text = editorRef.current?.innerText || '';
    setData(d => ({ ...d, richHtml: html, paragraph: text }));
  };

  const handleImageSelect: React.ChangeEventHandler<HTMLInputElement> = async e => {
  const files = Array.from(e.target.files || []);
  if (!files.length || !editorRef.current) return;

  for (const f of files) {
    const isPdf = f.type === 'application/pdf';

    // Convert to DataURL
    const url = await readFileAsDataURL(f);

    if (isPdf) {
      // INSERT PDF PREVIEW BOX
      const wrapper = document.createElement('div');
      wrapper.className = 'loop-pdf-box';

      wrapper.innerHTML = `
        <div class="loop-pdf-preview">
          <span>📄 ${f.name}</span>
          <span class="loop-pdf-download">Download</span>
        </div>
      `;

      wrapper.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name;
        a.click();
      });

      insertNodeAtCaret(wrapper, editorRef.current);
    } else {
      // IMAGE LOGIC (unchanged)
      const img = document.createElement('img');
      img.src = url;
      img.alt = f.name;
      img.className = 'loop-inline-img';
      img.style.width = `${FIXED_IMG_WIDTH}px`;
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.borderRadius = '8px';
      img.style.display = 'block';
      img.style.margin = '8px 0';
      insertNodeAtCaret(img, editorRef.current);
    }
  }

  onEditorInput();
  e.target.value = '';
};


  const triggerUpload = () => fileInputRef.current?.click();

  // Map helpers
  const addMap = () => {
    setData(d => {
      const current = d.maps ?? [];
      if (current.length >= MAX_MAPS) return d;
      const next: MapEmbed = {
        id: crypto.randomUUID(),
        title: `Map ${current.length + 1}`,
        level: 29,
        transform: null,
        selectedRegion: null,
        selectedTiles: [],
        noteTitle: '',
        noteDetails: '',
        highlights: [],
        highlightColor: '#2563eb',
        layers: { ...DEFAULT_LAYERS },
        shapeIds: [],
        freehand: [],
        penColor: '#4b5563',
        penWidth: 2,
      };
      const arr = [...current, next];
      if (!focusedMapId) setFocusedMapId(next.id);
      return { ...d, maps: arr };
    });
  };
  const removeMap = (id: string) => {
    setData(d => {
      const arr = (d.maps ?? []).filter(m => m.id !== id);
      if (focusedMapId === id) setFocusedMapId(arr[0]?.id ?? null);
      return { ...d, maps: arr };
    });
  };
  const updateMap = (id: string, patch: Partial<MapEmbed>) => {
    setData(d => ({
      ...d,
      maps: (d.maps ?? []).map(m => (m.id === id ? { ...m, ...patch } : m)),
    }));
  };

  const tableSafe = data.table?.length ? data.table : EMPTY_LOOP.table;

  const activeMap =
    (data.maps ?? []).find(m => m.id === focusedMapId) ||
    (data.maps ?? [])[0] ||
    null;
  const activeLayers: LayerState = activeMap
    ? { ...DEFAULT_LAYERS, ...(activeMap.layers ?? {}) }
    : DEFAULT_LAYERS;
  const setLayer = (key: LayerKey, value: boolean) => {
    if (!activeMap) return;
    const next: LayerState = {
      ...DEFAULT_LAYERS,
      ...(activeMap.layers ?? {}),
      [key]: value,
    };
    updateMap(activeMap.id, { layers: next });
  };

  return (
    <div className="h-screen w-full flex flex-col bg-[var(--page-bg)] text-[var(--page-text)]">

      {/* Top navigation bar – only render after we've checked auth once */}
      {userLoaded && <GeneralSidebar user={userId} role={role} />}

      {/* Loops layout under the nav */}
      <div className="flex-1 w-full flex overflow-hidden">
        {/* Sidebar */}
        <aside
  className="w-[280px] shrink-0 bg-[var(--panel-bg)] text-[var(--panel-text)]
             border-r border-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]
             flex flex-col h-full"
>

          <div className="flex items-center justify-between px-3 h-12 border-b border-white/10">
            <div className="font-semibold">Loop Documents</div>
            <Link
              href="/chat"
              className="text-xs px-2 py-1 rounded border border-white/10 hover:bg-white/10"
            >
              Back to chat
            </Link>
          </div>

          <div className="p-3 space-y-3 overflow-y-auto">
            <div className="flex items-center gap-2 bg-white/10 border border-white/10 rounded px-2 py-2">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 opacity-80"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by title…"
                className="bg-transparent outline-none text-sm flex-1
           text-[var(--panel-text)]
           placeholder-[color-mix(in_oklab,var(--panel-text)_50%,transparent)]"

              />
            </div>

            <button
              onClick={createDoc}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md
              bg-[var(--panel-bg)]
              text-[var(--panel-text)]
              border border-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]
              hover:bg-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]
              text-sm
              "
            >
              + New document
            </button>

            {/* Slightly more space before layers */}
            <div className="pt-1 max-h-[calc(100vh-420px)] overflow-y-auto">
              <ul className="space-y-1">
                {filteredDocs.map(d => {
                  const active = d.docId === activeId;
                  return (
                    <li key={d.docId} className="group relative">
                      <button
                        onClick={() => setActiveId(d.docId!)}
                        className={`w-full text-left px-3 py-2 rounded-md truncate ${
                          active ? 'bg-white/15' : 'hover:bg-white/10'
                        }`}
                        title={d.title || 'Untitled'}
                      >
                        <div className="font-medium text-sm">
                          {d.title || 'Untitled'}
                        </div>
                      </button>
                      <button
                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-white/80 hover:text-white"
                        title="Delete"
                        onClick={e => {
                          e.stopPropagation();
                          if (d.docId) deleteDoc(d.docId);
                        }}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="16"
                          height="16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M3 6h18" />
                          <path d="M8 6v14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6l1-2h4l1 2" />
                        </svg>
                      </button>
                    </li>
                  );
                })}
                {!filteredDocs.length && (
                  <li className="text-white/60 text-sm px-3 py-2">
                    No documents found.
                  </li>
                )}
              </ul>
            </div>

            {/* Layer Selection (applies to focused map) */}
            <div className="mt-6 pt-3 border-t border-white/10">
              <div className="text-lg font-semibold mb-2">Layer Selection</div>

              <div className="space-y-2 text-[14px]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!activeLayers.gridSolid}
                    onChange={e => setLayer('gridSolid', e.target.checked)}
                  />
                  <span>Grid – Solid</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!activeLayers.stCoordinates}
                    onChange={e =>
                      setLayer('stCoordinates', e.target.checked)
                    }
                  />
                  <span>Stereotaxic Coordinates</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!activeLayers.box3d}
                    onChange={e => setLayer('box3d', e.target.checked)}
                  />
                  <span>Box for Database/3D Model</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!activeLayers.nissl}
                    onChange={e => setLayer('nissl', e.target.checked)}
                  />
                  <span>Nissl‑Stain</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!activeLayers.blueVentricle}
                    onChange={e =>
                      setLayer('blueVentricle', e.target.checked)
                    }
                  />
                  <span>Blue Ventricle Overlay</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!activeLayers.mappingAtlas}
                    onChange={e =>
                      setLayer('mappingAtlas', e.target.checked)
                    }
                  />
                  <span>Mapping Atlas</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!activeLayers.subdivision}
                    onChange={e =>
                      setLayer('subdivision', e.target.checked)
                    }
                  />
                  <span>Subdivision Color Coding</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!activeLayers.yellowMask}
                    onChange={e =>
                      setLayer('yellowMask', e.target.checked)
                    }
                  />
                  <span>Yellow Mask</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!activeLayers.physicalCoords}
                    onChange={e =>
                      setLayer('physicalCoords', e.target.checked)
                    }
                  />
                  <span>Physical Coordinates</span>
                </label>

                <div className="text-xs text-white/60 mt-2">
                  Editing:{' '}
                  {activeMap ? activeMap.title ?? 'Map' : '— Select a map —'}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main editor */}
        <main className="flex-1 min-w-0 min-h-0 p-6 overflow-auto">
          {!activeId ? (
            <div className="text-black/60">Select or create a document.</div>
          ) : (
            <div className="rounded-xl
            bg-[var(--panel-bg)]
            text-[var(--page-text)]
            border border-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]
            shadow-sm">
              {/* Header */}
              <div className="px-4 py-3 flex items-center gap-2
              bg-[var(--panel-bg)]
              text-[var(--page-text)]
              border-b border-[color-mix(in_oklab,var(--panel-text)_10%,transparent)]">
                <span className="inline-grid h-6 w-6 place-items-center rounded bg-indigo-600 text-white text-xs font-bold">
                  L
                </span>
                <div className="font-semibold">{data.title || 'Untitled'}</div>
                <button
                  onClick={handleRename}
                  className="ml-2 text-xs px-2 py-1 rounded border border-black/10 hover:bg-black/5"
                >
                  Rename
                </button>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-black/60">
                    {fmtStatus(status)}
                  </span>
                  {data.activeTool === 'Paragraph' && (
                    <>
                      <button
                        onClick={triggerUpload}
                        className="text-xs px-2 py-1 rounded border border-black/10 hover:bg-black/5"
                        title="Insert image in paragraph"
                      >
                        Upload image
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={handleImageSelect}
                        multiple
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Toolbar */}
              <div className="px-4 py-3 border-b border-black/10">
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      'Paragraph',
                      'Table',
                      'Bulleted list',
                      'Checklist',
                      'Task list',
                      'Numbered list',
                    ] as LoopTool[]
                  ).map(t => (
                    <button
                      key={t}
                      className={`px-3 py-2 rounded-md border text-sm ${
                        data.activeTool === t
                          ? 'border-indigo-300 bg-indigo-50'
                          : 'border-black/10 hover:bg-black/5'
                      }`}
                      onClick={() =>
                        setData(d => ({ ...d, activeTool: t }))
                      }
                    >
                      {t}
                    </button>
                  ))}
                  <span className="mx-2 h-5 w-px bg-black/10" />
                  {/* NEW: Add file button */}
                  <button
                  onClick={triggerUpload}
                  className="text-sm px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
                  title="Insert file (image or PDF)"
                  >
                  Add a file
                  </button>

                  <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={handleImageSelect}
                  multiple
                  />
                  <button
                    onClick={addMap}
                    className="text-sm px-2 py-1 rounded border border-black/10 hover:bg-black/5"
                    disabled={(data.maps?.length ?? 0) >= MAX_MAPS}
                    title="Add an embedded atlas map (up to 4)"
                  >
                    Add a map
                  </button>
                  {(data.maps?.length ?? 0) >= MAX_MAPS && (
                    <span className="text-xs text-black/50">
                      (limit reached)
                    </span>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="p-4 space-y-6">
                {!!(data.maps && data.maps.length) && (
                  <div
                    className="gap-6"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${
                        (data.maps?.length || 0) <= 1 ? 1 : 2
                      }, minmax(0, 1fr))`,
                    }}
                  >
                    {(data.maps ?? []).map(m => (
                      <MapPane
                        key={m.id}
                        map={m}
                        onChange={patch => updateMap(m.id, patch)}
                        onRemove={() => removeMap(m.id)}
                        onFocus={id => setFocusedMapId(id)}
                        focused={focusedMapId === m.id}
                      />
                    ))}
                  </div>
                )}

                {data.activeTool === 'Paragraph' && (
                  <div
                    ref={editorRef}
                    contentEditable
                    className="loop-editor min-h-[420px] outline-none text-[15px] leading-relaxed paragraph-hint"
                    data-placeholder="Share ideas with Loop. Just start typing…"
                    onInput={onEditorInput}
                  />
                )}

                {data.activeTool === 'Table' && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-separate border-spacing-0 rounded-lg overflow-hidden">
                      <thead>
                        <tr>
                          {tableSafe[0].map((h, ci) => (
                            <th
                              key={ci}
                              className="bg-black/5 text-left px-3 py-2 border border-black/10"
                            >
                              <input
                                value={h}
                                onChange={e => {
                                  const next = tableSafe.map(r => [...r]);
                                  next[0][ci] = e.target.value;
                                  setData(d => ({ ...d, table: next }));
                                }}
                                className="w-full bg-transparent outline-none"
                              />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableSafe.slice(1).map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => (
                              <td
                                key={ci}
                                className="px-3 py-2 border border-black/10"
                              >
                                <input
                                  value={cell}
                                  onChange={e => {
                                    const next = tableSafe.map(r => [...r]);
                                    next[ri + 1][ci] = e.target.value;
                                    setData(d => ({ ...d, table: next }));
                                  }}
                                  className="w-full bg-transparent outline-none"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex gap-2 mt-3">
                      <button
                        className="px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
                        onClick={() =>
                          setData(d => ({
                            ...d,
                            table: [
                              ...tableSafe,
                              new Array(tableSafe[0].length).fill(''),
                            ],
                          }))
                        }
                      >
                        + Row
                      </button>
                      <button
                        className="px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
                        onClick={() =>
                          setData(d => ({
                            ...d,
                            table: tableSafe.map((r, i) =>
                              i === 0
                                ? [...r, `Column ${r.length + 1}`]
                                : [...r, ''],
                            ),
                          }))
                        }
                      >
                        + Column
                      </button>
                    </div>
                  </div>
                )}

                {data.activeTool === 'Bulleted list' && (
                  <div>
                    <ul className="space-y-2">
                      {(data.bulleted ?? []).map((it, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span>•</span>
                          <input
                            value={it ?? ''}
                            onChange={e =>
                              setData(d => ({
                                ...d,
                                bulleted: (d.bulleted ?? []).map((v, idx) =>
                                  idx === i ? e.target.value : v,
                                ),
                              }))
                            }
                            className="flex-1 bg-transparent outline-none border border-black/10 rounded px-2 py-1"
                          />
                          <button
                            className="text-xs px-2 py-1 border border-black/10 rounded hover:bg-black/5"
                            onClick={() =>
                              setData(d => ({
                                ...d,
                                bulleted: (d.bulleted ?? []).filter(
                                  (_, idx) => idx !== i,
                                ),
                              }))
                            }
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      className="mt-3 px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
                      onClick={() =>
                        setData(d => ({
                          ...d,
                          bulleted: [...(d.bulleted ?? []), ''],
                        }))
                      }
                    >
                      + Add item
                    </button>
                  </div>
                )}

                {data.activeTool === 'Checklist' && (
                  <div>
                    <ul className="space-y-2">
                      {(data.checklist ?? []).map((it, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!!it.done}
                            onChange={e =>
                              setData(d => ({
                                ...d,
                                checklist: (d.checklist ?? []).map(
                                  (v, idx) =>
                                    idx === i
                                      ? { ...v, done: e.target.checked }
                                      : v,
                                ),
                              }))
                            }
                          />
                          <input
                            value={it.text ?? ''}
                            onChange={e =>
                              setData(d => ({
                                ...d,
                                checklist: (d.checklist ?? []).map(
                                  (v, idx) =>
                                    idx === i
                                      ? { ...v, text: e.target.value }
                                      : v,
                                ),
                              }))
                            }
                            className="flex-1 bg-transparent outline-none border border-black/10 rounded px-2 py-1"
                          />
                          <button
                            className="text-xs px-2 py-1 border border-black/10 rounded hover:bg-black/5"
                            onClick={() =>
                              setData(d => ({
                                ...d,
                                checklist: (d.checklist ?? []).filter(
                                  (_, idx) => idx !== i,
                                ),
                              }))
                            }
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      className="mt-3 px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
                      onClick={() =>
                        setData(d => ({
                          ...d,
                          checklist: [
                            ...(d.checklist ?? []),
                            { text: '', done: false },
                          ],
                        }))
                      }
                    >
                      + Add item
                    </button>
                  </div>
                )}

                {data.activeTool === 'Task list' && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-separate border-spacing-0 rounded-lg overflow-hidden">
                      <thead>
                        <tr>
                          {['Task', 'Assigned to', 'Due date', 'Bucket'].map(
                            h => (
                              <th
                                key={h}
                                className="bg-black/5 text-left px-3 py-2 border border-black/10"
                              >
                                {h}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {(data.tasks ?? []).map((row, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 border border-black/10">
                              <input
                                value={row.task ?? ''}
                                onChange={e =>
                                  setData(d => ({
                                    ...d,
                                    tasks: (d.tasks ?? []).map((r, idx) =>
                                      idx === i
                                        ? { ...r, task: e.target.value }
                                        : r,
                                    ),
                                  }))
                                }
                                className="w-full bg-transparent outline-none"
                              />
                            </td>
                            <td className="px-3 py-2 border border-black/10">
                              <input
                                value={row.assignee ?? ''}
                                onChange={e =>
                                  setData(d => ({
                                    ...d,
                                    tasks: (d.tasks ?? []).map((r, idx) =>
                                      idx === i
                                        ? { ...r, assignee: e.target.value }
                                        : r,
                                    ),
                                  }))
                                }
                                className="w-full bg-transparent outline-none"
                              />
                            </td>
                            <td className="px-3 py-2 border border-black/10">
                              <input
                                type="date"
                                value={row.due ?? ''}
                                onChange={e =>
                                  setData(d => ({
                                    ...d,
                                    tasks: (d.tasks ?? []).map((r, idx) =>
                                      idx === i
                                        ? { ...r, due: e.target.value }
                                        : r,
                                    ),
                                  }))
                                }
                                className="w-full bg-transparent outline-none"
                              />
                            </td>
                            <td className="px-3 py-2 border border-black/10">
                              <input
                                value={row.bucket ?? ''}
                                onChange={e =>
                                  setData(d => ({
                                    ...d,
                                    tasks: (d.tasks ?? []).map((r, idx) =>
                                      idx === i
                                        ? { ...r, bucket: e.target.value }
                                        : r,
                                    ),
                                  }))
                                }
                                className="w-full bg-transparent outline-none"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button
                      className="mt-3 px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
                      onClick={() =>
                        setData(d => ({
                          ...d,
                          tasks: [
                            ...(d.tasks ?? []),
                            {
                              task: 'Task name',
                              assignee: '',
                              due: '',
                              bucket: 'To do',
                            },
                          ],
                        }))
                      }
                    >
                      + Add task
                    </button>
                  </div>
                )}

                {data.activeTool === 'Numbered list' && (
                  <div>
                    <ol className="space-y-2">
                      {(data.numbered ?? []).map((it, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="w-6 text-right">{i + 1}.</span>
                          <input
                            value={it ?? ''}
                            onChange={e =>
                              setData(d => ({
                                ...d,
                                numbered: (d.numbered ?? []).map(
                                  (v, idx) =>
                                    idx === i ? e.target.value : v,
                                ),
                              }))
                            }
                            className="flex-1 bg-transparent outline-none border border-black/10 rounded px-2 py-1"
                          />
                          <button
                            className="text-xs px-2 py-1 border border-black/10 rounded hover:bg-black/5"
                            onClick={() =>
                              setData(d => ({
                                ...d,
                                numbered: (d.numbered ?? []).filter(
                                  (_, idx) => idx !== i,
                                ),
                              }))
                            }
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ol>
                    <button
                      className="mt-3 px-3 py-2 rounded-md border border-black/10 hover:bg-black/5"
                      onClick={() =>
                        setData(d => ({
                          ...d,
                          numbered: [...(d.numbered ?? []), ''],
                        }))
                      }
                    >
                      + Add item
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* styles */}
      <style jsx>{`
        .paragraph-hint[data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
          white-space: pre-wrap;
        }
        .loop-editor img.loop-inline-img {
          width: ${FIXED_IMG_WIDTH}px;
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          display: block;
          margin: 8px 0;
        }
          .loop-pdf-box {
  display: inline-block;
  margin: 8px 0;
  padding: 10px 14px;
  background: rgba(0,0,0,0.05);
  border: 1px solid #ccc;
  border-radius: 8px;
  cursor: pointer;
}

.loop-pdf-preview {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 14px;
  font-weight: 500;
}

.loop-pdf-box:hover {
  background: rgba(0,0,0,0.1);
}

.loop-pdf-download {
  font-size: 12px;
  opacity: 0.6;
}

      `}</style>
    </div>
  );
}
