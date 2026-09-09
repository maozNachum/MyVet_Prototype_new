import { env } from 'cloudflare:workers';
import { authenticatedEmail, isAllowedEmail } from '../../auth';

export const runtime = 'edge';

function viewer(request: Request) {
  const email = authenticatedEmail(request.headers);
  if (!email) return { error: Response.json({ error: 'נדרשת התחברות ל-ChatGPT.' }, { status: 401 }) };
  if (!isAllowedEmail(email)) return { error: Response.json({ error: 'אין לחשבון הזה הרשאה לסביבת העבודה.' }, { status: 403 }) };
  return { name: email === 'nisank2@gmail.com' ? 'Nissan' : 'Maoz' } as const;
}

export async function GET(request: Request) {
  const user = viewer(request); if ('error' in user) return user.error;
  const nowDate = new Date(), today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(nowDate);
  nowDate.setUTCDate(nowDate.getUTCDate() + 1);
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(nowDate);
  const dueTasks = await env.DB.prepare(`SELECT id,title,due_date FROM tasks WHERE archived_at IS NULL AND status!='Done' AND due_date IN (?,?) AND (owner=? OR EXISTS (SELECT 1 FROM json_each(tasks.assignees) WHERE value=?))`).bind(today, tomorrow, user.name, user.name).all();
  for (const row of dueTasks.results) {
    const type = `deadline_${String(row.due_date)}`;
    const message = String(row.due_date) === today ? `היעד של „${String(row.title)}” הוא היום` : `היעד של „${String(row.title)}” הוא מחר`;
    await env.DB.prepare(`INSERT INTO notifications (id,task_id,recipient_name,type,message,read_at,created_at) SELECT ?,?,?,?,?,NULL,? WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE task_id=? AND recipient_name=? AND type=?)`).bind(crypto.randomUUID(), String(row.id), user.name, type, message, new Date().toISOString(), String(row.id), user.name, type).run();
  }
  const { results } = await env.DB.prepare(`
    SELECT n.id,n.task_id,n.type,n.message,n.read_at,n.created_at,t.title AS task_title
    FROM notifications n
    LEFT JOIN tasks t ON t.id=n.task_id
    WHERE n.recipient_name=?
    ORDER BY n.created_at DESC
    LIMIT 100
  `).bind(user.name).all();
  return Response.json(results.map((row) => ({ id: String(row.id), taskId: String(row.task_id), taskTitle: String(row.task_title || 'משימה'), type: String(row.type), message: String(row.message), readAt: row.read_at ? String(row.read_at) : null, createdAt: String(row.created_at) })), { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  const user = viewer(request); if ('error' in user) return user.error;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: 'הבקשה אינה תקינה.' }, { status: 400 }); }
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(String).filter((id) => id && id.length <= 64))] : [];
  const now = new Date().toISOString();
  if (body.all === true) {
    await env.DB.prepare('UPDATE notifications SET read_at=? WHERE recipient_name=? AND read_at IS NULL').bind(now, user.name).run();
  } else if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    await env.DB.prepare(`UPDATE notifications SET read_at=? WHERE recipient_name=? AND id IN (${placeholders})`).bind(now, user.name, ...ids).run();
  } else {
    return Response.json({ error: 'לא נבחרו התראות לעדכון.' }, { status: 400 });
  }
  return Response.json({ ok: true, readAt: now });
}
