import type { Task } from './page';

const dayMs = 86_400_000;
const fromKey = (key: string) => new Date(`${key}T12:00:00`);
export const toDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const addCalendarDays = (key: string, days: number) => { const date = fromKey(key); date.setDate(date.getDate() + days); return toDateKey(date); };
export const differenceInDays = (start: string, end: string) => Math.round((fromKey(end).getTime() - fromKey(start).getTime()) / dayMs);

const priorityScore: Record<Task['priority'], number> = { Urgent: 60, High: 35, Medium: 18, Low: 5 };

export type RecommendedTask = { task: Task; reason: string; score: number; opens: number };

export function taskRecommendation(task: Task, all: Task[], person: Task['owner'], today: string): RecommendedTask {
  const pending = task.dependencies.filter((id) => all.find((candidate) => candidate.id === id)?.status !== 'Done');
  const opens = all.filter((candidate) => candidate.status !== 'Done' && candidate.dependencies.includes(task.id)).length;
  const days = differenceInDays(today, task.dueDate);
  let score = priorityScore[task.priority] + (task.status === 'In Progress' ? 28 : task.status === 'Review' ? 22 : 0) + opens * 12;
  if ((task.assignees?.length ? task.assignees : [task.owner]).includes(person)) score += 18;
  if (days < 0) score += 75 + Math.min(25, Math.abs(days) * 4);
  else if (days === 0) score += 55;
  else if (days <= 3) score += 28 - days * 4;
  if (pending.length) score -= 200;
  if (task.status === 'Blocked') score -= 100;
  const reason = pending.length
    ? `ממתינה ל־${pending.length} ${pending.length === 1 ? 'משימה' : 'משימות'}`
    : task.status === 'Blocked'
      ? 'נדרשת החלטה כדי להסיר חסימה'
      : days < 0
        ? `באיחור של ${Math.abs(days)} ${Math.abs(days) === 1 ? 'יום' : 'ימים'}`
        : days === 0
          ? 'היעד הוא היום'
          : opens
            ? `השלמה תפתח ${opens} ${opens === 1 ? 'משימה' : 'משימות'}`
            : task.priority === 'Urgent'
              ? 'עדיפות דחופה'
              : task.status === 'In Progress'
                ? 'כבר נמצאת בביצוע'
                : `יעד בעוד ${days} ימים`;
  return { task, reason, score, opens };
}

export function buildTodayPlan(tasks: Task[], person: Task['owner'], today = toDateKey(new Date())) {
  const active = tasks.filter((task) => task.status !== 'Done' && (task.assignees?.length ? task.assignees : [task.owner]).includes(person));
  const ranked = active.map((task) => taskRecommendation(task, tasks, person, today)).sort((a, b) => b.score - a.score || a.task.dueDate.localeCompare(b.task.dueDate));
  const attention = ranked.filter(({ task }) => task.status === 'Blocked' || task.dependencies.some((id) => tasks.find((candidate) => candidate.id === id)?.status !== 'Done') || task.dueDate < today);
  const ready = ranked.filter(({ task }) => task.status !== 'Blocked' && !task.dependencies.some((id) => tasks.find((candidate) => candidate.id === id)?.status !== 'Done'));
  return { now: ready.slice(0, 3), attention: attention.slice(0, 5), later: ready.slice(3, 8) };
}

export function formatEstimate(minutes: number) {
  if (minutes < 60) return `${minutes} דק׳`;
  const hours = Math.floor(minutes / 60), remainder = minutes % 60;
  return remainder ? `${hours}:${String(remainder).padStart(2, '0')} ש׳` : `${hours} ש׳`;
}

export function weeklySummary(tasks: Task[], today = toDateKey(new Date())) {
  const weekStart = addCalendarDays(today, -6);
  const done = tasks.filter((task) => task.status === 'Done' && (task.updatedAt || '') >= `${weekStart}T00:00:00`).length;
  const blocked = tasks.filter((task) => task.status === 'Blocked');
  const overdue = tasks.filter((task) => task.status !== 'Done' && task.dueDate < today);
  const dueSoon = tasks.filter((task) => task.status !== 'Done' && task.dueDate >= today && task.dueDate <= addCalendarDays(today, 7));
  const lines = [`עדכון שבועי · ${new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long' }).format(fromKey(today))}`, `${done} משימות הושלמו בשבעת הימים האחרונים.`, `${dueSoon.length} משימות מתוכננות לשבוע הקרוב.`];
  if (blocked.length) lines.push(`${blocked.length} משימות חסומות ודורשות החלטה.`);
  if (overdue.length) lines.push(`${overdue.length} משימות באיחור ודורשות תכנון מחדש.`);
  if (!blocked.length && !overdue.length) lines.push('אין כרגע חסימות או משימות באיחור.');
  return { done, blocked: blocked.length, overdue: overdue.length, dueSoon: dueSoon.length, text: lines.join('\n') };
}

const areaKeywords: Array<[string, string[]]> = [
  ['Backend', ['backend', 'api', 'שרת', 'מסד']],
  ['Frontend', ['frontend', 'ui', 'ux', 'מסך', 'עיצוב']],
  ['Security', ['security', 'אבטחה', 'הרשאה', 'permissions']],
  ['Business', ['business', 'עסקי', 'לקוח', 'billing', 'חיוב']],
  ['Operations', ['operations', 'תפעול', 'migration', 'מיגרציה']],
  ['AI & Automation', ['ai', 'automation', 'אוטומציה', 'בינה']],
];

export function draftTaskFromText(text: string, person: Task['owner'], all: Task[]) {
  const normalized = text.trim(), lower = normalized.toLocaleLowerCase('he');
  const owner: Task['owner'] = /ניסן|nissan/.test(lower) ? 'Nissan' : /מעוז|maoz/.test(lower) ? 'Maoz' : person;
  const priority: Task['priority'] = /דחופ|urgent|מיידי/.test(lower) ? 'Urgent' : /גבוה|high/.test(lower) ? 'High' : /נמוך|low/.test(lower) ? 'Low' : 'Medium';
  const area = areaKeywords.find(([, keywords]) => keywords.some((keyword) => lower.includes(keyword)))?.[0] || 'Product';
  const today = toDateKey(new Date());
  const dueDate = /מחר|tomorrow/.test(lower) ? addCalendarDays(today, 1) : /היום|today/.test(lower) ? today : addCalendarDays(today, 7);
  const duplicate = all.find((task) => task.status !== 'Done' && similarity(task.title, normalized) >= 0.58);
  const cleanTitle = normalized.replace(/^(צריך|נא|please)\s+/i, '').replace(/\s+(עד|until|by)\s+(היום|מחר|today|tomorrow).*$/i, '').slice(0, 180);
  return { title: cleanTitle || normalized.slice(0, 180), owner, assignees: [owner], priority, area, dueDate, duplicate };
}

function similarity(a: string, b: string) {
  const words = (value: string) => new Set(value.toLocaleLowerCase('he').split(/\s+/).filter((word) => word.length > 2));
  const first = words(a), second = words(b), union = new Set([...first, ...second]);
  if (!union.size) return 0;
  return [...first].filter((word) => second.has(word)).length / union.size;
}

export function dependencyCascade(tasks: Task[], sourceId: string, sourceStart: string, sourceDue: string) {
  const changes = new Map<string, { startDate: string; dueDate: string }>();
  changes.set(sourceId, { startDate: sourceStart, dueDate: sourceDue });
  const queue = [sourceId];
  while (queue.length) {
    const predecessorId = queue.shift()!;
    const predecessor = changes.get(predecessorId) || (() => { const task = tasks.find((item) => item.id === predecessorId); return task ? { startDate: task.startDate, dueDate: task.dueDate } : null; })();
    if (!predecessor) continue;
    for (const dependent of tasks.filter((task) => task.dependencies.includes(predecessorId) && task.status !== 'Done')) {
      const earliest = addCalendarDays(predecessor.dueDate, 1);
      const current = changes.get(dependent.id) || { startDate: dependent.startDate, dueDate: dependent.dueDate };
      if (current.startDate >= earliest) continue;
      const duration = Math.max(0, differenceInDays(current.startDate, current.dueDate));
      changes.set(dependent.id, { startDate: earliest, dueDate: addCalendarDays(earliest, duration) });
      queue.push(dependent.id);
    }
  }
  return [...changes.entries()].map(([id, dates]) => ({ id, ...dates }));
}
