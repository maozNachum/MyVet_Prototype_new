import { env } from 'cloudflare:workers';
import { authenticatedEmail, isAllowedEmail } from '../../auth';

export const runtime = 'edge';

const allowedKeys = new Set(['query', 'owner', 'priority', 'status', 'area', 'sort', 'active']);

function viewer(request: Request) {
  const email = authenticatedEmail(request.headers);
  if (!email) return { error: Response.json({ error: 'נדרשת התחברות ל-ChatGPT.' }, { status: 401 }) };
  if (!isAllowedEmail(email)) return { error: Response.json({ error: 'אין לחשבון הזה הרשאה לסביבת העבודה.' }, { status: 403 }) };
  return { name: email === 'nisank2@gmail.com' ? 'Nissan' : 'Maoz' } as const;
}

function parseFilters(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!allowedKeys.has(key)) continue;
    const text = String(raw ?? '').trim();
    if (text.length > 180) return null;
    result[key] = text;
  }
  return result;
}

function rowValue(row: Record<string, unknown>) {
  let filters: Record<string, string> = {};
  try { filters = JSON.parse(String(row.filters || '{}')) as Record<string, string>; } catch { /* keep safe fallback */ }
  return { id: String(row.id), name: String(row.name), filters, createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

export async function GET(request: Request) {
  const user = viewer(request); if ('error' in user) return user.error;
  const { results } = await env.DB.prepare('SELECT * FROM saved_views WHERE owner_name=? ORDER BY updated_at DESC LIMIT 30').bind(user.name).all();
  return Response.json(results.map((row) => rowValue(row as Record<string, unknown>)), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const user = viewer(request); if ('error' in user) return user.error;
  let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: 'הבקשה אינה תקינה.' }, { status: 400 }); }
  const name = String(body.name ?? '').trim(), filters = parseFilters(body.filters);
  if (!name || name.length > 50) return Response.json({ error: 'יש להזין שם לתצוגה, עד 50 תווים.' }, { status: 400 });
  if (!filters) return Response.json({ error: 'המסננים שנשלחו אינם תקינים.' }, { status: 400 });
  const id = `VIEW-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, now = new Date().toISOString();
  try {
    await env.DB.prepare('INSERT INTO saved_views (id,owner_name,name,filters,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(id, user.name, name, JSON.stringify(filters), now, now).run();
  } catch {
    return Response.json({ error: 'כבר קיימת תצוגה בשם הזה.' }, { status: 409 });
  }
  return Response.json({ id, name, filters, createdAt: now, updatedAt: now }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = viewer(request); if ('error' in user) return user.error;
  let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: 'הבקשה אינה תקינה.' }, { status: 400 }); }
  const id = String(body.id ?? '').trim();
  if (!id || id.length > 64) return Response.json({ error: 'התצוגה שנבחרה אינה תקינה.' }, { status: 400 });
  const result = await env.DB.prepare('DELETE FROM saved_views WHERE id=? AND owner_name=?').bind(id, user.name).run();
  if (!result.meta.changes) return Response.json({ error: 'התצוגה לא נמצאה.' }, { status: 404 });
  return Response.json({ ok: true });
}
