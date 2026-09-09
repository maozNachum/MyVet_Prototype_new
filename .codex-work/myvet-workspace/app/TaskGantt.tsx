'use client';

import { DragEvent as ReactDragEvent, useMemo, useState } from 'react';
import type { Task } from './page';
import { dependencyCascade, formatEstimate } from './workspaceIntelligence';

const dayMs = 86_400_000;
const fromKey = (key: string) => new Date(`${key}T12:00:00`);
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (key: string, count: number) => { const date = fromKey(key); date.setDate(date.getDate() + count); return dateKey(date); };
const diffDays = (start: string, end: string) => Math.round((fromKey(end).getTime() - fromKey(start).getTime()) / dayMs);
const label = (key: string) => new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' }).format(fromKey(key));

function sortedTasks(tasks: Task[]) {
  const map = new Map(tasks.map((task) => [task.id, task]));
  const visited = new Set<string>();
  const result: Task[] = [];
  const visit = (task: Task) => {
    if (visited.has(task.id)) return;
    visited.add(task.id);
    const parent = map.get(task.parentTaskId); if (parent) visit(parent);
    task.dependencies.forEach((id) => { const dependency = map.get(id); if (dependency) visit(dependency); });
    result.push(task);
  };
  [...tasks].sort((a, b) => (a.startDate || a.dueDate).localeCompare(b.startDate || b.dueDate)).forEach(visit);
  return result;
}

function criticalIds(tasks: Task[]) {
  const memo = new Map<string, string[]>(), visiting = new Set<string>();
  const chain = (task: Task): string[] => {
    if (memo.has(task.id)) return memo.get(task.id)!;
    if (visiting.has(task.id)) return [];
    visiting.add(task.id);
    const next = tasks.filter((candidate) => candidate.dependencies.includes(task.id) && candidate.status !== 'Done');
    const tail = next.map(chain).sort((a, b) => b.length - a.length)[0] || [];
    const result = [task.id, ...tail];
    visiting.delete(task.id); memo.set(task.id, result); return result;
  };
  return new Set(tasks.map(chain).sort((a, b) => b.length - a.length)[0] || []);
}

export function TaskGantt({ tasks, open, saveMany }: { tasks: Task[]; open: (task: Task) => void; saveMany: (tasks: Task[], message: string) => Promise<number> }) {
  const [scale, setScale] = useState<'week' | 'month'>('week');
  const [dragging, setDragging] = useState('');
  const [showCritical, setShowCritical] = useState(false);
  const [proposal, setProposal] = useState<Array<{ before: Task; after: Task }> | null>(null);
  const ordered = useMemo(() => sortedTasks(tasks), [tasks]);
  const today = dateKey(new Date());
  const first = ordered.length ? ordered.reduce((min, task) => (task.startDate || task.dueDate) < min ? (task.startDate || task.dueDate) : min, ordered[0].startDate || ordered[0].dueDate) : today;
  const last = ordered.length ? ordered.reduce((max, task) => task.dueDate > max ? task.dueDate : max, ordered[0].dueDate) : addDays(today, 30);
  const rangeStart = addDays(first, scale === 'week' ? -2 : -7);
  const rangeEnd = addDays(last, scale === 'week' ? 3 : 10);
  const days = Math.max(1, diffDays(rangeStart, rangeEnd) + 1);
  const dayWidth = scale === 'week' ? 34 : 18;
  const chartWidth = Math.max(720, days * dayWidth);
  const position = (key: string) => Math.max(0, Math.min(100, (diffDays(rangeStart, key) / days) * 100));
  const pending = (task: Task) => task.dependencies.filter((id) => tasks.find((item) => item.id === id)?.status !== 'Done');
  const workload = (name: Task['owner']) => tasks.filter((task) => (task.assignees?.length ? task.assignees : [task.owner]).includes(name) && task.status !== 'Done');
  const reschedule = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const task = tasks.find((item) => item.id === dragging); if (!task) return;
    const rect = event.currentTarget.getBoundingClientRect(), x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    let nextStart = addDays(rangeStart, Math.round(x / dayWidth));
    const dependencyDates = task.dependencies.map((id) => tasks.find((item) => item.id === id)?.dueDate).filter((value): value is string => Boolean(value));
    if (dependencyDates.length) { const earliest = addDays(dependencyDates.sort().at(-1)!, 1); if (nextStart < earliest) nextStart = earliest; }
    const duration = task.milestone ? 0 : Math.max(0, diffDays(task.startDate || task.dueDate, task.dueDate));
    const cascade = dependencyCascade(tasks, task.id, nextStart, addDays(nextStart, duration));
    setProposal(cascade.map((change) => { const before = tasks.find((item) => item.id === change.id)!; return { before, after: { ...before, startDate: change.startDate, dueDate: change.dueDate } }; }));
    setDragging('');
  };

  if (!tasks.length) return <section className="gantt-empty"><span>◇</span><h2>הגאנט מוכן למשימות הראשונות</h2><p>לאחר שתיצרו משימות עם תאריך התחלה ויעד, הן יופיעו כאן אוטומטית.</p></section>;

  const ticks = Array.from({ length: days }, (_, index) => addDays(rangeStart, index)).filter((_, index) => index % (scale === 'week' ? 1 : 7) === 0);
  const critical = criticalIds(tasks);
  return <section className="gantt-shell" aria-label="גאנט משימות">
    <header className="gantt-toolbar"><div><strong>מפת עבודה כללית</strong><span>{ordered.length} משימות · {ordered.filter((task) => task.milestone).length} אבני דרך</span></div><div className="gantt-scale" aria-label="רמת פירוט"><button className={showCritical ? 'active' : ''} aria-pressed={showCritical} onClick={() => setShowCritical((value) => !value)}>מסלול קריטי</button><button className={scale === 'week' ? 'active' : ''} onClick={() => setScale('week')}>שבועות</button><button className={scale === 'month' ? 'active' : ''} onClick={() => setScale('month')}>חודשים</button></div></header>
    <div className="gantt-legend"><span><i className="gantt-legend-bar"/> משימה</span><span><i className="gantt-legend-milestone"/> אבן דרך</span><span><i className="gantt-legend-lock">⌁</i> ממתינה לתלות</span><span>גררו משימה כדי לעדכן תאריכים</span></div>
    <div className="gantt-workload">{(['Maoz', 'Nissan'] as const).map((name) => { const assigned = workload(name), minutes = assigned.reduce((sum, task) => sum + task.estimateMinutes / Math.max(1, task.assignees.length), 0), capacity = 40 * 60; return <div key={name}><span className={`avatar avatar-${name.toLowerCase()}`}>{name[0]}</span><span><strong>{name}</strong><small>{formatEstimate(Math.round(minutes))} מתוכננות · {assigned.length} משימות</small></span><div className="workload-meter" aria-label={`${Math.round(minutes / capacity * 100)} אחוזי קיבולת`}><i className={minutes > capacity ? 'over-capacity' : ''} style={{ width: `${Math.min(100, minutes / capacity * 100)}%` }}/></div></div>; })}</div>
    <div className="gantt-scroll">
      <div className="gantt-table" style={{ minWidth: chartWidth + 260 }}>
        <div className="gantt-label-head">משימה</div>
        <div className="gantt-axis" style={{ width: chartWidth }}>{ticks.map((tick) => <span key={tick} style={{ left: `${position(tick)}%` }}>{label(tick)}</span>)}</div>
        <div className="gantt-labels">{ordered.map((task) => { const locked = pending(task),assignees=task.assignees?.length?task.assignees:[task.owner],parent=tasks.find(item=>item.id===task.parentTaskId),children=tasks.filter(item=>item.parentTaskId===task.id).length; return <button className={parent?'gantt-label-child':''} key={task.id} onClick={() => open(task)}>{parent&&<i className="gantt-branch">↳</i>}<span className="assignee-stack"><span>{assignees.map(name=><i key={name} className={`avatar avatar-${name.toLowerCase()}`}>{name[0]}</i>)}</span></span><span><strong>{task.title}{children>0&&<em> · משימת־על</em>}</strong><small>{parent?`תחת ${parent.title}`:`${task.id} · ${task.area}`}{locked.length ? ` · ממתינה ל-${locked.length}` : ''}</small></span></button>; })}</div>
        <div className={`gantt-chart ${dragging ? 'is-dragging' : ''}`} style={{ width: chartWidth, height: ordered.length * 58, backgroundSize: `${dayWidth}px 100%` }} onDragOver={(event) => event.preventDefault()} onDrop={reschedule}>
          {position(today) >= 0 && position(today) <= 100 && <span className="gantt-today" style={{ left: `${position(today)}%` }}><b>היום</b></span>}
          <svg className="gantt-links" viewBox={`0 0 100 ${ordered.length * 58}`} preserveAspectRatio="none" aria-hidden="true">{ordered.flatMap((task, taskIndex) => task.dependencies.map((dependencyId) => { const dependencyIndex = ordered.findIndex((item) => item.id === dependencyId); const dependency = ordered[dependencyIndex]; if (!dependency) return null; const x1 = position(dependency.dueDate); const x2 = position(task.startDate || task.dueDate); const y1 = dependencyIndex * 58 + 29; const y2 = taskIndex * 58 + 29; const bend = Math.min(99, Math.max(x1 + 1.2, (x1 + x2) / 2)); return <polyline key={`${dependencyId}-${task.id}`} points={`${x1},${y1} ${bend},${y1} ${bend},${y2} ${x2},${y2}`} />; }))}</svg>
          {ordered.map((task, index) => { const start = task.startDate || task.dueDate; const left = position(start); const width = Math.max(task.milestone ? 0 : 1.4, position(addDays(task.dueDate, 1)) - left); const locked = pending(task).length > 0; return <button draggable key={task.id} className={`gantt-item ${task.milestone ? 'milestone' : ''} ${locked ? 'locked' : ''} ${task.status === 'Done' ? 'done' : ''} ${showCritical && critical.has(task.id) ? 'critical' : ''}`} style={{ left: `${left}%`, top: index * 58 + (task.milestone ? 20 : 17), width: task.milestone ? 18 : `${width}%` }} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; setDragging(task.id); }} onDragEnd={() => setDragging('')} onClick={() => open(task)} title={`${task.title} · ${label(start)}–${label(task.dueDate)}`}><span>{task.milestone ? '' : task.title}</span></button>; })}
        </div>
      </div>
    </div>
    {proposal && <div className="schedule-impact" role="dialog" aria-modal="true" aria-label="השפעת שינוי התאריכים"><div><strong>השפעת שינוי התאריכים</strong><p>{proposal.length === 1 ? 'רק המשימה שנגררה תשתנה.' : `${proposal.length} משימות בשרשרת יוזזו כדי לשמור על התלויות.`}</p><ul>{proposal.slice(0, 5).map(({ after }) => <li key={after.id}><span>{after.title}</span><b>{label(after.startDate)}–{label(after.dueDate)}</b></li>)}</ul>{proposal.length > 5 && <small>ועוד {proposal.length - 5} משימות</small>}<footer><button className="secondary" onClick={() => setProposal(null)}>ביטול</button><button className="secondary" onClick={() => { const firstOnly = proposal[0]; setProposal(null); void saveMany([firstOnly.after], 'תאריך המשימה עודכן'); }}>הזזת משימה זו בלבד</button><button className="new-task" onClick={() => { const updates = proposal.map((item) => item.after); setProposal(null); void saveMany(updates, `${updates.length} משימות תוזמנו מחדש`); }}>הזזת כל השרשרת</button></footer></div></div>}
  </section>;
}
