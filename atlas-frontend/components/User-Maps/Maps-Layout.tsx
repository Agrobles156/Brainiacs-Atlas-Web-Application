'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import MainSide from '@/components/Sidebar';

import UserMapsCollection from '@/components/User-Maps/Maps-Collection';
import UploadsCollection from '@/components/User-Maps/Image-Uploads-Collection';

type UploadRecord = {
  _id: string;
  title?: string;
  filename: string;
  mimeType?: string;
  sizeBytes?: number;
  uploaded_at: string;
  used_in_maps?: string[];
};

type MapRecord = {
  _id: string;
  title: string;
  base_upload_id: string;
  thumb_id?: string | null;
  public?: boolean;
  layers_count?: number;
  created_at?: string | null;
  updated_at?: string | null;
};

const normalizeUpload = (u: any): UploadRecord => ({
  _id: u._id,
  title: u.title,
  filename: u.filename,
  mimeType: u.mimeType ?? u.mime,
  sizeBytes: u.sizeBytes ?? u.size,
  uploaded_at: u.uploaded_at ?? u.created_at,
  used_in_maps: u.used_in_maps ?? [],
});

const normalizeMap = (m: any): MapRecord => ({
  _id: m._id,
  title: m.title ?? 'Untitled Map',
  base_upload_id: m.base_upload_id ?? m.base_image_id ?? m.base_image?.file_id ?? '',
  thumb_id: m.thumb_id ?? null,
  public: m.public ?? false,
  layers_count: Array.isArray(m.layers) ? m.layers.length : (m.layers_count ?? undefined),
  created_at: m.created_at ?? null,
  updated_at: m.updated_at ?? null
});

type TabKey = 'maps' | 'uploads';

export default function MapsLayout() {
  const router = useRouter();
  const [whoami, setWhoami] = useState('');
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/flask-api/whoami', { credentials: 'include' });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error();
        setWhoami(d.message);
        setRole(d.role);
      } catch {
        router.push('/login');
      }
    })();
  }, [router]);

  const [tab, setTab] = useState<TabKey>('maps');
  const [maps, setMaps] = useState<MapRecord[]>([]);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [visibility] = useState<'public' | 'private'>('private');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!whoami) return;
    let abort = false;

    (async () => {
      try {
        setLoading(true);
        const qs = `?user_id=${encodeURIComponent(whoami)}`;

        const [mRes, uRes] = await Promise.all([
          fetch(`/flask-api/maps${qs}`, { credentials: 'include' }),
          fetch(`/flask-api/imageuploads${qs}`, { credentials: 'include' }),
        ]);

        const mJson = await mRes.json();
        const uJson = await uRes.json();

        if (!abort) {
          setMaps((mJson ?? []).map(normalizeMap));
          setUploads((uJson ?? []).map(normalizeUpload));
        }
      } catch (e: any) {
        if (!abort) setErr(e?.message || 'Failed to load data.');
      } finally {
        if (!abort) setLoading(false);
      }
    })();

    return () => {
      abort = true;
    };
  }, [whoami]);

  const hasData = useMemo(
    () => (tab === 'maps' ? maps.length > 0 : uploads.length > 0),
    [tab, maps.length, uploads.length]
  );

  const openPicker = () => fileRef.current?.click();

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    try {
      setBusy(true);
      setErr(null);
      setSuccess(null);

      const fd = new FormData();
      fd.append('file', f);
      fd.append('title', title || f.name.replace(/\.[^.]+$/, ''));
      fd.append('preferred_visibility', visibility);

      const qs = new URLSearchParams({ user_id: whoami });
      const r = await fetch(`/flask-api/imageuploads/create?${qs}`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });

      const created = normalizeUpload(await r.json());
      setUploads((p) => [created, ...p]);
      setSuccess('Image uploaded.');
      setTab('uploads');
      setTitle('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (e: any) {
      setErr(e?.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const buildEditorHref = (m: MapRecord) => {
    const qs = new URLSearchParams({
      mapId: m._id,
      user_id: whoami || '',
      ...(m.base_upload_id && { uploadId: m.base_upload_id }),
      imageUrl: `/flask-api/maps/${m._id}/background?user_id=${whoami}`,
    });
    return `/whiteboard?${qs}`;
  };

  return (
    <div className="min-h-screen flex bg-[var(--panel-bg)] text-[var(--panel-text)] transition-colors pt-16">

      {/* Sidebar */}
      <MainSide user={whoami} role={role} />

      {/* Main */}
      <div className="flex-1">
        <main className="px-6 py-6 w-full grid gap-6">

          {/* Upload Card */}
          <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--panel-bg)] shadow-sm p-5 transition-colors">
            <h2 className="text-lg font-semibold">Start a New Map</h2>

            <p className="text-sm opacity-80 mb-4">
              Upload a brain image to start annotating.
            </p>

            {err && (
              <div className="mt-3 rounded-lg px-3 py-2 text-sm border bg-[var(--error-bg)] text-[var(--error-text)] border-[var(--error-border)]">
                {err}
              </div>
            )}
            {success && (
              <div className="mt-3 rounded-lg px-3 py-2 text-sm border bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)]">
                {success}
              </div>
            )}
          </section>

          {/* Tabs Section */}
          <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--panel-bg)] shadow-sm transition-colors">

            {/* Tabs Header */}
            <div className="border-b border-[var(--border-color)] px-5 pt-4">
              <nav className="flex gap-4">
                {['maps','uploads'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t as TabKey)}
                    className={`pb-3 text-sm transition-colors ${
                      tab === t
                        ? 'border-b-2 border-blue-500 font-semibold text-blue-500'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    {t === 'maps' ? 'My Maps' : 'My Uploads'}
                  </button>
                ))}

                <div className="flex items-center gap-2 ml-auto">
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/tiff" onChange={onPickFile} className="hidden" />
                  <button
                    onClick={openPicker}
                    disabled={busy}
                    className="rounded-xl bg-blue-600 text-white px-4 py-2 text-sm disabled:opacity-50"
                  >
                    {busy ? 'Uploading…' : 'Choose Image'}
                  </button>
                  <Link href="/overlay">
                    <button className="rounded-xl bg-blue-600 text-white px-4 py-2 text-sm disabled:opacity-50">
                      Overlay
                    </button>
                  </Link>
                </div>
              </nav>
            </div>

            {/* Body */}
            <div className="p-5">
              {loading ? (
                <p className="opacity-80">Loading…</p>
              ) : !hasData ? (
                <p className="opacity-80">
                  {tab === 'maps'
                    ? 'No maps yet.'
                    : 'No uploads yet.'}
                </p>
              ) : tab === 'maps' ? (
                <UserMapsCollection
                  maps={maps}
                  onChange={setMaps}
                  baseUrl="/flask-api"
                  userId={whoami}
                  buildEditorHref={buildEditorHref}
                />
              ) : (
                <UploadsCollection
                  uploads={uploads}
                  onChange={setUploads}
                  baseUrl="/flask-api"
                  userId={whoami}
                />
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
