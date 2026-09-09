import { env } from 'cloudflare:workers';
import { authenticatedEmail, isAllowedEmail } from '../../auth';

export const runtime = 'edge';

export async function GET(request: Request) {
  const email = authenticatedEmail(request.headers);
  if (!email) return Response.json({ error: 'נדרשת התחברות ל-ChatGPT.' }, { status: 401 });
  if (!isAllowedEmail(email)) return Response.json({ error: 'אין לחשבון הזה הרשאה לסביבת העבודה.' }, { status: 403 });
  const { results } = await env.DB.prepare(`
    SELECT e.id,e.task_id,e.actor_name,e.event_type,e.summary,e.created_at,t.title AS task_title
    FROM task_events e
    LEFT JOIN tasks t ON t.id=e.task_id
    WHERE t.archived_at IS NULL
    ORDER BY e.created_at DESC
    LIMIT 50
  `).all();
  return Response.json(results.map((row) => ({
    id: String(row.id),
    taskId: String(row.task_id),
    taskTitle: String(row.task_title || 'משימה'),
    actorName: String(row.actor_name),
    eventType: String(row.event_type),
    summary: String(row.summary),
    createdAt: String(row.created_at),
  })), { headers: { 'Cache-Control': 'no-store' } });
}
