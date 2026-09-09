import { env } from 'cloudflare:workers';
import { authenticatedEmail, isAllowedEmail } from '../../auth';

export const runtime = 'edge';

function actorFor(request: Request) {
  const email = authenticatedEmail(request.headers);
  if (!email) return { error: Response.json({ error: 'נדרשת התחברות ל-ChatGPT.' }, { status: 401 }) };
  if (!isAllowedEmail(email)) return { error: Response.json({ error: 'אין לחשבון הזה הרשאה לסביבת העבודה.' }, { status: 403 }) };
  return { email, name: email === 'nisank2@gmail.com' ? 'Nissan' : 'Maoz' } as const;
}

function ids(value: unknown) {
  try { const parsed = JSON.parse(String(value || '[]')); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; }
}

export async function GET(request: Request) {
  const actor = actorFor(request); if ('error' in actor) return actor.error;
  const { results } = await env.DB.prepare('SELECT id,title,area,version,archived_at FROM tasks WHERE archived_at IS NOT NULL ORDER BY archived_at DESC LIMIT 100').all();
  return Response.json(results.map((row) => ({ id: String(row.id), title: String(row.title), area: String(row.area), version: Number(row.version), archivedAt: String(row.archived_at) })), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const actor = actorFor(request); if ('error' in actor) return actor.error;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: 'הבקשה אינה תקינה.' }, { status: 400 }); }
  const id = String(body.id ?? '').trim(), version = Number(body.version ?? 0);
  if (!id || id.length > 64 || !Number.isInteger(version) || version < 1) return Response.json({ error: 'פרטי המשימה אינם תקינים.' }, { status: 400 });
  const row = await env.DB.prepare('SELECT dependencies,parent_task_id FROM tasks WHERE id=? AND version=? AND archived_at IS NOT NULL').bind(id, version).first();
  if (!row) return Response.json({ error: 'המשימה עודכנה בינתיים או כבר שוחזרה.' }, { status: 409 });
  const linkedIds = [...ids(row.dependencies), String(row.parent_task_id || '')].filter(Boolean);
  if (linkedIds.length) {
    const placeholders = linkedIds.map(() => '?').join(',');
    const { results } = await env.DB.prepare(`SELECT id FROM tasks WHERE id IN (${placeholders}) AND archived_at IS NULL`).bind(...linkedIds).all();
    if (results.length !== linkedIds.length) return Response.json({ error: 'יש לשחזר קודם את משימת העל או את משימות התלות.' }, { status: 409 });
  }
  const restoredAt = new Date().toISOString();
  const result = await env.DB.prepare('UPDATE tasks SET archived_at=NULL,version=version+1,updated_at=? WHERE id=? AND version=? AND archived_at IS NOT NULL').bind(restoredAt, id, version).run();
  if (!result.meta.changes) return Response.json({ error: 'המשימה עודכנה בינתיים.' }, { status: 409 });
  await env.DB.prepare('INSERT INTO task_events (id,task_id,actor_email,actor_name,event_type,summary,details,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), id, actor.email, actor.name, 'restored', 'שחזר את המשימה מהארכיון', '{}', restoredAt).run();
  return Response.json({ ok: true });
}
