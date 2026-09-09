import { env } from 'cloudflare:workers';
import { authenticatedEmail, isAllowedEmail } from '../../auth';

export const runtime = 'edge';

const escapeIcs = (value: unknown) => String(value ?? '').replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(',', '\\,').replaceAll(';', '\\;');
const calendarDate = (value: unknown) => String(value ?? '').replaceAll('-', '');
const nextDay = (value: unknown) => { const date = new Date(`${String(value)}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`; };

export async function GET(request: Request) {
  const email = authenticatedEmail(request.headers);
  if (!email) return Response.json({ error: 'נדרשת התחברות ל-ChatGPT.' }, { status: 401 });
  if (!isAllowedEmail(email)) return Response.json({ error: 'אין לחשבון הזה הרשאה לסביבת העבודה.' }, { status: 403 });
  const user = email === 'nisank2@gmail.com' ? 'Nissan' : 'Maoz';
  const { results } = await env.DB.prepare(`SELECT id,title,start_date,due_date,reminder_minutes,owner,assignees,status FROM tasks WHERE archived_at IS NULL AND status!='Done' AND (owner=? OR EXISTS (SELECT 1 FROM json_each(tasks.assignees) WHERE value=?)) ORDER BY due_date`).bind(user, user).all();
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const events = results.map((row) => {
    const alarm = Number(row.reminder_minutes) > 0 ? `BEGIN:VALARM\r\nTRIGGER:-PT${Number(row.reminder_minutes)}M\r\nACTION:DISPLAY\r\nDESCRIPTION:${escapeIcs(row.title)}\r\nEND:VALARM\r\n` : '';
    return `BEGIN:VEVENT\r\nUID:${escapeIcs(row.id)}@myvet-workspace\r\nDTSTAMP:${stamp}\r\nDTSTART;VALUE=DATE:${calendarDate(row.start_date || row.due_date)}\r\nDTEND;VALUE=DATE:${nextDay(row.due_date)}\r\nSUMMARY:${escapeIcs(row.title)}\r\nDESCRIPTION:${escapeIcs(`${row.id} · ${row.status}`)}\r\n${alarm}END:VEVENT`;
  }).join('\r\n');
  const body = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nPRODID:-//MyVet Workspace//HE\r\nX-WR-CALNAME:MyVet · ${user}\r\n${events}\r\nEND:VCALENDAR\r\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="myvet-${user.toLowerCase()}-calendar.ics"`, 'Cache-Control': 'no-store' } });
}
