'use client';
 
import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import React from "react";
import RightInfoPanel from "./Right-Side-Bar";
import LeftInfoPanel from "./Left-Side-Bar";
import CreateNote from "./Create-Note";
import DualNotesFooter from "./DualNotesFooter";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react"; // for close icon (optional)
import SagittalView from './SagittalView';
import { Home, Library, Notebook, Search } from "lucide-react";


 
 
function decodeB64ToJSON<T = any>(b64: string): T | null {
  try {
    return JSON.parse(typeof window !== 'undefined' ? window.atob(b64) : Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    try {
      const raw = typeof window !== 'undefined' ? window.atob(b64) : Buffer.from(b64, 'base64').toString('utf8');
     
      return JSON.parse(decodeURIComponent(escape(raw)));
    } catch {
      return null;
    }
  }
}
 
function consumeRestorePayload(): any | null {
  if (typeof window === 'undefined') return null;
 
  try {
    localStorage.removeItem('atlas:restore');
    localStorage.removeItem('atlas:restore:once');
  } catch {}
 
  const url = new URL(window.location.href);
  const b64 = url.searchParams.get('atlas_state');
  if (!b64) return null;
 
  const payload = decodeB64ToJSON(b64);
  // Clean only atlas_state; keep other params like note_id
  url.searchParams.delete('atlas_state');
  const qs = url.searchParams.toString();
  const clean = url.pathname + (qs ? `?${qs}` : '');
  window.history.replaceState({}, '', clean);
 
  return payload;
}
 
/** Remove fenced ```atlas ... ``` or inline `atlas {...}` blocks from text. */
function stripAtlasBlocks(text?: string | null): string {
  if (!text) return '';
  let out = text.replace(/```atlas[\s\S]*?```/gi, '').trim();    
  out = out.replace(/atlas\s*\{[\s\S]*?\}/gi, '').trim();          
  out = out.replace(/\n{3,}/g, '\n\n');                        
  return out;
}
 
function extractAtlasJSON(details?: string | null): any | null {
  if (!details) return null;
  const fenced = details.match(/```atlas\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1]); } catch { /* ignore */ }
  }
  const ix = details.toLowerCase().indexOf('atlas');
  if (ix >= 0) {
    const brace = details.indexOf('{', ix);
    if (brace >= 0) {
      const tail = details.slice(brace);
      const end = tail.lastIndexOf('}');
      if (end >= 0) {
        try { return JSON.parse(tail.slice(0, end + 1)); } catch { /* ignore */ }
      }
    }
  }
  return null;
}
 
 
/** Try to find a {left,right} pair in an arbitrary object. */
function findDualInPayload(p: any): { left: any; right: any } | null {
  if (!p) return null;
 
  // Accept common nests
  const a = p.atlas ?? p;
 
  if (a?.dual?.left && a?.dual?.right) return { left: a.dual.left, right: a.dual.right };
  if (a?.atlas_pair?.left && a?.atlas_pair?.right) return { left: a.atlas_pair.left, right: a.atlas_pair.right };
  if (a?.left && a?.right) return { left: a.left, right: a.right };
 
  // Accept array form
  if (Array.isArray(a) && a.length === 2 && a[0] && a[1]) return { left: a[0], right: a[1] };
 
  return null;
}
 
/** Normalize one pane's meta into the fields we need. */
function normalizePaneMeta(meta: any) {
  const lvl = Number(meta?.atlas_level ?? meta?.selectedLevel ?? 29);
  const isCheck = !!(meta?.is_check ?? meta?.isCheck);
  const isCheckTest = !!(meta?.is_check_test ?? meta?.isCheckTest);
  const layers: string[] =
    Array.isArray(meta?.active_layers) ? meta.active_layers
    : Array.isArray(meta?.activeLayers) ? meta.activeLayers
    : ['layer-MC3'];
 
  const tiles: string[] =
    Array.isArray(meta?.selected_tiles) ? meta.selected_tiles
    : Array.isArray(meta?.selectedTiles) ? meta.selectedTiles
    : [];
 
  const selectedRegion = meta?.selected_region ?? meta?.selectedRegion ?? null;
  const color = meta?.highlight_color ?? meta?.highlightColor ?? 'blue';
 
  const viewingImage =
    isCheck ? `completes/level-${lvl}-grid-brain.svg`
    : isCheckTest ? `grid/level-${lvl}-grid.svg`
    : `levels/level-${lvl}.svg`;
 
  const t = meta?.transform;
  const savedT =
    t && typeof t.k === 'number'
      ? d3.zoomIdentity.translate(Number(t.x || 0), Number(t.y || 0)).scale(Number(t.k || 1))
      : null;
 
  return {
    level: lvl,
    isCheck,
    isCheckTest,
    layers,
    tiles,
    selectedRegion,
    color,
    viewingImage,
    savedTransform: savedT,
  };
}
 
//Get a note id from URL or payload
function getNoteIdHint(payload?: any): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('note_id') || url.searchParams.get('id');
  if (fromUrl) return fromUrl;
 
  const p = payload ?? {};
  return p.note_id || p.noteId || p?.note?.id || null;
}
 
type PaneSide = "left" | "right" | "single";
 
type PaneState = {
  selectedLevel: number;
  viewingImage: string;
  selectedTiles: Set<string>;
  selectedText: string | null;
  hoveredText: string | null;
  hoveredTile: string | null;
  savedTransform: d3.ZoomTransform | null;
  isCheck: boolean;
  isCheckTest: boolean;
  physicalCoords: { x: number; y: number } | null;
};
 
const levels = [22, 23, 24, 25, 26, 27, 28, 29, 30];
 
function makeBaseTransform(offsetX: number, offsetY: number, baseScale: number) {
  return d3.zoomIdentity.translate(offsetX, offsetY).scale(baseScale);
}
 
function BrainPane({
  id,
  state,
  setState,
  selectedColor,
  activeLayers,
  onFocusPane,
  showHeader = true,
  recenterSignal = 0,
  heightClass = "flex-1 min-h-[70vh]",
  offsetX = 0,
  offsetY = 0,
  baseScale = 0.6,
}: {
  id: PaneSide;
  state: PaneState;
  setState: React.Dispatch<React.SetStateAction<PaneState>>;
  selectedColor: string;
  activeLayers: Set<string>;
  onFocusPane: () => void;
  showHeader?: boolean;
  recenterSignal?: number;
  heightClass?: string;
  offsetX?: number;
  offsetY?: number;
  baseScale?: number;
}) {
  const svgContainerRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const selectedTilesRef = useRef<Set<string>>(state.selectedTiles);
  const selectedColorRef = useRef<string>(selectedColor);
  const baseTransformRef = useRef<d3.ZoomTransform>(
    makeBaseTransform(offsetX, offsetY, baseScale)
  );
 
  useEffect(() => { selectedTilesRef.current = state.selectedTiles; }, [state.selectedTiles]);
  useEffect(() => { selectedColorRef.current = selectedColor; }, [selectedColor]);
  useEffect(() => { baseTransformRef.current = makeBaseTransform(offsetX, offsetY, baseScale); }, [offsetX, offsetY, baseScale]);

  const setPart = <K extends keyof PaneState>(key: K, value: PaneState[K]) =>
    setState(prev => ({ ...prev, [key]: value }));
 
  const applyTransform = (t: d3.ZoomTransform) => {
    if (!svgContainerRef.current || !zoomRef.current) return;
    const svgSel = d3.select(svgContainerRef.current);
    (svgSel.transition().duration(300) as any).call((zoomRef.current as any).transform, t);
  };
 
  const handleRecenter = () => applyTransform(baseTransformRef.current);
  useEffect(() => { handleRecenter(); }, [recenterSignal]);
 
  const handleLevelChange = (level: number) => {
    const base = `levels/level-${level}.svg`;
    setState(prev => ({
      ...prev,
      selectedLevel: level,
      viewingImage: prev.isCheck
        ? `completes/level-${level}-grid-brain.svg`
        : prev.isCheckTest
          ? `grid/level-${level}-grid.svg`
          : base,
      selectedTiles: new Set(),
      selectedText: null,
      hoveredText: null,
      hoveredTile: null,
      savedTransform: prev.savedTransform,
    }));
  };
 
  const updateTileHighlights = (gSelection: d3.Selection<any, unknown, any, any>, tileIds: Set<string>) => {
    const tiles = gSelection.selectAll("#layer-grid rect");
    tiles.each(function () {
      const tile = d3.select(this);
      const id = tile.attr("id");
      if (id && tileIds.has(id)) {
        tile.style("stroke", "var(--accent-color)").style("stroke-width", 3);
      } else {
        tile.style("stroke", null).style("stroke-width", null);
      }
    });
  };
 
  const applyFillToTiles = (gSelection: d3.Selection<any, unknown, any, any>, tileIds: Set<string>, color: string) => {
    const tiles = gSelection.selectAll("#layer-grid rect");
    tiles.each(function () {
      const tile = d3.select(this);
      const id = tile.attr("id");
      tile.style("fill", id && tileIds.has(id) ? color : "var(--panel-bg)");
    });
  };
 
  const setupTileEvents = (gSelection: d3.Selection<any, unknown, any, any>) => {
    const gridTiles = gSelection.select("#layer-grid")?.selectAll("rect");
    if (!gridTiles.empty()) {
      gridTiles
        .style("cursor", "pointer")
        .on("mouseover", function () {
          const tile = d3.select(this);
          tile.style("stroke", "var(--accent-color)").style("stroke-width", 2);
          setPart("hoveredTile", tile.attr("id"));
        })
        .on("mouseout", function () {
          const tile = d3.select(this);
          const id = tile.attr("id");
          if (!selectedTilesRef.current.has(id)) {
            tile.style("stroke", null).style("stroke-width", null);
          }
          setPart("hoveredTile", null);
        })
        .on("click", function (event: MouseEvent) {
          onFocusPane();
          const tile = d3.select(this);
          const id = tile.attr("id") || "unknown";
          const isShiftPressed = event.shiftKey;
          setState(prev => {
            const updated = new Set(prev.selectedTiles);
            if (isShiftPressed) {
              updated.has(id) ? updated.delete(id) : updated.add(id);
            } else {
              updated.clear();
              updated.add(id);
            }
            updateTileHighlights(gSelection, updated);
            applyFillToTiles(gSelection, updated, selectedColorRef.current);
            if (updated.size > 0) {
              gSelection.select("#layer-grid").attr("style", "display: inline");
            }
            return { ...prev, selectedTiles: updated };
          });
        });
    }
  };
 
  useEffect(() => {
    const svgNode = svgContainerRef.current;
    if (!svgNode) return;
    const svgSel = d3.select(svgNode);
    svgSel.selectAll("*").remove();
    svgSel.attr("width", "100%").attr("height", "600px").style("touch-action", "none");
 
    const g = svgSel.append("g");
    gRef.current = g.node();
 
    d3.xml(state.viewingImage).then((data) => {
      const foreignRoot = data.documentElement as unknown as SVGSVGElement;
      g.html(foreignRoot.innerHTML);
 
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.4, 5])
        .on("zoom", (event) => {
          d3.select(gRef.current).attr("transform", event.transform);
          setPart("savedTransform", event.transform);
        });
 
      svgSel.call(zoom as any);
      zoomRef.current = zoom;
 
      if (state.savedTransform) {
        svgSel.call((zoom as any).transform, state.savedTransform);
      } else {
        svgSel.call((zoom as any).transform, makeBaseTransform(offsetX, offsetY, baseScale));
      }
 
      const gSelection = d3.select(gRef.current!);
 
      // --- Make all SVG labels black by default; selected label uses accent ---
      gSelection.selectAll("text")
        .attr("fill", "#000")
        .style("cursor", "pointer")
        .on("mouseover", function () { setPart("hoveredText", d3.select(this).text()); })
        .on("mouseout", function () { setPart("hoveredText", null); })
        .on("click", function () {
          onFocusPane();
          const textElement = d3.select(this);
          setPart("selectedText", textElement.text());
          gSelection.selectAll("text").attr("fill", "#000");
          textElement.attr("fill", "var(--accent-color)");
        });
 
      // Hide all groups, then show selected layers
      gSelection.selectAll("g").attr("style", "display: none");
      const layersList = Array.from(activeLayers);
      layersList.forEach((layerId) => {
        gSelection.select(`#${layerId}`).attr("style", "display: inline");
        if (layerId.startsWith("Grid")) gSelection.select("#layer-grid").attr("style", "display: inline");
      });
 
      if (state.selectedTiles.size > 0) {
        gSelection.select("#layer-grid").attr("style", "display: inline");
      }
 
      updateTileHighlights(gSelection, state.selectedTiles);
      applyFillToTiles(gSelection, state.selectedTiles, selectedColorRef.current);
      setupTileEvents(gSelection);
 
      svgSel.on("pointerdown", () => onFocusPane());
    });
  // eslint-disable-next-line react-hooks/exhaustive-declarations
  }, [state.viewingImage, activeLayers, baseScale, offsetX, offsetY]);
 
  useEffect(() => {
    const gSelection = d3.select(gRef.current);
    if (!gSelection.empty()) {
      const tiles = gSelection.selectAll("#layer-grid rect");
      tiles.each(function () {
        const tile = d3.select(this);
        const id = tile.attr("id");
        if (id && state.selectedTiles.has(id)) tile.style("fill", selectedColor);
      });
    }
  }, [selectedColor, state.selectedTiles]);
 
  useEffect(() => {
    const gSelection = d3.select(gRef.current);
    if (!gSelection.empty()) {
      gSelection.selectAll("text").attr("fill", "#000");
      if (state.selectedText) {
        gSelection.selectAll("text").each(function () {
          const el = d3.select(this);
          if (el.text() === state.selectedText) el.attr("fill", "var(--accent-color)");
        });
      }
    }
  }, [state.selectedText]);
 
  return (
    <div className="flex flex-col w-full min-h-0 text-[var(--panel-text)]">
      {showHeader && (
        <div className="flex items-center gap-2 px-2 pb-2 bg-[var(--navbar-bg)] text-[var(--navbar-text)] transition-colors duration-500">
          <label className="font-medium">Level ({id}):</label>
          <select
            value={state.selectedLevel}
            onChange={(e) => handleLevelChange(Number(e.target.value))}
            className="border border-[var(--border-color)] rounded px-2 py-1 text-sm bg-[var(--panel-bg)] text-[var(--panel-text)]"
          >
            {levels.map((lvl) => <option key={`${id}-${lvl}`} value={lvl}>Level {lvl}</option>)}
          </select>
          <button
            onClick={handleRecenter}
            className="bg-[var(--button-bg)] hover:bg-[var(--button-hover)] text-[var(--button-text)] px-2 py-1 rounded"
          >
            Recenter
          </button>
        </div>
      )}
 
      <div className={`${heightClass} border-2 relative bg-white`}>
        <svg ref={svgContainerRef} className="w-full h-full"></svg>
      </div>
    </div>
  );
}
 
/* -------------------------------------------------------------------------- */
/* Atlas Viewer UI                                                            */
/* -------------------------------------------------------------------------- */
export default function AtlasViewer() {
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set(["layer-MC3"]));
  const [selectedColor, setSelectedColor] = useState<string>("blue");
  const [user_id, setUserID] = useState<string | null>(null);
 
  const [isDualView, setIsDualView] = useState(false);
  const [activePane, setActivePane] = useState<"left" | "right" | "single">("single");
  const [showSagittal, setShowSagittal] = useState(false); // 👈 modal toggle
  

  const makeInitialPane = (level: number): PaneState => ({
    selectedLevel: level,
    viewingImage: `levels/level-${level}.svg`,
    selectedTiles: new Set(),
    selectedText: null,
    hoveredText: null,
    hoveredTile: null,
    savedTransform: null,
    isCheck: false,
    isCheckTest: false,
    physicalCoords: null,
  });
 
  const [leftState, setLeftState] = useState<PaneState>(makeInitialPane(29));
  const [rightState, setRightState] = useState<PaneState>(makeInitialPane(29));
  const [singleState, setSingleState] = useState<PaneState>(makeInitialPane(29));
  const [singleRecenterSig, setSingleRecenterSig] = useState(0);
 
  const current = useMemo(() => {
    if (!isDualView) return { state: singleState, setState: setSingleState, pane: "single" as const };
    return activePane === "left"
      ? { state: leftState, setState: setLeftState, pane: "left" as const }
      : { state: rightState, setState: setRightState, pane: "right" as const };
  }, [isDualView, activePane, leftState, rightState, singleState]);
 
  const handleToggleGrid = () => {
    current.setState(prev => {
      const next = !prev.isCheck;
      const path = next
        ? `completes/level-${prev.selectedLevel}-grid-brain.svg`
        : `levels/level-${prev.selectedLevel}.svg`;
      return { ...prev, isCheck: next, isCheckTest: false, viewingImage: path };
    });
  };
 
  const handleToggleGridTest = () => {
    current.setState(prev => {
      const next = !prev.isCheckTest;
      const path = next
        ? `grid/level-${prev.selectedLevel}-grid.svg`
        : `levels/level-${prev.selectedLevel}.svg`;
      return { ...prev, isCheckTest: next, isCheck: false, viewingImage: path };
    });
  };
 
  const clearTileSelection = () => {
    current.setState(prev => ({ ...prev, selectedTiles: new Set() }));
  };
 
  const exportTileData = () => {
    const data = Array.from(current.state.selectedTiles).map((id) => ({ id }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `selected-tile-data-${current.pane}.json`;
    link.click();
  };
 
  const toggleLayers = (layerId: string) => {
    setActiveLayers(prev => {
      const layer = new Set(prev);
      layer.has(layerId) ? layer.delete(layerId) : layer.add(layerId);
      return layer;
    });
  };
 
  const singleOffsetX = 80;
  const singleOffsetY = 0;
  const singleScale = 0.6;
 
  const dualOffsetX = -79;
  const dualOffsetY = 85;
  const dualScale = 0.44;
 
  const router = useRouter();
  useSearchParams(); // keep Next state up-to-date
 
  // Prefill fields for the single Create-Note bar
  const [prefillTitle, setPrefillTitle] = useState('');
  const [prefillDetails, setPrefillDetails] = useState('');
 
  /** Apply a dual restore to state. */
  const applyDual = (Lmeta: any, Rmeta: any, note?: any) => {
    const L = normalizePaneMeta(Lmeta);
    const R = normalizePaneMeta(Rmeta);
 
    // Merge layers from both sides (or prefer left if desired)
    const mergedLayers = Array.from(new Set([...(L.layers ?? []), ...(R.layers ?? [])]));
    const color = L.color ?? R.color ?? 'blue';
 
    setActiveLayers(new Set(mergedLayers.length ? mergedLayers : ['layer-MC3']));
    setSelectedColor(color);
 
    setIsDualView(true);
    setActivePane('left');
 
    setLeftState(prev => ({
      ...prev,
      selectedLevel: L.level,
      viewingImage: L.viewingImage,
      isCheck: L.isCheck,
      isCheckTest: L.isCheckTest,
      selectedTiles: new Set(L.tiles),
      selectedText: L.selectedRegion,
      savedTransform: L.savedTransform,
    }));
 
    setRightState(prev => ({
      ...prev,
      selectedLevel: R.level,
      viewingImage: R.viewingImage,
      isCheck: R.isCheck,
      isCheckTest: R.isCheckTest,
      selectedTiles: new Set(R.tiles),
      selectedText: R.selectedRegion,
      savedTransform: R.savedTransform,
    }));
 
    const leftDetails  = stripAtlasBlocks(String(note?.leftDetails  ?? note?.detailsLeft  ?? ''));
    const rightDetails = stripAtlasBlocks(String(note?.rightDetails ?? note?.detailsRight ?? ''));
    const combined = [
      leftDetails ? `Left — ${leftDetails}` : '',
      rightDetails ? `Right — ${rightDetails}` : ''
    ].filter(Boolean).join('  ');
    setPrefillTitle(String(note?.title ?? ''));
    setPrefillDetails(combined);
  };
 
  /** Apply a single-pane restore to state. */
  const applySingle = (atlas: any, note?: any) => {
    const lvl = Number(atlas.selectedLevel ?? atlas.atlas_level ?? 29);
    const isCheck = !!(atlas.isCheck ?? atlas.is_check);
    const isCheckTest = !!(atlas.isCheckTest ?? atlas.is_check_test);
    const color = atlas.highlightColor ?? atlas.highlight_color ?? 'blue';
 
    const layers =
      Array.isArray(atlas.activeLayers) ? atlas.activeLayers :
      Array.isArray(atlas.active_layers) ? atlas.active_layers : ['layer-MC3'];
 
    const selectedRegion =
      atlas.selectedRegion ?? atlas.selected_region ?? null;
 
    const tiles =
      Array.isArray(atlas.selectedTiles) ? atlas.selectedTiles :
      Array.isArray(atlas.selected_tiles) ? atlas.selected_tiles : [];
 
    const viewingImage =
      isCheck ? `completes/level-${lvl}-grid-brain.svg`
      : isCheckTest ? `grid/level-${lvl}-grid.svg`
      : `levels/level-${lvl}.svg`;
 
    const t = atlas.transform;
    const savedT =
      t && typeof t.k === 'number'
        ? d3.zoomIdentity.translate(Number(t.x || 0), Number(t.y || 0)).scale(Number(t.k || 1))
        : null;
 
    setIsDualView(false);
    setActivePane('single');
    setActiveLayers(new Set(layers));
    setSelectedColor(color);
 
    setSingleState(prev => ({
      ...prev,
      selectedLevel: lvl,
      viewingImage,
      isCheck,
      isCheckTest,
      selectedTiles: new Set(tiles),
      selectedText: selectedRegion,
      savedTransform: savedT,
    }));
 
    setPrefillTitle(String(note?.title ?? ''));
    setPrefillDetails(stripAtlasBlocks(String(note?.details ?? '')));
  };
 
  /** Attempt to restore from a payload (returns true if successful). */
  const tryRestoreFromPayload = (payload: any): boolean => {
    if (!payload) return false;
 
    // 1) Dual (direct or nested)
    const pair = findDualInPayload(payload) || findDualInPayload(payload.atlas);
    if (pair?.left && pair?.right) {
      applyDual(pair.left, pair.right, payload.note);
      return true;
    }
 
    // 2) Single (either payload.atlas or payload itself looks like atlas)
    const candidate = payload.atlas ?? payload;
    if (
      candidate &&
      (candidate.atlas_level !== undefined ||
       candidate.selectedLevel !== undefined ||
       candidate.active_layers || candidate.activeLayers)
    ) {
      applySingle(candidate, payload.note);
      return true;
    }
 
    // 3) Nothing recognizable in payload
    return false;
  };
 
  /** Fetch a note by id and try to restore from its fenced atlas JSON. */
  const tryRestoreFromNoteId = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/flask-api/notes/${id}`, { credentials: 'include' });
      if (!res.ok) return false;
      const data = await res.json();
 
      // Find a details/content field that contains the fenced block
      const candidates: unknown[] = [
        (data as any)?.content,
        (data as any)?.details,
        (data as any)?.note?.content,
        (data as any)?.note?.details,
        (data as any)?.data?.content,
        (data as any)?.data?.details,
      ].filter(Boolean);
 
      let detailsStr: string | null = null;
      for (const c of candidates) {
        if (typeof c === 'string' && c.includes('```atlas')) {
          detailsStr = c;
          break;
        }
      }
      // As a last resort, scan shallow keys for a string with ```atlas
      if (!detailsStr && data && typeof data === 'object') {
        for (const k of Object.keys(data)) {
          const v = (data as any)[k];
          if (typeof v === 'string' && v.includes('```atlas')) { detailsStr = v; break; }
        }
      }
 
      if (!detailsStr) return false;
      const meta = extractAtlasJSON(detailsStr);
      if (!meta) return false;
 
      // Dual first, then single
      const pair = findDualInPayload(meta);
      if (pair?.left && pair?.right) {
        applyDual(pair.left, pair.right, (data as any)?.note ?? {});
        return true;
      }
      // single
      const atlas = meta.atlas ?? meta;
      if (atlas) {
        applySingle(atlas, (data as any)?.note ?? {});
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };
 
  useEffect(() => {
    (async () => {
      const payload = consumeRestorePayload();
      // Try payload first
      if (tryRestoreFromPayload(payload)) return;
 
      // If payload had no atlas info, try pulling by note id (URL or payload hints)
      const noteId = getNoteIdHint(payload);
      if (noteId && await tryRestoreFromNoteId(noteId)) return;
 
      // If still nothing, but payload.note?.details exists, parse that too
      const detailsMeta = extractAtlasJSON(payload?.note?.details);
      if (detailsMeta) {
        const pair = findDualInPayload(detailsMeta);
        if (pair?.left && pair?.right) {
          applyDual(pair.left, pair.right, payload?.note ?? {});
          return;
        }
        const atlas = detailsMeta.atlas ?? detailsMeta;
        if (atlas) {
          applySingle(atlas, payload?.note ?? {});
          return;
        }
      }
      // Otherwise, leave defaults (single empty)
    })();
  // eslint-disable-next-line react-hooks/exhaustive-declarations
  }, []); // run once on mount
 
  // Build atlas payload we’ll embed into notes so highlights/state restore later
  function buildAtlasPayload() {
    const t = current.state.savedTransform;
    return {
      atlas_side: isDualView ? activePane : 'single',
      atlas_level: current.state.selectedLevel,
      selected_region: current.state.selectedText,
      selected_tiles: Array.from(current.state.selectedTiles),
      highlight_color: selectedColor,
      active_layers: Array.from(activeLayers),
      is_check: current.state.isCheck,
      is_check_test: current.state.isCheckTest,
      transform: t ? { k: t.k, x: t.x, y: t.y } : null,
      viewing_image: current.state.viewingImage,
    };
  }
 
  return (
      <div className="relative w-full h-full bg-[var(--panel-bg)] text-[var(--panel-text)] transition-colors duration-500 overflow-hidden">
 
        {/* LEFT SIDEBAR */}
        <div className="absolute top-0 left-0 z-50 h-full w-2/12 bg-[var(--sidebar-bg)] text-[var(--sidebar-text)] shadow-lg">
          <LeftInfoPanel
            selectedText={current.state.selectedText}
            setSelectedText={(val) =>
              current.setState(prev => ({ ...prev, selectedText: val }))
            }
          />
        </div>
 
        {/* RIGHT SIDEBAR */}
        <div className="absolute top-0 right-0 z-50 h-full w-2/12 bg-[var(--sidebar-bg)] text-[var(--sidebar-text)] shadow-lg">
          <RightInfoPanel
            selectedLevel={current.state.selectedLevel}
            coordinates={{ x: 0, y: 0 }}
            isCheck={current.state.isCheck}
            isCheckTest={current.state.isCheckTest}
            selectedTiles={Array.from(current.state.selectedTiles)}
            hoveredTile={current.state.hoveredTile}
            selectedText={current.state.selectedText}
            hoveredText={current.state.hoveredText}
            physicalCoords={current.state.physicalCoords}
            handleToggleGrid={handleToggleGrid}
            handleToggleGridTest={handleToggleGridTest}
            activeLayers={activeLayers}
            toggleLayers={toggleLayers}
            setShowStereotaxic={() => {}}
            clearTileSelection={clearTileSelection}
            selectAllTiles={() => {}}
            exportTileData={exportTileData}
            setSelectedColor={setSelectedColor}
          />
        </div>
 
        {/* CENTER PANEL */}
        <div className="relative z-10 flex flex-col items-center justify-start mx-auto w-8/12 min-h-screen transition-all duration-500">
          <div className="flex items-center gap-3 w-full px-2 pt-1 pb-2 bg-[var(--navbar-bg)] text-[var(--navbar-text)] transition-colors duration-500">
            <button
              onClick={() => setIsDualView(v => !v)}
              className="px-3 py-1 rounded-lg text-[var(--button-text)]
                transition-all duration-300
                hover:outline hover:outline-2 hover:outline-[var(--button-text)] hover:outline-offset-2"
            >
              {isDualView ? "Single View" : "Dual View"}
            </button>

            {/* Sagittal Button */}
            {!isDualView && (
              <button
              onClick={() => setShowSagittal(true)}
              className="px-3 py-1 rounded-lg text-[var(--button-text)]
                transition-all duration-300
                hover:outline hover:outline-2 hover:outline-[var(--button-text)] hover:outline-offset-2"
            >
              Sagittal
            </button>
            )}

            <div className="ml-auto flex items-center gap-3">
            {[
              { name: "Home", href: "/", icon: Home },
              { name: "Library", href: "/library", icon: Library },
              { name: "Notes", href: "/notes", icon: Notebook },
              { name: "Search", href: "/search-results", icon: Search },
            ].map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className="
                    flex items-center gap-1 px-3 py-1 rounded-lg
                    text-[var(--button-text)]
                    transition-all duration-300
                    hover:outline hover:outline-2 hover:outline-[var(--button-text)] hover:outline-offset-2
                  "
                >
                  <Icon size={18} strokeWidth={2} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>

          </div>

          {/* Sagittal Modal */}
          {showSagittal && (
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
              <div className="bg-[var(--panel-bg)] text-[var(--panel-text)] rounded-2xl shadow-lg p-4 relative max-w-3xl w-[90%]">
                <button
                  onClick={() => setShowSagittal(false)}
                  className="absolute top-2 right-2 text-gray-400 hover:text-white transition"
                >
                  <X size={20} />
                </button>

                <h3 className="text-lg font-semibold mb-3 text-center">Sagittal View</h3>

                <div className="bg-[var(--panel-bg)] text-[var(--panel-text)] rounded-2xl shadow-lg p-4 relative max-w-5xl w-[95%]">
                  <div className="flex justify-center items-center">
                    <SagittalView
                      imageSrc="/levels/blankSagittal.png"
                      overlayOpacity={0.0}
                      onSelectLayer={(layerLabel) => {
                        const levelNum = Number(layerLabel);

                        setSingleState((prev) => ({
                          ...prev,
                          selectedLevel: levelNum,
                          viewingImage: prev.isCheck
                            ? `completes/level-${levelNum}-grid-brain.svg`
                            : prev.isCheckTest
                              ? `grid/level-${levelNum}-grid.svg`
                              : `levels/level-${levelNum}.svg`,
                          selectedTiles: new Set(),
                          selectedText: null,
                          hoveredText: null,
                          hoveredTile: null,
                          savedTransform: prev.savedTransform,
                        }));

                        setShowSagittal(false);
                      }}
                      buttons={[
                        { id: 'layer22', topPercent: 0, heightPercent: 80, xPercent: 43, label: '22' },
                        { id: 'layer23', topPercent: 0, heightPercent: 80, xPercent: 44, label: '23' },
                        { id: 'layer24', topPercent: 0, heightPercent: 80, xPercent: 45, label: '24' },
                        { id: 'layer25', topPercent: 0, heightPercent: 80, xPercent: 46, label: '25' },
                        { id: 'layer26', topPercent: 0, heightPercent: 80, xPercent: 47, label: '26' },
                        { id: 'layer27', topPercent: 0, heightPercent: 80, xPercent: 48, label: '27' },
                        { id: 'layer28', topPercent: 0, heightPercent: 80, xPercent: 49, label: '28' },
                        { id: 'layer29', topPercent: 0, heightPercent: 80, xPercent: 50, label: '29' },
                        { id: 'layer30', topPercent: 0, heightPercent: 80, xPercent: 51, label: '30' },
                      ]}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

            {/* SINGLE OR DUAL VIEW */}
            {!isDualView ? (
              <div className="w-full flex-1 mb-8"> {/* Added mb-8 here */}
                <BrainPane
                  id="single"
                  state={singleState}
                  setState={setSingleState}
                  selectedColor={selectedColor}
                  activeLayers={activeLayers}
                  onFocusPane={() => setActivePane("single")}
                  showHeader={true}
                  recenterSignal={singleRecenterSig}
                  heightClass="flex-1 min-h-[70vh]"
                  offsetX={singleOffsetX}
                  offsetY={singleOffsetY}
                  baseScale={singleScale}
                />
              </div>
            ) : (
              <div className="grid grid-cols-[1fr_1fr] gap-4 w-full flex-1 min-h-[70vh] px-0 mb-8">
                {/* Added mb-8 here too */}
                <div className={`rounded-lg ${activePane === "left" ? "ring-2 ring-[var(--accent-color)]" : ""}`}>
                  <BrainPane
                    id="left"
                    state={leftState}
                    setState={setLeftState}
                    selectedColor={selectedColor}
                    activeLayers={activeLayers}
                    onFocusPane={() => setActivePane("left")}
                    showHeader={true}
                    heightClass="flex-1 min-h-[70vh]"
                    offsetX={dualOffsetX}
                    offsetY={dualOffsetY}
                    baseScale={dualScale}
                  />
                </div>
                <div className={`rounded-lg ${activePane === "right" ? "ring-2 ring-[var(--accent-color)]" : ""}`}>
                  <BrainPane
                    id="right"
                    state={rightState}
                    setState={setRightState}
                    selectedColor={selectedColor}
                    activeLayers={activeLayers}
                    onFocusPane={() => setActivePane("right")}
                    showHeader={true}
                    heightClass="flex-1 min-h-[70vh]"
                    offsetX={dualOffsetX}
                    offsetY={dualOffsetY}
                    baseScale={dualScale}
                  />
                </div>
              </div>
            )}
 
 
            {/* NOTE CREATION / FOOTER */}
            {!isDualView ? (
              <div
                className="
                  px-2 pb-2 mt-auto
                  bg-[var(--navbar-bg)] text-[var(--navbar-text)]
                  transition-colors duration-500
                  [&_input]:text-black [&_textarea]:text-black
                  dark:[&_input]:text-neutral-900 dark:[&_textarea]:text-neutral-900
                "
              >
                <CreateNote
                  draft={true}
                  onSubmit={(title, content) => {
                    const atlasPayload = buildAtlasPayload();
                    const contentWithAtlas =
                      `${stripAtlasBlocks(content).trim()}\n\n\`\`\`atlas\n${JSON.stringify(atlasPayload)}\n\`\`\``;
 
                    const createNote = async () => {
                      try {
                        const res = await fetch('/flask-api/notes/create', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({
                            title,
                            content: contentWithAtlas,
                            user_id: user_id,
                            region: current.state.selectedText,
                          }),
                        });
                        if (res.ok) {
                          router.push('/notes');
                        } else {
                          console.error('Failed to create note', await res.text());
                        }
                      } catch (e) {
                        console.error(e);
                      }
                    };
                    createNote();
                  }}
                  user_id={user_id ?? ''}
                  disabled={false}
                  isEditing={false}
                  selectedText={current.state.selectedText}
                  initialTitle={prefillTitle}
                  initialContent={prefillDetails}
                />
              </div>
            ) : (
              <DualNotesFooter
                leftRegion={leftState.selectedText}
                rightRegion={rightState.selectedText}
                leftLevel={leftState.selectedLevel}
                rightLevel={rightState.selectedLevel}
                /* embed full atlas state for dual save */
                activeLayers={activeLayers}
                selectedColor={selectedColor}
                leftTiles={Array.from(leftState.selectedTiles)}
                rightTiles={Array.from(rightState.selectedTiles)}
                leftTransform={
                  leftState.savedTransform
                    ? { k: leftState.savedTransform.k, x: leftState.savedTransform.x, y: leftState.savedTransform.y }
                    : null
                }
                rightTransform={
                  rightState.savedTransform
                    ? { k: rightState.savedTransform.k, x: rightState.savedTransform.x, y: rightState.savedTransform.y }
                    : null
                }
                leftCheck={leftState.isCheck}
                leftCheckTest={leftState.isCheckTest}
                rightCheck={rightState.isCheck}
                rightCheckTest={rightState.isCheckTest}
              />
            )}
          </div>
        </div>
  );
}