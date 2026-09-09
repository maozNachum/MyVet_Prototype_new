import { env } from 'cloudflare:workers';
import { authenticatedEmail, isAllowedEmail } from '../../auth';

export const runtime = 'edge';

function actor(request: Request) {
  const email = authenticatedEmail(request.headers);
  if (!email) return { error: Response.json({ error: 'נדרשת התחברות ל-ChatGPT.' }, { status: 401 }) };
  if (!isAllowedEmail(email)) return { error: Response.json({ error: 'אין לחשבון הזה הרשאה לסביבת העבודה.' }, { status: 403 }) };
  return { name: email === 'nisank2@gmail.com' ? 'Nissan' : 'Maoz' } as const;
}

function parsed(row: Record<string, unknown>) {
  let taskData: unknown = {}; try { taskData = JSON.parse(String(row.task_data || '{}')); } catch {}
  return { id: String(row.id), name: String(row.name), taskData, createdBy: String(row.created_by), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

export async function GET(request: Request) {
  const user = actor(request); if ('error' in user) return user.error;
  const { results } = await env.DB.prepare('SELECT * FROM task_templates ORDER BY updated_at DESC').all();
  return Response.json(results.map((row) => parsed(row as Record<string, unknown>)), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const user = actor(request); if ('error' in user) return user.error;
  let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: 'הבקשה אינה תקינה.' }, { status: 400 }); }
  const name = String(body.name ?? '').trim(), taskData = body.taskData && typeof body.taskData === 'object' ? body.taskData as Record<string, unknown> : null;
  if (!name || name.length > 100) return Response.json({ error: 'יש להזין שם תבנית באורך של עד 100 תווים.' }, { status: 400 });
  if (!taskData) return Response.json({ error: 'נתוני התבנית אינם תקינים.' }, { status: 400 });
  const allowed = ['title','description','owner','assignees','priority','status','area','projectId','tags','blocker','milestone','reminderMinutes','recurrenceRule','recurrenceEnd'];
  const sanitized = Object.fromEntries(allowed.filter((key) => key in taskData).map((key) => [key, taskData[key]]));
  const serialized = JSON.stringify(sanitized);
  if (serialized.length > 20_000) return Response.json({ error: 'התבנית גדולה מדי.' }, { status: 413 });
  const id = `TPL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO task_templates (id,name,task_data,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(id, name, serialized, user.name, now, now).run();
  const row = await env.DB.prepare('SELECT * FROM task_templates WHERE id=?').bind(id).first();
  return Response.json(parsed(row as Record<string, unknown>), { status: 201 });
}

export async function DELETE(request: Request) {
  const user = actor(request); if ('error' in user) return user.error;
  let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: 'הבקשה אינה תקינה.' }, { status: 400 }); }
  const id = String(body.id ?? '').trim(); if (!id || id.length > 64) return Response.json({ error: 'מזהה התבנית אינו תקין.' }, { status: 400 });
  const result = await env.DB.prepare('DELETE FROM task_templates WHERE id=?').bind(id).run();
  if (!result.meta.changes) return Response.json({ error: 'התבנית לא נמצאה.' }, { status: 404 });
  return Response.json({ ok: true });
}
