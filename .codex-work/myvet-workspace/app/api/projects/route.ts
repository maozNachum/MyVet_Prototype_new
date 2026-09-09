import { env } from 'cloudflare:workers';
import { authenticatedEmail, isAllowedEmail } from '../../auth';

export const runtime = 'edge';
const owners = ['Maoz', 'Nissan'] as const;
const statuses = ['Planned', 'Active', 'Paused', 'Done'] as const;
const healthValues = ['On track', 'At risk', 'Off track'] as const;

function actor(request: Request) {
  const email = authenticatedEmail(request.headers);
  if (!email) return { error: Response.json({ error: 'נדרשת התחברות ל-ChatGPT.' }, { status: 401 }) };
  if (!isAllowedEmail(email)) return { error: Response.json({ error: 'אין לחשבון הזה הרשאה לסביבת העבודה.' }, { status: 403 }) };
  return { email, name: email === 'nisank2@gmail.com' ? 'Nissan' : 'Maoz' } as const;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number), date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validate(body: Record<string, unknown>, updating = false) {
  const id = String(body.id ?? '').trim(), name = String(body.name ?? '').trim(), color = String(body.color ?? '#6559d4').trim();
  const owner = String(body.owner ?? ''), status = String(body.status ?? ''), health = String(body.health ?? '');
  const startDate = String(body.startDate ?? ''), dueDate = String(body.dueDate ?? ''), description = String(body.description ?? '').trim(), version = Number(body.version ?? 0);
  if (updating && (!id || id.length > 64 || !Number.isInteger(version) || version < 1)) return { error: 'גרסת הפרויקט חסרה. יש לרענן ולנסות שוב.' };
  if (!name || name.length > 100) return { error: 'יש להזין שם פרויקט באורך של עד 100 תווים.' };
  if (!/^#[0-9a-f]{6}$/i.test(color)) return { error: 'צבע הפרויקט אינו תקין.' };
  if (!owners.includes(owner as typeof owners[number])) return { error: 'יש לבחור בעלים לפרויקט.' };
  if (!statuses.includes(status as typeof statuses[number])) return { error: 'סטטוס הפרויקט אינו תקין.' };
  if (!healthValues.includes(health as typeof healthValues[number])) return { error: 'מצב הפרויקט אינו תקין.' };
  if (!validDate(startDate) || !validDate(dueDate) || dueDate < startDate) return { error: 'טווח התאריכים של הפרויקט אינו תקין.' };
  if (description.length > 2000) return { error: 'תיאור הפרויקט ארוך מדי.' };
  return { value: { id, name, color, owner, status, health, startDate, dueDate, description, version } };
}

function parse(row: Record<string, unknown>) { return { id: String(row.id), name: String(row.name), color: String(row.color), owner: String(row.owner), status: String(row.status), health: String(row.health), startDate: String(row.start_date), dueDate: String(row.due_date), description: String(row.description || ''), version: Number(row.version || 1), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }; }

export async function GET(request: Request) {
  const user = actor(request); if ('error' in user) return user.error;
  const { results } = await env.DB.prepare('SELECT * FROM projects WHERE archived_at IS NULL ORDER BY updated_at DESC').all();
  return Response.json(results.map((row) => parse(row as Record<string, unknown>)), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const user = actor(request); if ('error' in user) return user.error;
  let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: 'הבקשה אינה תקינה.' }, { status: 400 }); }
  const validated = validate(body); if (!validated.value) return Response.json({ error: validated.error }, { status: 400 });
  const project = validated.value, id = `PRJ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO projects (id,name,color,owner,status,health,start_date,due_date,description,version,archived_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,NULL,?,?)').bind(id, project.name, project.color, project.owner, project.status, project.health, project.startDate, project.dueDate, project.description, now, now).run();
  const row = await env.DB.prepare('SELECT * FROM projects WHERE id=?').bind(id).first();
  return Response.json(parse(row as Record<string, unknown>), { status: 201 });
}

export async function PATCH(request: Request) {
  const user = actor(request); if ('error' in user) return user.error;
  let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: 'הבקשה אינה תקינה.' }, { status: 400 }); }
  const validated = validate(body, true); if (!validated.value) return Response.json({ error: validated.error }, { status: 400 });
  const project = validated.value, now = new Date().toISOString();
  const result = await env.DB.prepare('UPDATE projects SET name=?,color=?,owner=?,status=?,health=?,start_date=?,due_date=?,description=?,version=version+1,updated_at=? WHERE id=? AND version=? AND archived_at IS NULL').bind(project.name, project.color, project.owner, project.status, project.health, project.startDate, project.dueDate, project.description, now, project.id, project.version).run();
  if (!result.meta.changes) return Response.json({ error: 'הפרויקט עודכן בינתיים. רעננו ונסו שוב.' }, { status: 409 });
  const row = await env.DB.prepare('SELECT * FROM projects WHERE id=?').bind(project.id).first();
  return Response.json(parse(row as Record<string, unknown>));
}
