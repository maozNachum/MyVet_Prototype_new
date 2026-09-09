import { env } from 'cloudflare:workers';
import { authenticatedEmail, isAllowedEmail } from '../../auth';

export const runtime = 'edge';

export async function GET(request: Request) {
  const email = authenticatedEmail(request.headers);
  if (!email) return Response.json({ error: 'נדרשת התחברות ל-ChatGPT.' }, { status: 401 });
  if (!isAllowedEmail(email)) return Response.json({ error: 'אין לחשבון הזה הרשאה לסביבת העבודה.' }, { status: 403 });
  const [tasks, events] = await Promise.all([
    env.DB.prepare('SELECT * FROM tasks ORDER BY created_at ASC').all(),
    env.DB.prepare('SELECT id,task_id,actor_name,event_type,summary,details,created_at FROM task_events ORDER BY created_at ASC').all(),
  ]);
  const generatedAt = new Date().toISOString();
  return new Response(JSON.stringify({ format: 'myvet-workspace-backup-v1', generatedAt, tasks: tasks.results, activity: events.results }, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="myvet-workspace-${generatedAt.slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
