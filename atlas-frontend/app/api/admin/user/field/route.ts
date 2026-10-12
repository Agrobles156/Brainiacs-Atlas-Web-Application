import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      error: 'No admin field-update endpoint in backend',
      hint:
        'Add a POST /admin/user/field (or similar) in Flask that accepts {email, field, value} and updates the user.',
    },
    { status: 501 }
  );
}
