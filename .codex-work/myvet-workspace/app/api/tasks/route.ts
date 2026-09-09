import { env } from 'cloudflare:workers';
import { authenticatedEmail, isAllowedEmail } from '../../auth';

export const runtime = 'edge';

const owners = ['Maoz', 'Nissan'] as const;
const priorities = ['Urgent', 'High', 'Medium', 'Low'] as const;
const statuses = ['Backlog', 'To Do', 'In Progress', 'Review', 'Blocked', 'Done'] as const;

type Owner = (typeof owners)[number];
type StoredComment = { author: string; text: string; time: string };
type TaskInput = {
  id?: string;
  title: string;
  description: string;
  owner: Owner;
  assignees: Owner[];
  priority: (typeof priorities)[number];
  status: (typeof statuses)[number];
  startDate: string;
  dueDate: string;
  estimateMinutes: number;
  area: string;
  projectId: string;
  tags: string[];
  dependencies: string[];
  parentTaskId: string;
  blocker: string;
  milestone: boolean;
  reminderMinutes: number | null;
  recurrenceRule: '' | 'weekly' | 'monthly';
  recurrenceEnd: string;
  comments: StoredComment[];
  version?: number;
};

type GraphTask = { id: string; status: string; dependencies: string[]; parentTaskId: string };

function actorFor(request: Request) {
  const email = authenticatedEmail(request.headers);
  if (!email) return { error: Response.json({ error: 'נדרשת התחברות ל-ChatGPT.' }, { status: 401 }) };
  if (!isAllowedEmail(email)) return { error: Response.json({ error: 'אין לחשבון הזה הרשאה לסביבת העבודה.' }, { status: 403 }) };
  return { email, name: email === 'nisank2@gmail.com' ? 'Nissan' : 'Maoz' } as const;
}

function jsonArray(value: unknown, fallback: unknown[] = []) {
  try {
    const parsed = JSON.parse(String(value ?? '[]'));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parse(row: Record<string, unknown>) {
  const parsedAssignees = jsonArray(row.assignees).map(String).filter((name) => owners.includes(name as Owner));
  return {
    id: String(row.id), title: String(row.title), description: String(row.description ?? ''), owner: String(row.owner) as Owner,
    assignees: parsedAssignees.length ? parsedAssignees : [String(row.owner)], priority: String(row.priority), status: String(row.status),
    startDate: String(row.start_date || row.due_date), dueDate: String(row.due_date), estimateMinutes: Number(row.estimate_minutes || 60), area: String(row.area), projectId: String(row.project_id || ''), tags: jsonArray(row.tags).map(String),
    dependencies: jsonArray(row.dependencies).map(String), parentTaskId: String(row.parent_task_id || ''), blocker: String(row.blocker ?? ''),
    milestone: Boolean(row.milestone), reminderMinutes: typeof row.reminder_minutes === 'number' ? row.reminder_minutes : null,
    recurring: Boolean(row.recurrence_rule), recurrenceRule: String(row.recurrence_rule || ''), recurrenceEnd: String(row.recurrence_end || ''), recurrenceSourceId: row.recurrence_source_id ? String(row.recurrence_source_id) : null, comments: jsonArray(row.comments) as StoredComment[], version: Number(row.version || 1),
    archivedAt: row.archived_at ? String(row.archived_at) : null, createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function stringArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const items = value.map((item) => String(item).trim());
  return items.every((item) => item.length > 0 && item.length <= maxLength) ? [...new Set(items)] : null;
}

function validate(body: Record<string, unknown>, requireId: boolean): { value?: TaskInput; error?: string } {
  const id = String(body.id ?? '').trim(), title = String(body.title ?? '').trim(), description = String(body.description ?? '').trim();
  const owner = String(body.owner ?? ''), assignees = stringArray(body.assignees ?? (owner ? [owner] : []), 2, 20);
  const priority = String(body.priority ?? ''), status = String(body.status ?? '');
  const startDate = String(body.startDate ?? body.dueDate ?? ''), dueDate = String(body.dueDate ?? ''), area = String(body.area ?? '').trim(), projectId = String(body.projectId ?? '').trim();
  const estimateMinutes = Number(body.estimateMinutes ?? 60);
  const blocker = String(body.blocker ?? '').trim(), milestone = body.milestone === true;
  const reminderMinutes = body.reminderMinutes === null || body.reminderMinutes === undefined || body.reminderMinutes === '' ? null : Number(body.reminderMinutes);
  const tags = stringArray(body.tags ?? [], 20, 40), dependencies = stringArray(body.dependencies ?? [], 20, 64);
  const parentTaskId = String(body.parentTaskId ?? '').trim(), rawComments = body.comments ?? [], version = Number(body.version ?? 0);
  const recurrenceRule = String(body.recurrenceRule ?? '') as TaskInput['recurrenceRule'], recurrenceEnd = String(body.recurrenceEnd ?? '');

  if ((requireId || id) && (!id || id.length > 64)) return { error: 'מזהה המשימה חסר או אינו תקין.' };
  if (requireId && (!Number.isInteger(version) || version < 1)) return { error: 'גרסת המשימה חסרה. יש לרענן ולנסות שוב.' };
  if (!title || title.length > 180) return { error: 'יש להזין כותרת באורך של עד 180 תווים.' };
  if (description.length > 5000) return { error: 'תיאור המשימה ארוך מדי.' };
  if (!assignees?.length || assignees.some((name) => !owners.includes(name as Owner))) return { error: 'יש לבחור לפחות אחראי אחד תקין.' };
  if (!priorities.includes(priority as TaskInput['priority'])) return { error: 'העדיפות שנבחרה אינה תקינה.' };
  if (!statuses.includes(status as TaskInput['status'])) return { error: 'הסטטוס שנבחר אינו תקין.' };
  if (!isDate(startDate)) return { error: 'יש לבחור תאריך התחלה תקין.' };
  if (!isDate(dueDate)) return { error: 'יש לבחור תאריך יעד תקין.' };
  if (dueDate < startDate) return { error: 'תאריך היעד לא יכול להיות לפני תאריך ההתחלה.' };
  if (!Number.isInteger(estimateMinutes) || estimateMinutes < 15 || estimateMinutes > 24000) return { error: 'הערכת הזמן חייבת להיות בין 15 דקות ל־400 שעות.' };
  if (!area || area.length > 80) return { error: 'התחום חסר או אינו תקין.' };
  if (projectId.length > 64) return { error: 'הפרויקט שנבחר אינו תקין.' };
  if (!tags || !dependencies) return { error: 'התגיות או התלויות אינן תקינות.' };
  if (parentTaskId.length > 64) return { error: 'משימת העל שנבחרה אינה תקינה.' };
  if (status === 'Blocked' && !blocker) return { error: 'יש לפרט מה חוסם את המשימה.' };
  if (blocker.length > 1000) return { error: 'תיאור החסימה ארוך מדי.' };
  if (reminderMinutes !== null && ![10, 30, 60, 1440].includes(reminderMinutes)) return { error: 'התזכורת שנבחרה אינה תקינה.' };
  if (!['', 'weekly', 'monthly'].includes(recurrenceRule)) return { error: 'תדירות החזרה אינה תקינה.' };
  if (recurrenceEnd && (!isDate(recurrenceEnd) || recurrenceEnd < dueDate)) return { error: 'תאריך סיום החזרה אינו תקין.' };
  if (!Array.isArray(rawComments) || rawComments.length > 100) return { error: 'רשימת התגובות אינה תקינה.' };
  const comments = rawComments.map((comment) => { const record = comment && typeof comment === 'object' ? comment as Record<string, unknown> : {}; return { author: String(record.author ?? '').trim(), text: String(record.text ?? '').trim(), time: String(record.time ?? '').trim() }; });
  if (comments.some((comment) => !comment.text || comment.text.length > 2000 || comment.author.length > 80 || comment.time.length > 80)) return { error: 'אחת התגובות אינה תקינה.' };
  return { value: { id: id || undefined, title, description, owner: assignees[0] as Owner, assignees: assignees as Owner[], priority: priority as TaskInput['priority'], status: status as TaskInput['status'], startDate, dueDate, estimateMinutes, area, projectId, tags, dependencies, parentTaskId, blocker, milestone, reminderMinutes, recurrenceRule, recurrenceEnd, comments, version: requireId ? version : undefined } };
}

async function validateDependencies(task: TaskInput & { id: string }) {
  if (task.projectId && !(await env.DB.prepare('SELECT id FROM projects WHERE id=? AND archived_at IS NULL').bind(task.projectId).first())) return 'הפרויקט שנבחר אינו קיים.';
  const { results } = await env.DB.prepare('SELECT id,status,dependencies,parent_task_id FROM tasks WHERE archived_at IS NULL').all();
  const graph = new Map<string, GraphTask>();
  for (const row of results as Record<string, unknown>[]) graph.set(String(row.id), { id: String(row.id), status: String(row.status), dependencies: jsonArray(row.dependencies).map(String), parentTaskId: String(row.parent_task_id || '') });
  graph.set(task.id, { id: task.id, status: task.status, dependencies: task.dependencies, parentTaskId: task.parentTaskId });
  if (task.dependencies.includes(task.id)) return 'משימה לא יכולה להיות תלויה בעצמה.';
  if (task.parentTaskId === task.id) return 'משימה לא יכולה להיות משימת העל של עצמה.';
  const missing = task.dependencies.find((id) => !graph.has(id));
  if (missing) return `משימת התלות ${missing} אינה קיימת.`;
  if (task.parentTaskId && !graph.has(task.parentTaskId)) return 'משימת העל שנבחרה אינה קיימת.';
  const visiting = new Set<string>(), visited = new Set<string>();
  const hasCycle = (id: string): boolean => { if (visiting.has(id)) return true; if (visited.has(id)) return false; visiting.add(id); for (const dependency of graph.get(id)?.dependencies ?? []) if (hasCycle(dependency)) return true; visiting.delete(id); visited.add(id); return false; };
  if (hasCycle(task.id)) return 'אי אפשר ליצור מעגל תלויות בין משימות.';
  const parentTrail = new Set<string>([task.id]); let parentId = task.parentTaskId, depth = 0;
  while (parentId) { if (parentTrail.has(parentId)) return 'אי אפשר ליצור מעגל בין משימות על ומשימות משנה.'; parentTrail.add(parentId); depth += 1; if (depth > 2) return 'אפשר ליצור היררכיה בעומק של עד שתי רמות.'; parentId = graph.get(parentId)?.parentTaskId ?? ''; }
  const pending = task.dependencies.filter((id) => graph.get(id)?.status !== 'Done');
  if (pending.length && task.status !== 'Backlog') return 'המשימה עדיין נעולה. יש להשלים קודם את כל משימות התלות.';
  return null;
}

async function readBody(request: Request) {
  const text = await request.text();
  if (text.length > 100_000) return { error: Response.json({ error: 'הבקשה גדולה מדי.' }, { status: 413 }) };
  try { return { body: JSON.parse(text) as Record<string, unknown> }; } catch { return { error: Response.json({ error: 'הבקשה אינה בפורמט תקין.' }, { status: 400 }) }; }
}

async function recordEvent(taskId: string, actor: { email: string; name: string }, eventType: string, summary: string, details: Record<string, unknown> = {}) {
  const createdAt = new Date().toISOString();
  await env.DB.prepare('INSERT INTO task_events (id,task_id,actor_email,actor_name,event_type,summary,details,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), taskId, actor.email, actor.name, eventType, summary, JSON.stringify(details), createdAt).run();
}

async function notifyMany(taskId: string, notifications: Array<{ recipient: Owner; type: string; message: string }>, actorName: string) {
  const unique = [...new Map(notifications.filter((item) => item.recipient !== actorName).map((item) => [`${item.recipient}:${item.type}:${item.message}`, item])).values()];
  if (!unique.length) return;
  const createdAt = new Date().toISOString();
  await env.DB.batch(unique.map((item) => env.DB.prepare('INSERT INTO notifications (id,recipient_name,task_id,type,message,read_at,created_at) VALUES (?,?,?,?,?,NULL,?)').bind(crypto.randomUUID(), item.recipient, taskId, item.type, item.message, createdAt)));
}

function mentionsIn(comments: StoredComment[]) {
  return owners.filter((name) => comments.some((comment) => new RegExp(`(^|\\s)@${name}(?=\\s|$|[.,!?])`, 'i').test(comment.text)));
}

function shiftedDate(key: string, rule: TaskInput['recurrenceRule']) {
  const date = new Date(`${key}T12:00:00Z`);
  if (rule === 'weekly') date.setUTCDate(date.getUTCDate() + 7);
  if (rule === 'monthly') {
    const originalDay = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(originalDay, lastDay));
  }
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

async function createNextOccurrence(before: ReturnType<typeof parse>, task: TaskInput & { id: string }, actorName: string) {
  if (!task.recurrenceRule || before.status === 'Done' || task.status !== 'Done') return;
  const nextStart = shiftedDate(task.startDate, task.recurrenceRule), nextDue = shiftedDate(task.dueDate, task.recurrenceRule);
  if (task.recurrenceEnd && nextDue > task.recurrenceEnd) return;
  const sourceId = before.recurrenceSourceId || task.id, recurrenceKey = `${sourceId}:${nextDue}`, id = `MYV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, now = new Date().toISOString();
  const created = await env.DB.prepare('INSERT OR IGNORE INTO tasks (id,title,description,owner,assignees,priority,status,start_date,due_date,estimate_minutes,area,project_id,tags,dependencies,parent_task_id,blocker,milestone,reminder_minutes,recurring,recurrence_rule,recurrence_end,recurrence_source_id,recurrence_key,comments,version,archived_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, task.title, task.description, task.owner, JSON.stringify(task.assignees), task.priority, 'To Do', nextStart, nextDue, task.estimateMinutes, task.area, task.projectId, JSON.stringify(task.tags), '[]', '', '', task.milestone ? 1 : 0, task.reminderMinutes, 1, task.recurrenceRule, task.recurrenceEnd, sourceId, recurrenceKey, '[]', 1, null, now, now).run();
  if (!created.meta.changes) return;
  await env.DB.prepare('INSERT INTO task_events (id,task_id,actor_email,actor_name,event_type,summary,details,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), id, 'system@myvet-workspace', 'Automation', 'recurrence_created', 'יצר מופע חוזר של המשימה', JSON.stringify({ sourceTaskId: task.id }), now).run();
  await notifyMany(id, task.assignees.map((recipient) => ({ recipient, type: 'recurrence_created', message: `נוצר מופע חוזר חדש ל־„${task.title}”` })), actorName);
}

function changedFields(before: ReturnType<typeof parse>, after: TaskInput) {
  const fields: Array<[keyof TaskInput, string]> = [['title', 'כותרת'], ['description', 'תיאור'], ['assignees', 'אחראים'], ['priority', 'עדיפות'], ['status', 'סטטוס'], ['startDate', 'תאריך התחלה'], ['dueDate', 'תאריך יעד'], ['estimateMinutes', 'הערכת זמן'], ['area', 'תחום'], ['projectId', 'פרויקט'], ['tags', 'תגיות'], ['dependencies', 'תלויות'], ['parentTaskId', 'משימת־על'], ['blocker', 'חסימה'], ['milestone', 'אבן דרך'], ['reminderMinutes', 'תזכורת'], ['recurrenceRule', 'חזרה'], ['recurrenceEnd', 'סיום חזרה']];
  return fields.filter(([key]) => JSON.stringify(before[key as keyof typeof before]) !== JSON.stringify(after[key])).map(([, label]) => label);
}

function commentsWithServerIdentity(existing: StoredComment[], submitted: StoredComment[], actorName: string) {
  if (submitted.length < existing.length) return { error: 'אי אפשר למחוק תגובות קיימות.' };
  if (!existing.every((comment, index) => JSON.stringify(comment) === JSON.stringify(submitted[index]))) return { error: 'אי אפשר לשנות תגובות קיימות.' };
  const additions = submitted.slice(existing.length);
  if (additions.length > 10) return { error: 'אפשר להוסיף עד 10 תגובות בכל שמירה.' };
  const now = new Date().toISOString();
  return { comments: [...existing, ...additions.map((comment) => ({ author: actorName, text: comment.text, time: now }))], additions: additions.length };
}

export async function GET(request: Request) {
  const actor = actorFor(request); if ('error' in actor) return actor.error;
  const { results } = await env.DB.prepare('SELECT * FROM tasks WHERE archived_at IS NULL ORDER BY updated_at DESC').all();
  return Response.json(results.map((row) => parse(row as Record<string, unknown>)), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const actor = actorFor(request); if ('error' in actor) return actor.error;
  const parsedBody = await readBody(request); if (parsedBody.error) return parsedBody.error;
  const validated = validate(parsedBody.body!, false); if (!validated.value) return Response.json({ error: validated.error }, { status: 400 });
  const task = validated.value;
  if (task.comments.length) return Response.json({ error: 'יש ליצור את המשימה לפני הוספת תגובות.' }, { status: 400 });
  const id = task.id || `MYV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  if (await env.DB.prepare('SELECT id FROM tasks WHERE id = ?').bind(id).first()) return Response.json({ error: 'כבר קיימת משימה עם המזהה הזה.' }, { status: 409 });
  const dependencyError = await validateDependencies({ ...task, id }); if (dependencyError) return Response.json({ error: dependencyError }, { status: 400 });
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO tasks (id,title,description,owner,assignees,priority,status,start_date,due_date,estimate_minutes,area,project_id,tags,dependencies,parent_task_id,blocker,milestone,reminder_minutes,recurring,recurrence_rule,recurrence_end,recurrence_source_id,recurrence_key,comments,version,archived_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, task.title, task.description, task.owner, JSON.stringify(task.assignees), task.priority, task.status, task.startDate, task.dueDate, task.estimateMinutes, task.area, task.projectId, JSON.stringify(task.tags), JSON.stringify(task.dependencies), task.parentTaskId, task.blocker, task.milestone ? 1 : 0, task.reminderMinutes, task.recurrenceRule ? 1 : 0, task.recurrenceRule, task.recurrenceEnd, task.recurrenceRule ? id : null, null, '[]', 1, null, now, now),
    env.DB.prepare('INSERT INTO task_events (id,task_id,actor_email,actor_name,event_type,summary,details,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), id, actor.email, actor.name, 'created', 'יצר את המשימה', '{}', now),
  ]);
  await notifyMany(id, task.assignees.map((recipient) => ({ recipient, type: 'assigned', message: `${actor.name} הקצה לך משימה חדשה` })), actor.name);
  const row = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first();
  return Response.json(parse(row as Record<string, unknown>), { status: 201 });
}

export async function PATCH(request: Request) {
  const actor = actorFor(request); if ('error' in actor) return actor.error;
  const parsedBody = await readBody(request); if (parsedBody.error) return parsedBody.error;
  const validated = validate(parsedBody.body!, true); if (!validated.value?.id) return Response.json({ error: validated.error }, { status: 400 });
  const task = validated.value as TaskInput & { id: string; version: number };
  const existingRow = await env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND archived_at IS NULL').bind(task.id).first();
  if (!existingRow) return Response.json({ error: 'המשימה לא נמצאה.' }, { status: 404 });
  const before = parse(existingRow as Record<string, unknown>);
  if (before.version !== task.version) return Response.json({ error: 'המשימה עודכנה בינתיים על ידי משתמש אחר. רעננו את הנתונים ונסו שוב.', code: 'VERSION_CONFLICT', current: before }, { status: 409 });
  const dependencyError = await validateDependencies(task); if (dependencyError) return Response.json({ error: dependencyError }, { status: 400 });
  const normalizedComments = commentsWithServerIdentity(before.comments, task.comments, actor.name);
  if (normalizedComments.error) return Response.json({ error: normalizedComments.error }, { status: 400 });
  const fields = changedFields(before, task), updatedAt = new Date().toISOString(), nextVersion = task.version + 1;
  const result = await env.DB.prepare('UPDATE tasks SET title=?,description=?,owner=?,assignees=?,priority=?,status=?,start_date=?,due_date=?,estimate_minutes=?,area=?,project_id=?,tags=?,dependencies=?,parent_task_id=?,blocker=?,milestone=?,reminder_minutes=?,recurring=?,recurrence_rule=?,recurrence_end=?,comments=?,version=?,updated_at=? WHERE id=? AND version=? AND archived_at IS NULL').bind(task.title, task.description, task.owner, JSON.stringify(task.assignees), task.priority, task.status, task.startDate, task.dueDate, task.estimateMinutes, task.area, task.projectId, JSON.stringify(task.tags), JSON.stringify(task.dependencies), task.parentTaskId, task.blocker, task.milestone ? 1 : 0, task.reminderMinutes, task.recurrenceRule ? 1 : 0, task.recurrenceRule, task.recurrenceEnd, JSON.stringify(normalizedComments.comments), nextVersion, updatedAt, task.id, task.version).run();
  if (!result.meta.changes) return Response.json({ error: 'המשימה עודכנה בינתיים. רעננו את הנתונים ונסו שוב.', code: 'VERSION_CONFLICT' }, { status: 409 });
  const eventSummary = fields.length ? `עדכן: ${fields.join(', ')}` : normalizedComments.additions ? 'הוסיף תגובה' : 'שמר את המשימה';
  await recordEvent(task.id, actor, normalizedComments.additions ? 'commented' : 'updated', eventSummary, { fields, commentsAdded: normalizedComments.additions });
  const notifications: Array<{ recipient: Owner; type: string; message: string }> = [];
  task.assignees.filter((name) => !before.assignees.includes(name)).forEach((recipient) => notifications.push({ recipient, type: 'assigned', message: `${actor.name} צירף אותך למשימה` }));
  mentionsIn((normalizedComments.comments || []).slice(before.comments.length)).forEach((recipient) => notifications.push({ recipient, type: 'mentioned', message: `${actor.name} תייג אותך בתגובה` }));
  if (before.status !== 'Review' && task.status === 'Review') owners.filter((recipient) => recipient !== actor.name).forEach((recipient) => notifications.push({ recipient, type: 'review_requested', message: `${actor.name} העביר את „${task.title}” לבדיקה שלך` }));
  if (before.status !== 'Blocked' && task.status === 'Blocked') owners.filter((recipient) => recipient !== actor.name).forEach((recipient) => notifications.push({ recipient, type: 'task_blocked', message: `${actor.name} סימן את „${task.title}” כחסומה` }));
  if (before.status !== 'Done' && task.status === 'Done') {
    const { results } = await env.DB.prepare('SELECT id,title,assignees,owner,dependencies FROM tasks WHERE archived_at IS NULL AND id<>?').bind(task.id).all();
    for (const dependent of results as Record<string, unknown>[]) {
      if (!jsonArray(dependent.dependencies).map(String).includes(task.id)) continue;
      const recipients = jsonArray(dependent.assignees).map(String).filter((name) => owners.includes(name as Owner)) as Owner[];
      (recipients.length ? recipients : [String(dependent.owner) as Owner]).forEach((recipient) => notifications.push({ recipient, type: 'dependency_ready', message: `המשימה „${String(dependent.title)}” מוכנה להתחלה` }));
    }
  }
  await notifyMany(task.id, notifications, actor.name);
  await createNextOccurrence(before, task, actor.name);
  const row = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(task.id).first();
  return Response.json(parse(row as Record<string, unknown>));
}

export async function DELETE(request: Request) {
  const actor = actorFor(request); if ('error' in actor) return actor.error;
  const parsedBody = await readBody(request); if (parsedBody.error) return parsedBody.error;
  const id = String(parsedBody.body?.id ?? '').trim(), version = Number(parsedBody.body?.version ?? 0);
  if (!id || id.length > 64 || !Number.isInteger(version) || version < 1) return Response.json({ error: 'פרטי המשימה אינם תקינים.' }, { status: 400 });
  const { results } = await env.DB.prepare('SELECT id,dependencies,parent_task_id FROM tasks WHERE archived_at IS NULL').all();
  const activeLinks = (results as Record<string, unknown>[]).filter((row) => String(row.id) !== id && (String(row.parent_task_id || '') === id || jsonArray(row.dependencies).map(String).includes(id)));
  if (activeLinks.length) return Response.json({ error: 'אי אפשר להעביר לארכיון משימה שיש לה משימות משנה או משימות תלויות פעילות.' }, { status: 409 });
  const archivedAt = new Date().toISOString();
  const result = await env.DB.prepare('UPDATE tasks SET archived_at=?,version=version+1,updated_at=? WHERE id=? AND version=? AND archived_at IS NULL').bind(archivedAt, archivedAt, id, version).run();
  if (!result.meta.changes) return Response.json({ error: 'המשימה עודכנה בינתיים או כבר הועברה לארכיון.', code: 'VERSION_CONFLICT' }, { status: 409 });
  await recordEvent(id, actor, 'archived', 'העביר את המשימה לארכיון');
  return Response.json({ ok: true });
}
