'use client';
import React, { useRef, useState, useEffect, useMemo, use } from 'react';
import MainSide from '@/components/Sidebar';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LucideScanQrCode } from 'lucide-react';
import { time } from 'console';
import ToolsSidebar from './ToolSidebar';

const tools = ["pen", "eraser", "rectangle", "circle", "move"] as const;
type ToolType = (typeof tools)[number];
type StrokePoint = { x: number, y: number };
type StrokePath = { color: string, width: number; points: StrokePoint[]; mode?: 'draw' | 'erase'; };
type LayerType = "strokes" | "shapes";
type Layer = {
  _id?: string;
  name: string;
  type: LayerType;
  visible: boolean;
  opacity: number;
  z: number;
  paths: StrokePath[];
};

type MapState = {
  mapId?: string;
  layers: Layer[];
  activeLayerIndex: number;
};

interface Shape {
  id: number;
  type: 'rectangle' | 'circle';
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  color: string;
  lineWidth: number;
}

interface WhiteboardCanvasProps {
  userID: string;
  mapId?: string
}

let shapeIdCounter = 0;

const WhiteboardCanvas: React.FC<WhiteboardCanvasProps> = ({ userID, mapId }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [penPaths, setPenPaths] = useState<StrokePath[]>([]);

  const [tool, setTool] = useState<'pen' | 'eraser' | 'rectangle' | 'circle' | 'move'>('pen');
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(2);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [movingShapeId, setMovingShapeId] = useState<number | null>(null);
  const [background, setBackground] = useState<HTMLImageElement | null>(null);
  /// State variables for the saving modal
  const [isSaving, setSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [moveOffset, setMoveOffset] = useState<{x:number,y:number} | null>(null);




  // ADDED BY RAFAEL AYALA SO USER CAN CONTINUOUSLY SAVE MAP UPDATES (Added on 10/11)
  const [mapState, setMapState] = useState<MapState>({
    layers: [],
    activeLayerIndex: 0,
  });
  /// Also added by Rafael Ayala - live drawing/preview to prevent state-crash among all the shapes
  const livePathRef = useRef<StrokePath | null>(null);
  const previewRef = useRef<Shape | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const bgRef = useRef<HTMLImageElement | null>(null);
  const penPathsRef = useRef<StrokePath[]>([]);
  const shapesRef = useRef<Shape[]>([]);
  /// To ensure no mishaps
  const activePointerIdRef = useRef<number | null>(null);


  useEffect(() => { ctxRef.current = context }, [context]);
  useEffect(() => { bgRef.current = background }, [background]);
  useEffect(() => { penPathsRef.current = penPaths }, [penPaths]);
  useEffect(() => { shapesRef.current = shapes }, [shapes]);
  /// LINES 38-58 WERE ADDED TO PROVIDE THE UPDATED SIDEBAR - BY RAFAEL AYALA, 9/29/2025
  /// For pulling credentials for Sidebar
  const router = useRouter();

  // WhoAmI (for sidebar and auth bounce)
  const [whoami, setWhoami] = useState<string>('');
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/flask-api/whoami', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error('Not signed in');
        setWhoami(data.message);
        setRole(data.role);
      } catch {
        router.push('/login');
      }
    })();
  }, [router]);

  /// Helper to ensure clean drawing process (no unintended shapes or sketches are made).
  const cancelInteraction = (e?: React.SyntheticEvent) => {
    const el = (e?.currentTarget as Element) ?? canvasRef.current;
    if (activePointerIdRef.current != null) {
      tryReleasePointerCapture(el ?? null, activePointerIdRef.current);
    }
    activePointerIdRef.current = null;
    setDrawing(false);
    setStartPos(null);            
    livePathRef.current = null;
    previewRef.current = null;
    timedDraw();
  };

  /// Made to be a useCallBack to make the function stable, removing the risk of there
  /// being two different states of the canvas
  const redraw = React.useCallback(() => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    /// Clear whole buffer
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    /// White background in device pixels but draw in CSS pixels afterwards
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    /// Canvas CSS size
    const rect = canvas.getBoundingClientRect();
    const canvasWidth = rect.width;
    const canvasHeight = rect.height;

    /// Background
    const bg = bgRef.current;
    if (bg) {
      const iw = bg.naturalWidth || bg.width;
      const ih = bg.naturalHeight || bg.height;
      const scale = Math.min(canvasWidth / iw, canvasHeight / ih);
      const w = iw * scale;
      const h = ih * scale;
      const x = (canvasWidth - w) / 2;
      const y = (canvasHeight - h) / 2;
      ctx.drawImage(bg, x, y, w, h);
    }

    /// Helper
    const drawPath = (path?: StrokePath | null) => {
      if (!path || !path.points?.length) return;
      ctx.save();
      ctx.beginPath();
      ctx.lineWidth = Number(path.width) || 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (path.mode === 'erase') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = '#000';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = typeof path.color === 'string' ? path.color : '#000000';
      }
      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) ctx.lineTo(path.points[i].x, path.points[i].y);
      ctx.stroke();
      ctx.closePath();
      ctx.restore();
    };

    /// Persisted & live strokes
    const persisted = penPathsRef.current;
    for (const p of persisted) drawPath(p);
    drawPath(livePathRef.current);

    /// Shapes
    for (const s0 of shapesRef.current) {
      if (!s0) continue;
      const s = {
        ...s0,
        color: s0.color ?? '#000000',
        lineWidth: s0.lineWidth ?? 2,
        radius: s0.radius ?? 0,
        width: s0.width ?? 0,
        height: s0.height ?? 0,
      };
      ctx.beginPath();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (s.type === 'rectangle') {
        ctx.strokeRect(s.x, s.y, s.width, s.height);
      } else {
        ctx.arc(s.x, s.y, s.radius || 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.closePath();
    }

    /// Preview shape
    const prev = previewRef.current;
    if (prev) {
      ctx.beginPath();
      ctx.strokeStyle = prev.color ?? '#000000';
      ctx.lineWidth = prev.lineWidth ?? 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (prev.type === 'rectangle') {
        ctx.strokeRect(prev.x, prev.y, prev.width ?? 0, prev.height ?? 0);
      } else {
        ctx.arc(prev.x, prev.y, (prev.radius ?? 0), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.closePath();
    }
  }, []);

  const timedDraw = React.useCallback(() => {
    if (animationFrameRef.current != null) return;
    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;
      redraw();
    });
  }, [redraw])
  useEffect(() => {
    return () => { if (animationFrameRef.current != null) cancelAnimationFrame(animationFrameRef.current); };
  }, []);

  /// Create context and keep canvas sized.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setContext(ctx);

    const dpr = window.devicePixelRatio || 1;
    /// Ensure canvas matches rendered size and updates
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      /// Next four lines help to update drawing buffer
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      timedDraw();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    return () => ro.disconnect();
  }, []);



  // Helper to load background from image URL
  // blob dependency removed so there can be a more stable loading process for 
  // map contents.
  const loadBackgroundFromURL = React.useCallback(async (url: string) => {
    if (!url) return false;
    try {
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          setBackground(img);
          timedDraw();
          resolve();
        };
        img.onerror = () => reject(new Error('No image could be loaded'));
        img.src = url;
      });

      return true;
    } catch (e) {
      console.error('Background could not be loaded given the URL:', url, e);
      return false;
    }
  }, [timedDraw]);


  /// Loader that fetches background owned by the map
  const loadImage = React.useCallback(async (id: string) => {
    const qs = `?user_id=${encodeURIComponent(userID)}&t=${Date.now()}`;
    const url = `/flask-api/maps/${id}/background${qs}`;

    const res = await loadBackgroundFromURL(url);
    if (!res) console.warn('No background for map', id);
    return res;
  }, [userID, loadBackgroundFromURL]);

  /// Helper to load an existing map and restore the user's drawing progress
  useEffect(() => {
    if (!mapId || !userID) return;

    let abort = false;

    (async () => {
      try {
        const res = await fetch(`/flask-api/maps/${mapId}?user_id=${encodeURIComponent(userID)}`, {
          credentials: 'include'
        });
        if (!res.ok) {
          console.error('Map could not be loaded', await res.text());
          return;
        }
        const mapDoc = await res.json();
        if (abort) return;

        /// Normalization of drawing layers from the backend
        /// Turns {payload: {paths: []}} into a local [] collection Layer
        const layers: Layer[] = (mapDoc.layers ?? []).map((l: any) => ({
          _id: l._id,
          name: l.name ?? 'Layer',
          type: l.type ?? 'strokes',
          visible: l.visible ?? true,
          opacity: typeof l.opacity === 'number' ? l.opacity : 1,
          z: typeof l.z === 'number' ? l.z : 0,
          paths: l.payload?.paths ?? []
        }));

        /// First Strokes layer
        let activeIndex = Math.max(0, layers.findIndex(l => l.type === 'strokes'));
        if (activeIndex === -1) {
          layers.push({
            _id: undefined,
            name: 'Strokes',
            type: 'strokes',
            visible: true,
            opacity: 1,
            z: 10,
            paths: []
          });
          activeIndex = layers.length - 1;
        }

        setMapState({
          mapId: mapDoc._id,
          layers,
          activeLayerIndex: activeIndex,
        });

        /// Apply sketches from previous session(s) into map
        /// Modified by Rafael Ayala to normalize strokes when pulling/pushing them to/from the db
        const strokes = (layers[activeIndex]?.paths ?? []).filter(Boolean);
        setPenPaths(strokes.map((p: any) => ({
          color: typeof p?.color === 'string' ? p.color : '#000000',
          width: typeof p?.width === 'number' ? p.width : 2,
          mode: p?.mode === 'erase' ? 'erase' : 'draw',
          points: Array.isArray(p?.points) ? p.points.map((point: any) => ({ x: Number(point?.x) || 0, y: Number(point?.y) || 0 })) : [],
        })));

        const shapes = (mapDoc.layers?.[activeIndex]?.payload?.shapes) ?? [];
        /// Helper to normalize shapes whenever they are pulled from the database
        const normalizedShapes: Shape[] = shapes
          .filter(Boolean)
          .map((shape: any) => ({
            id: shape?.id ?? shapeIdCounter++, // always unique
            type: shape?.type === 'circle' ? 'circle' : 'rectangle',
            x: Number(shape?.x) || 0,
            y: Number(shape?.y) || 0,
            width: Number(shape?.width) || 0,
            height: Number(shape?.height) || 0,
            radius: Number(shape?.radius) || 0,
            color: typeof shape?.color === 'string' ? shape.color : '#000000',
            lineWidth: Number(shape?.lineWidth) || 2,
          }));

        setShapes(normalizedShapes);

        await loadImage(mapId);
        timedDraw();
      } catch (e) {
        console.error('Map could not be loaded', e);
      }
    })();

    return () => { abort = true; };
  }, [mapId, userID, loadImage]);

  /// Used to redraw every time the context/background changes
  useEffect(() => {
    if (context) timedDraw()
  }, [context, background, penPaths, shapes, timedDraw]);

  const buildCurrentLayerPayload = (): { type: 'strokes'; paths: StrokePath[]; shapes: Shape[] } => {
    const pathsToSave: StrokePath[] = (penPaths ?? [])
      .filter(Boolean)
      .map((p) => ({
        color: typeof p?.color === 'string' ? p.color : '#000000',
        width: Number(p?.width) || 2,
        mode: p?.mode === 'erase' ? 'erase' : 'draw',
        points: Array.isArray(p?.points) ? p.points.map((point) => ({ x: Number(point?.x) || 0, y: Number(point?.y) || 0 })) : [],
      }));

    const shapesToSave: Shape[] = (shapes ?? [])
      .filter(Boolean)
      .map((shape) => ({
        id: shape.id,
        type: shape.type === 'circle' ? 'circle' : 'rectangle',
        x: Number(shape.x) || 0,
        y: Number(shape.y) || 0,
        width: Number(shape.width) || 0,
        height: Number(shape.height) || 0,
        radius: Number(shape.radius) || 0,
        color: typeof shape.color === 'string' ? shape.color : '#000000',
        lineWidth: Number(shape.lineWidth) || 2,
      }));

    return { type: 'strokes', paths: pathsToSave, shapes: shapesToSave };
  };

  function trySetPointerCapture(el: Element | null, pointerId: number) {
    if (!el || !(el as any).setPointerCapture) return false;
    try { (el as any).setPointerCapture(pointerId); return true; } catch { return false; }
  }
  function tryReleasePointerCapture(el: Element | null, pointerId: number) {
    if (!el || !(el as any).releasePointerCapture) return;
    try { (el as any).releasePointerCapture(pointerId); } catch { }
  }

  const getMousePos = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : { x: 0, y: 0 };
  };

  const findShapeAtPos = (x: number, y: number) => {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (s.type === 'rectangle') {
        if (x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height) return s.id;
      } else if (s.type === 'circle') {
        const dx = x - s.x;
        const dy = y - s.y;
        if (Math.sqrt(dx * dx + dy * dy) <= (s.radius || 0)) return s.id;
      }
    }
    return null;
  };

  const handleMouseDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    trySetPointerCapture(e.currentTarget, e.pointerId);
    activePointerIdRef.current = e.pointerId;
    const pos = getMousePos(e);
    setStartPos(pos);
    setDrawing(true);

    if (tool === 'pen') {
      livePathRef.current = { points: [pos], color, width: lineWidth, mode: 'draw' };
      timedDraw();
    } else if (tool === 'eraser') {
      /// First check if a shape is hit
      const shapeId = findShapeAtPos(pos.x, pos.y);
      if (shapeId !== null) {
        setShapes(prev => prev.filter(s => s.id !== shapeId));
        timedDraw();
        setDrawing(false);
        return;
      }
      livePathRef.current = { points: [pos], color: '#ffffff', width: Math.max(8, lineWidth * 2), mode: 'erase' };
      timedDraw();
    } else if (tool === 'move') {
      const shapeId = findShapeAtPos(pos.x, pos.y);
      if (shapeId !== null) {
        setMovingShapeId(shapeId);
        const shape = shapes.find(s => s.id === shapeId)!;
        setMoveOffset({ x: pos.x - shape.x, y: pos.y - shape.y }); // save click offset
      }
    } else if (tool === 'rectangle' || tool === 'circle') {
      previewRef.current = {
        id: -1,
        type: tool,
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        radius: 0,
        color,
        lineWidth,
      };
      timedDraw();
    }
  };

  const handleMouseMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || !ctxRef.current || !startPos) return;
    const pos = getMousePos(e);

    if (tool === 'pen' || tool === 'eraser') {
      if (livePathRef.current) {
        livePathRef.current.points.push(pos);
        timedDraw();
      }
    } else if (tool === 'rectangle' || tool === 'circle') {
      if (previewRef.current) {
        previewRef.current.width = pos.x - startPos.x;
        previewRef.current.height = pos.y - startPos.y;
        previewRef.current.radius = Math.sqrt(Math.pow(pos.x - startPos.x, 2) + Math.pow(pos.y - startPos.y, 2));
        previewRef.current.color = color;
        previewRef.current.lineWidth = lineWidth;
        timedDraw();
      }
    } else if (tool === 'move' && movingShapeId !== null && moveOffset) {
      setShapes(prev => prev.map(s => 
        s.id === movingShapeId 
        ? { ...s, x: pos.x - moveOffset.x, y: pos.y - moveOffset.y } // use offset
        : s
      ));
      timedDraw();
    }
  };

  const handleMouseUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    tryReleasePointerCapture(e.currentTarget, e.pointerId);
    activePointerIdRef.current = null;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) {
      cancelInteraction();
      return;
    }
    const sketchIsInside = e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!sketchIsInside) {
      cancelInteraction();
      return;
    }


    if (!ctxRef.current || !startPos) { cancelInteraction(); return; }
    setDrawing(false);
    const pos = getMousePos(e);

    if (tool === 'pen' || tool === 'eraser') {
      const lp = livePathRef.current;
      if (lp && lp.points && lp.points.length > 1) {
        const clone = { ...lp, points: lp.points.map(p => ({ ...p })) };
        penPathsRef.current = [...penPathsRef.current, clone];
        setPenPaths(penPathsRef.current);
      }
      cancelInteraction();
      return;
    }

    if (tool === 'rectangle' || tool === 'circle') {
      const prev = previewRef.current;
      /// Guard for only "complete" sketches
      const w = Math.abs((prev?.width ?? pos.x - startPos.x));
      const h = Math.abs((prev?.height ?? pos.y - startPos.y));
      const r = Math.sqrt((pos.x - startPos.x) ** 2 + (pos.y - startPos.y) ** 2);
      const nonTrivial = tool === 'circle' ? r >= 2 : (w >= 2 && h >= 2);
      if (!nonTrivial) { cancelInteraction(); return; }

      /// Rectatnle
      if (tool === 'rectangle') {
        const newShape: Shape = {
          id: shapeIdCounter++,
          type: 'rectangle',
          x: startPos.x,
          y: startPos.y,
          width: prev?.width ?? (pos.x - startPos.x),
          height: prev?.height ?? (pos.y - startPos.y),
          color, lineWidth,
        };
        shapesRef.current = [...shapesRef.current, newShape];
        setShapes(shapesRef.current);
        cancelInteraction();
        return;
      }

      /// Circle
      const newShape: Shape = {
        id: shapeIdCounter++,
        type: 'circle',
        x: startPos.x,
        y: startPos.y,
        radius: r,
        width: 0,
        height: 0,
        color, lineWidth,
      };
      shapesRef.current = [...shapesRef.current, newShape];
      setShapes(shapesRef.current);
      cancelInteraction();
      return;
    }

    if (tool === 'move') {
      setMovingShapeId(null);
      setMoveOffset(null);
      timedDraw();
    }
  };


  const clearCanvas = () => {
    shapesRef.current = [];
    penPathsRef.current = [];
    setShapes([]);
    setPenPaths([]);
    livePathRef.current = null;
    previewRef.current = null;
    if (ctxRef.current && canvasRef.current) {
      ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    timedDraw();
  };

  /// Added by Rafael Ayala - Save Functionality
  const saveCanvas = async () => {
    if (!mapState.mapId) {
      console.error('No mapId yet');
      return;
    }

    setSaving(true);

    try {
      /// Find the strokes layer by type - don’t assume index 0
      const strokesLayer = mapState.layers.find(l => l.type === 'strokes');
      if (!strokesLayer?._id) {
        console.error('No strokes read');
        return;
      }

      const payload = buildCurrentLayerPayload();

      /// Save the layer payload
      {
        const res = await fetch(
          `/flask-api/maps/${mapState.mapId}/layers/${strokesLayer._id}?user_id=${encodeURIComponent(userID)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ payload }),
          }
        );
        if (!res.ok) {
          console.error('Saving layer failed:', await res.text());
          return;
        }

        /// Update local layer so future saves use the latest version, and there is no blank canvas
        /// loaded when the user returns to an existing drawing session.
        setMapState(ms => ({
          ...ms,
          layers: ms.layers.map(l =>
            l._id && l._id === strokesLayer._id ? { ...l, paths: payload.paths ?? [] } : l
          ),
        }))
      }

      /// Save a thumbnail for the table; redraw before capture and a smaller PNG to keep upload quick
      const canvas = canvasRef.current;
      if (!canvas) return;

      try { timedDraw(); await new Promise(requestAnimationFrame); } catch { }

      /// Make a smaller offscreen canvas
      const maxSide = 512;
      const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
      let blob: Blob | null = null;

      if (scale < 1) {
        const off = document.createElement('canvas');
        off.width = Math.round(canvas.width * scale);
        off.height = Math.round(canvas.height * scale);
        const octx = off.getContext('2d');
        if (octx) {
          /// Draw the current canvas into the downscaled offscreen canvas
          octx.drawImage(canvas, 0, 0, off.width, off.height);
          /// Prefer toBlob (async); Safari may return null, so fall back to dataURL
          blob = await new Promise<Blob | null>((resolve) =>
            off.toBlob((b) => resolve(b), 'image/png')
          );
          if (!blob) {
            const dataUrl = off.toDataURL('image/png');
            /// Convert dataURL to Blob
            const byteString = atob(dataUrl.split(',')[1]);
            const bytes = new Uint8Array(byteString.length);
            for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
            blob = new Blob([bytes], { type: 'image/png' });
          }
        }
      } else {
        /// Canvas is already small; capture directly
        blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/png')
        );
        if (!blob) {
          const dataUrl = canvas.toDataURL('image/png');
          const byteString = atob(dataUrl.split(',')[1]);
          const bytes = new Uint8Array(byteString.length);
          for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
          blob = new Blob([bytes], { type: 'image/png' });
        }
      }

      if (blob) {
        const res = await fetch(
          `/flask-api/maps/${mapState.mapId}/thumb?user_id=${encodeURIComponent(userID)}`,
          {
            method: 'PUT',
            body: blob,
            credentials: 'include',
          }
        );
        if (!res.ok) {
          console.error('Saving thumbnail failed:', await res.text());
        }
      }
      setShowSaved(true);
    } catch (error) {
      alert('The map contents could not be saved');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      setBackground(img);
      timedDraw(); // ensure it appears immediately
    };
    img.src = URL.createObjectURL(file);
  };

  return (
    <div className="flex h-full w-full pt-16 bg-white dark:bg-gray-900 transition-colors">

      {/* --- LEFT SIDEBAR (UNCHANGED) --- */}
      <MainSide user={whoami} role={role} />


      {/* --- MAIN CANVAS AREA --- */}
      <div className="flex-1 flex relative">

      {/* --- RIGHT COLLAPSIBLE TOOLBAR --- */}
      <div
        className={`fixed top-16 right-0 h-[calc(100vh-4rem)] bg-[var(--panel-bg)] text-[var(--panel-text)]
          border-l border-[var(--panel-border)] shadow-xl transition-all duration-300
          flex flex-col p-4 space-y-4
          ${isCollapsed ? "w-14" : "w-64"}`}
      >
        {/* Collapse Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute left-[-14px] top-6 bg-[var(--panel-bg)] hover:bg-[rgba(0,0,0,0.05)]
                    dark:hover:bg-[rgba(255,255,255,0.1)] text-[var(--panel-text)] rounded-full p-1 shadow"
        >
          {isCollapsed ? "⮜" : "⮞"}
        </button>

        {/* TOOL LIST */}
        {!isCollapsed && (
          <>
            <h2 className="text-sm font-semibold">Tools</h2>

            <div className="flex flex-col space-y-2">
              {tools.map((toolName) => (
                <button
                  key={toolName}
                  onClick={() => setTool(toolName)}
                  className={`px-3 py-2 rounded-md font-medium text-sm transition-all
                    ${tool === toolName
                      ? "bg-blue-600 text-white shadow"
                      : "hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.1)]"
                    }`}
                >
                  {toolName.charAt(0).toUpperCase() + toolName.slice(1)}
                </button>
              ))}
            </div>

            {/* COLOR PICKER */}
            <div className="space-y-1 pt-4">
              <label className="text-sm font-semibold">Color</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full h-10 rounded cursor-pointer"
              />
            </div>

            {/* LINE WIDTH */}
            <div className="space-y-1">
              <label className="text-sm font-semibold">Width</label>
              <input
                type="range"
                min={1}
                max={50}
                value={lineWidth}
                onChange={(e) => setLineWidth(Number(e.target.value))}
                className="w-full accent-blue-600"
              />
            </div>

            {/* ACTIONS */}
            <div className="pt-4 space-y-2">
              <button
                onClick={clearCanvas}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-md"
              >
                Clear Canvas
              </button>

              <button
                onClick={saveCanvas}
                disabled={isSaving}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-md"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </>
        )}
      </div>


      {/* --- CANVAS --- */}
      <div className="flex-1 flex justify-center items-center px-4 pb-4">
        <canvas
          ref={canvasRef}
          className="w-full max-w-5xl h-full max-h-[calc(100vh-220px)] 
          bg-white dark:bg-gray-700 rounded shadow-inner touch-none transition-colors"
          onPointerDown={handleMouseDown}
          onPointerMove={handleMouseMove}
          onPointerUp={handleMouseUp}
          onPointerCancel={cancelInteraction}
          onPointerLeave={cancelInteraction}
          onLostPointerCapture={cancelInteraction}
        />
      </div>
    </div>

    {/* --- SAVED POPUP --- */}
    {showSaved && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl px-6 py-5 w-full max-w-sm">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Saved!
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
            Changes saved successfully.
          </p>

          <div className="flex justify-end">
            <button
              onClick={() => setShowSaved(false)}
              className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
);


};

export default WhiteboardCanvas