'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type XYT = { k: number; x: number; y: number } | null;

type Draft = {
  title: string;
  region: string;
  content: string;
  saved: boolean; 
};

type Props = {
  // required earlier
  leftRegion?: string | null;
  rightRegion?: string | null;
  leftLevel: number;
  rightLevel: number;

  // NEW: so we can persist/restore highlights exactly
  activeLayers: Set<string>;
  selectedColor: string;

  leftTiles: string[];
  rightTiles: string[];

  leftTransform: XYT;
  rightTransform: XYT;

  leftCheck: boolean;
  leftCheckTest: boolean;
  rightCheck: boolean;
  rightCheckTest: boolean;
};

function newKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fence(label: 'atlas' | 'atlas_dual', obj: any) {
  return `\n\n\`\`\`${label}\n${JSON.stringify(obj)}\n\`\`\``;
}

function buildSingleAtlasMeta(args: {
  side: 'left' | 'right';
  level: number;
  region?: string | null;
  tiles: string[];
  color: string;
  layers: string[];
  check: boolean;
  checkTest: boolean;
  transform: XYT;
}) {
  const { side, level, region, tiles, color, layers, check, checkTest, transform } = args;
  return {
    atlas_side: side,
    atlas_level: level,
    selected_region: region ?? null,
    selected_tiles: tiles ?? [],
    highlight_color: color,
    active_layers: layers ?? ['layer-MC3'],
    is_check: !!check,
    is_check_test: !!checkTest,
    transform: transform ? { k: +transform.k, x: +transform.x, y: +transform.y } : null,
  };
}

export default function DualNotesFooter(props: Props) {
  const {
    leftRegion, rightRegion, leftLevel, rightLevel,
    activeLayers, selectedColor,
    leftTiles, rightTiles,
    leftTransform, rightTransform,
    leftCheck, leftCheckTest, rightCheck, rightCheckTest,
  } = props;

  const router = useRouter();

  const [L, setL] = useState<Draft>({
    title: '',
    region: (leftRegion || '').toString(),
    content: '',
    saved: false,
  });
  const [R, setR] = useState<Draft>({
    title: '',
    region: (rightRegion || '').toString(),
    content: '',
    saved: false,
  });

  // keep inputs synced with current selections
  useEffect(() => {
    setL(p => (p.region === (leftRegion || '').toString() ? p : { ...p, region: (leftRegion || '').toString() }));
  }, [leftRegion]);
  useEffect(() => {
    setR(p => (p.region === (rightRegion || '').toString() ? p : { ...p, region: (rightRegion || '').toString() }));
  }, [rightRegion]);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const leftKey = useMemo(() => newKey('left'), []);
  const rightKey = useMemo(() => newKey('right'), []);

  const canSaveLeftDraft  = !!L.title.trim();
  const canSaveRightDraft = !!R.title.trim();
  const canSaveBoth = L.saved && R.saved && !!L.title.trim() && !!R.title.trim() && !busy;

  const postCreate = async (body: any) =>
    fetch('/flask-api/notes/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });

  const saveDraft = (side: 'left' | 'right') => {
    if (side === 'left') {
      if (!canSaveLeftDraft) return;
      setL(p => ({ ...p, saved: true }));
      setMsg('Left draft saved.');
    } else {
      if (!canSaveRightDraft) return;
      setR(p => ({ ...p, saved: true }));
      setMsg('Right draft saved.');
    }
  };

  const saveBoth = async () => {
    if (!canSaveBoth) return;
    setBusy(true);
    setMsg(null);

    try {
      const layers = Array.from(activeLayers ?? new Set<string>(['layer-MC3']));

      // Build precise atlas meta for each side
      const leftMeta  = buildSingleAtlasMeta({
        side: 'left',  level: leftLevel,  region: L.region || leftRegion || null,
        tiles: leftTiles,  color: selectedColor, layers,
        check: leftCheck, checkTest: leftCheckTest, transform: leftTransform
      });
      const rightMeta = buildSingleAtlasMeta({
        side: 'right', level: rightLevel, region: R.region || rightRegion || null,
        tiles: rightTiles, color: selectedColor, layers,
        check: rightCheck, checkTest: rightCheckTest, transform: rightTransform
      });

      const dualPayload = { mode: 'dual', left: leftMeta, right: rightMeta };

      // Human-readable text
      const prose =
        `Left — ${L.title}\n${L.content || ''}\n\nRight — ${R.title}\n${R.content || ''}`.trim();

      // IMPORTANT: include a single `atlas` fallback (left pane) so previews still work,
      // and the new `atlas_dual` so dual-restore works.
      const details = prose + fence('atlas_dual', dualPayload) + fence('atlas', leftMeta);

      const payload = {
        title: `${L.title.trim()} ↔ ${R.title.trim()}`,
        content: details,
        details,                                 // some APIs look for `details` instead of `content`
        region: [L.region || '', R.region || ''].filter(Boolean).join(' | '),
        selected_region: [L.region || '', R.region || ''].filter(Boolean).join(' | '),
        idempotency_key: `${leftKey}__${rightKey}`,
      };

      const res = await postCreate(payload);
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Save failed: ${res.status} ${txt}`);
      }
      setMsg('Saved. Redirecting…');
      router.push('/notes');
    } catch (e: any) {
      setMsg(typeof e?.message === 'string' ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const clearDrafts = () => {
    setL({ title: '', region: (leftRegion || '').toString(), content: '', saved: false });
    setR({ title: '', region: (rightRegion || '').toString(), content: '', saved: false });
    setMsg(null);
  };

  // UI styles: same scheme as single-view note bar
  const input =
    'rounded-md bg-white text-neutral-900 placeholder-neutral-400 ' +
    'w-full px-3 py-2 border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-500';
  const btn =
    'rounded-md px-3 py-2 text-sm font-medium transition active:scale-95';
  const btnPrimary = `${btn} bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50`;
  const btnGhost   = `${btn} border border-[var(--border-color)] bg-[var(--panel-bg)] text-[var(--panel-text)] hover:bg-[var(--hover-bg)]`;
  const btnSoft    = `${btn} bg-[var(--button-bg)] text-[var(--button-text)] hover:bg-[var(--button-hover)] disabled:opacity-50`;

  return (
    <div className="w-full sticky bottom-0 z-20 border-t border-[var(--border-color)] bg-[var(--navbar-bg)] text-[var(--navbar-text)]">
      <div className="mx-auto max-w-[1600px] px-2 py-2">
        <div className="grid grid-cols-2 gap-3">
          {/* LEFT */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                placeholder="Note Title"
                className={input}
                value={L.title}
                onChange={(e) => setL((p) => ({ ...p, title: e.target.value }))}
              />
              <input
                placeholder="Selected Region"
                className={input}
                value={L.region}
                onChange={(e) => setL((p) => ({ ...p, region: e.target.value }))}
              />
              <button className={btnGhost} onClick={() => router.push('/notes')}>
                View<br/>Notes
              </button>
              <button
                type="button"
                disabled={!canSaveLeftDraft || busy}
                onClick={() => saveDraft('left')}
                className={btnPrimary}
                title="Save left draft (does not persist yet)"
              >
                {L.saved ? 'Draft Saved' : 'Save Draft'}
              </button>
            </div>
            <textarea
              placeholder="Enter details..."
              className={`${input} !h-24 resize-vertical`}
              value={L.content}
              onChange={(e) => setL((p) => ({ ...p, content: e.target.value }))}
            />
          </div>

          {/* RIGHT */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                placeholder="Note Title"
                className={input}
                value={R.title}
                onChange={(e) => setR((p) => ({ ...p, title: e.target.value }))}
              />
              <input
                placeholder="Selected Region"
                className={input}
                value={R.region}
                onChange={(e) => setR((p) => ({ ...p, region: e.target.value }))}
              />
              <button className={btnGhost} onClick={() => router.push('/notes')}>
                View<br/>Notes
              </button>
              <button
                type="button"
                disabled={!canSaveRightDraft || busy}
                onClick={() => saveDraft('right')}
                className={btnPrimary}
                title="Save right draft (does not persist yet)"
              >
                {R.saved ? 'Draft Saved' : 'Save Draft'}
              </button>
            </div>
            <textarea
              placeholder="Enter details..."
              className={`${input} !h-24 resize-vertical`}
              value={R.content}
              onChange={(e) => setR((p) => ({ ...p, content: e.target.value }))}
            />
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <button type="button" onClick={clearDrafts} className={btnGhost}>
              Clear Drafts
            </button>
            {msg && <div className="text-sm">{msg}</div>}
          </div>

          <button
            type="button"
            disabled={!canSaveBoth}
            onClick={saveBoth}
            className={btnSoft}
            title="Persist both drafts in a single note and go to Notes"
          >
            {busy ? 'Saving…' : 'Save Both'}
          </button>
        </div>
      </div>
    </div>
  );
}
