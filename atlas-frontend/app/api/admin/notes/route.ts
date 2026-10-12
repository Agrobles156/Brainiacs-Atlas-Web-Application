import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BASE = process.env.FLASK_BASE_URL ?? 'http://localhost:5000';

const PATHS = ['/notes'];

export async function GET(req: NextRequest) {
  const cookie = req.headers.get('cookie') || '';
  const tried: string[] = [];

  for (const p of PATHS) {
    const url = p.startsWith('http') ? p : BASE + p;
    tried.push(url);
    try {
      const r = await fetch(url, { method: 'GET', headers: { cookie }, cache: 'no-store' });
      if (r.ok) {
        const data = await r.json().catch(() => ({}));
        return NextResponse.json(data, { status: 200 });
      }
      const text = await r.text().catch(() => r.statusText);
      return NextResponse.json(
        { error: `Upstream ${r.status} ${r.statusText}`, detail: text.slice(0, 400), tried },
        { status: r.status }
      );
    } catch (e: any) {
      return NextResponse.json(
        { error: 'Network error to upstream', detail: e?.message || String(e), tried },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ error: 'No notes endpoints configured', tried }, { status: 501 });
}
