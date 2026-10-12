import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BASE = process.env.FLASK_BASE_URL ?? 'http://localhost:5000';

const CANDIDATES: string[] = [];

export async function GET(req: NextRequest) {
  const tried = CANDIDATES.map(p => (p.startsWith('http') ? p : BASE + p));
  return NextResponse.json(
    {
      error: 'No admin users endpoint in backend',
      hint: 'Add a GET /admin/users (or similar) in Flask that returns an array of users.',
      tried,
    },
    { status: 501 }
  );
}
