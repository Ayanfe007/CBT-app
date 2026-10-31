import { z } from 'zod';
import { hash } from 'bcryptjs';
import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/verify';
import { supabaseAdmin } from '@/lib/supabase/admin';

const bulkSchema = z.object({
  names: z.string().min(1),
});

function generateLoginId(fullName: string, idx: number): string {
  const base = fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${base}_${idx + 1000}`;
}

function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  const parsed = bulkSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
  }

  const lines = parsed.data.names
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const credentials: Array<{ full_name: string; login_id: string; pin: string }> = [];
  const rows: Array<{
    full_name: string;
    login_id: string;
    pin_hash: string;
  }> = [];

  lines.forEach((line, idx) => {
    let name = line;
    let regNumber: string | undefined;
    const commaIdx = line.indexOf(',');
    if (commaIdx !== -1) {
      name = line.slice(0, commaIdx).trim();
      regNumber = line.slice(commaIdx + 1).trim();
    }
    const full_name = name || `Student ${idx + 1}`;
    const login_id = regNumber || generateLoginId(full_name, idx);
    const pin = generatePin();
    credentials.push({ full_name, login_id, pin });
    rows.push({ full_name, login_id, pin_hash: '' }); // filled below
  });

  // Hash each PIN properly.
  const finalRows = await Promise.all(
    rows.map(async (r, i) => ({
      ...r,
      pin_hash: await hash(credentials[i].pin, 10),
    }))
  );

  const { error } = await supabaseAdmin.from('students').insert(finalRows);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ credentials, count: credentials.length });
}
