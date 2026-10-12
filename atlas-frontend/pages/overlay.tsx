'use client';
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import '../app/globals.css';
import MainSide from '@/components/Sidebar';
import { request } from 'http';

type StrokePoint = { x: number; y: number };
type StrokePath = {
  color: string;
  width: number;
  points: StrokePoint[];
  mode?: 'show' | 'hide';
};

type Shape = {
  id: number;
  type: 'rectangle' | 'circle';
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  color: string;
  lineWidth: number;
};

interface MapItem {
  _id: string;
  title?: string;
  base_upload_id?: string;
  base_image_id?: string;
  updated_at?: string;
}

type MapLayer = {
  mapId: string;
  title?: string;
  background: HTMLImageElement | null;
  penPaths: StrokePath[];
  shapes: Shape[];
  showBackground: boolean;
  showSketches: boolean;
  loading: boolean;
  error: string | null;
  canvasWidth?: number | null;
  canvasHeight?: number | null;
};

export default function OverlayPage() {
  const router = useRouter();

  const [authenticated, setAuthenticated] = useState(false);
  const [userID, setUserID] = useState('');
  const [userRole, setUserRole] = useState('');
  const [loading, setLoading] = useState(true);

  const [maps, setMaps] = useState<MapItem[]>([]);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);

  /// Map Layers
  const [overlayLayers, setLayers] = useState<MapLayer[]>([]);

  /// Canas state variables
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);

  /// User data
  const fetchUser = async () => {
    try {
      const res = await fetch('/flask-api/whoami', { credentials: 'include' });
      if (!res.ok) throw new Error('Not authenticated');
      const data = await res.json();
      setUserID(data.message);
      setUserRole(data.role);
      setAuthenticated(true);
    } catch (err) {
      console.error(err);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, [router]);

  /// Helper to obtain maps
  useEffect(() => {
    if (!authenticated || !userID) return;
    let abort = false;

    (async () => {
      try {
        setMapsLoading(true);
        setMapsError(null);

        const res = await fetch(
          `/flask-api/maps?user_id=${encodeURIComponent(userID)}`,
          { credentials: 'include' }
        );
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const json = await res.json();
        const arr = Array.isArray(json) ? json : Array.isArray(json?.maps) ? json.maps : [];

        if (!abort) {
          const normalized: MapItem[] = arr.map((map: any) => ({
            _id: map._id,
            title: map.title ?? 'Untitled Map',
            base_upload_id: map.base_upload_id ?? map.base_image_id,
            base_image_id: map.base_image_id,
            updated_at: map.updated_at,
          }));
          setMaps(normalized);
        }
      } catch (error: any) {
        if (!abort) setMapsError(error?.message || 'Maps not found');
      } finally {
        if (!abort) setMapsLoading(false);
      }
    })();

    return () => {
      abort = true;
    };
  }, [authenticated, userID]);

  function getDate(raw?: string | number | Date) {
    if (!raw) return "—";

    let d: Date;
    if (raw instanceof Date) {
      d = raw;
    } else if (typeof raw === "number") {
      d = new Date(raw);
    } else {
      let s = raw.trim();

      ///Turn "YYYY-MM-DD HH:MM:SS[.ffffff]" into ISO
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) {
        s = s.replace(" ", "T");
      }

      /// Trim microseconds to milliseconds
      s = s.replace(/(\.\d{3})\d+$/, "$1");

      /// Force UTC
      if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) {
        s += "Z";
      }

      d = new Date(s);
    }

    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  /// Load map images
  const loadImageElement = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      /// For exporting maps
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });

  /// Load map sketches and layers on the canvas element
  const loadLayerForMap = useCallback(
    async (mapId: string, fallbackTitle: string, baseUploadId?: string) => {
      if (!userID) return;

      try {
        const res = await fetch(
          `/flask-api/maps/${mapId}?user_id=${encodeURIComponent(userID)}`,
          { credentials: 'include' }
        );
        if (!res.ok) {
          throw new Error(`Map load failed: ${res.status}`);
        }

        const mapDoc = await res.json();
        const canvasWidth =
          Number(mapDoc?.canvas_width) ||
          Number(mapDoc?.canvas?.width) ||
          Number(mapDoc?.canvasSize?.width) ||
          null;

        const canvasHeight =
          Number(mapDoc?.canvas_height) ||
          Number(mapDoc?.canvas?.height) ||
          Number(mapDoc?.canvasSize?.height) ||
          null;

        const title = mapDoc.title ?? fallbackTitle;

        /// Image
        let bgImg: HTMLImageElement | null = null;

        const qs = `?user_id=${encodeURIComponent(userID)}&t=${Date.now()}`;
        const baseId = mapDoc.base_upload_id ?? mapDoc.base_image_id ?? baseUploadId ?? '';

        /// Possible routes for the image - included to account for legacy maps.
        const possibleRoutes: (string | null)[] = [
          `/flask-api/maps/${mapId}/background${qs}`,
          baseId ? `/flask-api/imageuploads/${encodeURIComponent(baseId)}/download${qs}` : null,
        ]
        for (const route of possibleRoutes) {
          if (!route) continue;
          try {
            bgImg = await loadImageElement(route);
          } catch {
            bgImg = null;
          }
        }


        /// Strokes
        const layers = (mapDoc.layers ?? []) as any[];
        const strokesLayer =
          layers.find((l: any) => l.type === 'strokes') ?? layers[0];
        const payload = strokesLayer?.payload ?? {};

        /// Normalize strokes
        const rawPaths = (payload.paths ?? []) as any[];
        const penPaths: StrokePath[] = rawPaths
          .filter(Boolean)
          .map((p: any) => ({
            color: typeof p?.color === 'string' ? p.color : '#000000',
            width: typeof p?.width === 'number' ? p.width : 2,
            mode: p?.mode === 'hide' ? 'hide' : 'show',
            points: Array.isArray(p?.points)
              ? p.points.map((pt: any) => ({
                x: Number(pt?.x ?? pt[0] ?? 0),
                y: Number(pt?.y ?? pt[1] ?? 0),
              }))
              : [],
          }));

        /// Normalize shapes
        const rawShapes = (payload.shapes ?? []) as any[];
        const shapes: Shape[] = rawShapes
          .filter(Boolean)
          .map((shape: any, i: number) => ({
            id: typeof shape?.id === 'number' ? shape.id : i,
            type: shape?.type === 'circle' ? 'circle' : 'rectangle',
            x: Number(shape?.x) || 0,
            y: Number(shape?.y) || 0,
            width: Number(shape?.width) || 0,
            height: Number(shape?.height) || 0,
            radius: Number(shape?.radius) || 0,
            color: typeof shape?.color === 'string' ? shape.color : '#000000',
            lineWidth: Number(shape?.lineWidth) || 2,
          }));

        /// Update layers
        setLayers(prev =>
          prev.map(l =>
            l.mapId === mapId
              ? {
                ...l,
                title,
                background: bgImg,
                penPaths,
                shapes,
                loading: false,
                error: null,
                canvasWidth,
                canvasHeight
              }
              : l
          )
        );
      } catch (e: any) {
        console.error(e);
        setLayers(prev =>
          prev.map(l =>
            l.mapId === mapId
              ? {
                ...l,
                loading: false,
                error: e?.message || 'Error loading the map',
              }
              : l
          )
        );
      }
    },
    [userID]
  );

  /// Handle addition of maps to overlay element
  const addToOverlay = (map: MapItem) => {
    setLayers(prev => {
      if (prev.some(l => l.mapId === map._id)) return prev;

      const next: MapLayer[] = [
        ...prev,
        {
          mapId: map._id,
          title: map.title ?? 'Untitled Map',
          background: null,
          penPaths: [],
          shapes: [],
          showBackground: true,
          showSketches: true,
          loading: true,
          error: null,
        },
      ];
      setTimeout(() => {
        loadLayerForMap(map._id, map.title ?? 'Untitled Map', map.base_upload_id ?? map.base_image_id);
      }, 0);

      return next;
    });
  };

  /// Remove map
  const removeFromOverlay = (mapId: string) => {
    setLayers(prev => prev.filter(l => l.mapId !== mapId));
  };

  /// Toggle map image
  const toggleLayerBackground = (mapId: string) => {
    setLayers(prev =>
      prev.map(l =>
        l.mapId === mapId ? { ...l, showBackground: !l.showBackground } : l
      )
    );
  };

  /// Toggle map sketches
  const toggleLayerSketches = (mapId: string) => {
    setLayers(prev =>
      prev.map(layer =>
        layer.mapId === mapId ? { ...layer, showSketches: !layer.showSketches } : layer
      )
    );
  };

  const redraw = useCallback(() => {
    if (!context || !canvasRef.current) return;
    const cvs = canvasRef.current;

    /// Clear
    context.clearRect(0, 0, cvs.width, cvs.height);
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, cvs.width, cvs.height);
    context.restore();

    /// Overlay element dimensions
    const rect = cvs.getBoundingClientRect();
    const dstW = rect.width;
    const dstH = rect.height;

    const fitImage = (imgW: number, imgH: number, canvasW: number, canvasH: number) => {
      const s = Math.min(canvasW / imgW, canvasH / imgH);
      const w = imgW * s;
      const h = imgH * s;
      return { s, offX: (canvasW - w) / 2, offY: (canvasH - h) / 2 };
    };

    const drawStrokeTransformed = (
      p: StrokePath,
      oldFit: { s: number; offX: number; offY: number },
      newFit: { s: number; offX: number; offY: number }
    ) => {
      if (!p?.points?.length) return;
      context.save();
      context.beginPath();
      context.lineWidth = (Number(p.width) || 2) * (newFit.s / oldFit.s);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      if (p.mode === 'hide') {
        context.globalCompositeOperation = 'destination-out';
        context.strokeStyle = '#000';
      } else {
        context.globalCompositeOperation = 'source-over';
        context.strokeStyle = typeof p.color === 'string' ? p.color : '#000';
      }

      const toDst = (pt: StrokePoint) => {
        const xImg = (pt.x - oldFit.offX) / oldFit.s;
        const yImg = (pt.y - oldFit.offY) / oldFit.s;
        return {
          x: newFit.offX + xImg * newFit.s,
          y: newFit.offY + yImg * newFit.s,
        };
      };

      const p0 = toDst(p.points[0]);
      context.moveTo(p0.x, p0.y);
      for (let i = 1; i < p.points.length; i++) {
        const q = toDst(p.points[i]);
        context.lineTo(q.x, q.y);
      }
      context.stroke();
      context.closePath();
      context.restore();
    };

    const drawShapeTransformed = (
      s0: Shape,
      oldFit: { s: number; offX: number; offY: number },
      newFit: { s: number; offX: number; offY: number }
    ) => {
      const toDst = (x: number, y: number) => {
        const xImg = (x - oldFit.offX) / oldFit.s;
        const yImg = (y - oldFit.offY) / oldFit.s;
        return { x: newFit.offX + xImg * newFit.s, y: newFit.offY + yImg * newFit.s };
      };

      context.save();
      context.beginPath();
      context.strokeStyle = s0.color ?? '#000';
      context.lineWidth = (s0.lineWidth ?? 2) * (newFit.s / oldFit.s);
      context.lineCap = 'round';
      context.lineJoin = 'round';

      if (s0.type === 'rectangle') {
        const p1 = toDst(s0.x, s0.y);
        const p2 = toDst(s0.x + s0.width, s0.y + s0.height);
        context.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      } else {
        const c = toDst(s0.x, s0.y);
        const rImg = (s0.radius ?? 0) / oldFit.s;
        const rDst = rImg * newFit.s;
        context.arc(c.x, c.y, rDst, 0, Math.PI * 2);
        context.stroke();
      }
      context.closePath();
      context.restore();
    };

    /// Lay down each sketch, layer by layer
    for (const layer of overlayLayers) {
      const img = layer.background;
      if (!img) continue;

      const imgW = img.naturalWidth || img.width;
      const imgH = img.naturalHeight || img.height;

      const dstFit = fitImage(imgW, imgH, dstW, dstH);

      const srcW = layer.canvasWidth ?? dstW;
      const srcH = layer.canvasHeight ?? dstH;
      const srcFit = fitImage(imgW, imgH, srcW, srcH);

      /// Map Image
      if (layer.showBackground) {
        context.drawImage(img, dstFit.offX, dstFit.offY, imgW * dstFit.s, imgH * dstFit.s);
      }

      if (!layer.showSketches) continue;

      /// Strokes
      for (const p of layer.penPaths) drawStrokeTransformed(p, srcFit, dstFit);

      /// Shapes
      for (const sh of layer.shapes) drawShapeTransformed(sh, srcFit, dstFit);
    }
  }, [context, overlayLayers]);

  /// Initialize canvas/overlay element
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;
    setContext(context);

    const pixelRatio = window.devicePixelRatio || 1;
    const resize = () => {
      const border = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(border.width * pixelRatio));
      canvas.height = Math.max(1, Math.floor(border.height * pixelRatio));
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      redraw();
    };

    const obs = new ResizeObserver(resize);
    obs.observe(canvas);
    resize();

    return () => {
      obs.disconnect();
    };
  }, [redraw]);

  /// Reload overlay element
  useEffect(() => {
    redraw();
  }, [overlayLayers, redraw]);

  const download = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      redraw();
      await new Promise(requestAnimationFrame)
    } catch {
      return null;
    }
    const fallback = () => {
      const data = canvas.toDataURL('image/png');
      const img = document.createElement('a');
      img.href = data;
      img.download = `overlay-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
      document.body.appendChild(img);
      img.click();
      img.remove();
    }
    if (canvas.toBlob) {
      canvas.toBlob((blob) => {
        if (!blob) return fallback();
        const objectUrl = URL.createObjectURL(blob);
        const imgElement = document.createElement('a');
        imgElement.href = objectUrl;
        imgElement.download = `overlay-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
        document.body.appendChild(imgElement);
        imgElement.click();
        imgElement.remove();
        URL.revokeObjectURL(objectUrl);
      }, 'image/png');
    } else {
      fallback();
    }
  }

  if (loading) {
    return <p className="p-6 text-gray-500">Loading...</p>;
  }
  if (!authenticated) return null;

  return (
    <div className="min-h-screen flex bg-[var(--panel-bg)] text-[var(--panel-text)] transition-colors">
      {/* Sidebar */}

      <MainSide user={userID} role={userRole} />


      {/* Main area */}
      <div className="flex flex-col w-full p-6 pt-16 bg-[var(--panel-bg)] text-[var(--panel-text)] transition-colors duration-300 overflow-auto-center">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold">Map Overlay Tool</h1>
          <button
            onClick={() => router.push('/maps')}
            className="px-4 py-2 bg-[var(--button-bg)] hover:bg-[var(--hover-bg)] text-[var(--panel-text)] rounded border transition-colors duration-200"
          >
            ← Back to Dashboard
          </button>
        </div>

        {/* Map table */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-semibold">Maps</h2>
            {mapsLoading && (
              <span className="text-sm opacity-60">Pulling Maps...</span>
            )}
            {mapsError && (
              <span className="text-sm text-red-500">ERROR GETTING MAPS: {mapsError}</span>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--panel-bg)]">
            <table className="min-w-full text-sm border-collapse">
              <thead className="bg-[var(--hover-bg)] text-[var(--panel-text)] opacity-80">
                <tr>
                  <th className="px-4 py-3 text-left font-medium w-20">
                    Thumbnail
                  </th>
                  <th className="px-4 py-3 text-left font-medium">Map Title</th>
                  <th className="px-4 py-3 text-left font-medium w-48">
                    Last Updated
                  </th>
                  <th className="px-4 py-3 text-right font-medium w-40">
                    Add To Overlay
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {maps.length === 0 && !mapsLoading ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center opacity-80"
                    >
                      No maps.
                    </td>
                  </tr>
                ) : (
                  maps.map(map => (
                    <tr
                      key={map._id}
                      className="hover:bg-[var(--hover-bg)] transition-colors"
                    >
                      <td className="px-4 py-3 align-middle">
                        <div className="w-14 h-10 rounded border border-[var(--border-color)] overflow-hidden bg-[var(--canvas-bg)]">
                          <img
                            src={`/flask-api/maps/${encodeURIComponent(
                              map._id
                            )}/thumb?user_id=${encodeURIComponent(userID)}`}
                            alt={map.title || 'Thumbnail'}
                            className="w-full h-full object-cover"
                            onError={e => {
                              (e.currentTarget as HTMLImageElement).style.display =
                                'none';
                            }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span className="font-medium">
                          {map.title || 'Untitled Map'}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle opacity-80">
                        {getDate(map.updated_at)}
                      </td>
                      <td className="px-4 py-3 align-middle text-right">
                        <button
                          onClick={() => addToOverlay(map)}
                          className="px-4 py-3 align-middle opacity-80"
                        >
                          Add to Overlay
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Element containing canvas/overlay element and toggle controls */}
        {overlayLayers.length > 0 && (
          <section className="mt-4 flex-1 flex flex-col min-h-0">
            <h2 className="text-xl font-semibold mb-4 text-center">Overlay</h2>

            {/* Canvas/Overlay Element */}
            <div className="flex-1 min-h-0 px-4 pb-4">
              <div className="h-full flex justify-center items-center">
                <canvas
                  ref={canvasRef}
                  className="w-full max-w-5xl h-full max-h-[calc(100vh-220px)] bg-white rounded shadow-inner touch-none"
                />
              </div>
            </div>

            {/* Download button */}
            <div className='max-w-5xl mx-auto w-full'>
              <div className='flex justify-center mt-4'>
                <button
                  onClick={download}
                  className='px-4 py-3 align-middle opacity-80 hover:opacity-240'
                >
                  Download Overlay
                </button>
              </div>
            </div>
            {/* Toggles for Map Images and Sketches */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {overlayLayers.map(map => (
                <div
                  key={map.mapId}
                  className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--panel-bg)]"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium truncate">
                      {map.title || 'Untitled Map'}
                    </div>
                    <button
                      onClick={() => removeFromOverlay(map.mapId)}
                      className="px-3 py-1.5 rounded bg-red-600 text-white text-xs hover:bg-red-700"
                    >
                      Remove from Overlay
                    </button>
                  </div>

                  {map.loading && (
                    <p className="text-xs opacity-70">Putting Map on the Canvas...</p>
                  )}
                  {map.error && (
                    <p className="text-xs text-red-500">
                      {map.error}
                    </p>
                  )}

                  <div className="mt-2 space-y-2 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={map.showBackground}
                        onChange={() =>
                          toggleLayerBackground(map.mapId)
                        }
                      />
                      <span>Show Image for {map.title}</span>
                    </label>
                    <br></br>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={map.showSketches}
                        onChange={() =>
                          toggleLayerSketches(map.mapId)
                        }
                      />
                      <span>Show Sketches for {map.title}</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}