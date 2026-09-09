'use client';

import { useMemo, useState } from 'react';
import type { Task } from './page';
import { formatEstimate } from './workspaceIntelligence';

type CalendarMode = 'day' | 'week' | 'year';

const hebrewDays = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const hebrewMonths = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

const toKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const fromKey = (key: string) => new Date(`${key}T12:00:00`);
const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};
const startOfWeek = (date: Date) => addDays(date, -date.getDay());

export function TaskCalendar({ tasks, open }: { tasks: Task[]; open: (task: Task) => void }) {
  const [mode, setMode] = useState<CalendarMode>('week');
  const [cursor, setCursor] = useState(() => new Date());
  const today = toKey(new Date());
  const byDate = useMemo(() => {
    const grouped = new Map<string, Task[]>();
    tasks.forEach((task) => grouped.set(task.dueDate, [...(grouped.get(task.dueDate) ?? []), task]));
    return grouped;
  }, [tasks]);

  const move = (direction: -1 | 1) => {
    if (mode === 'day') setCursor((date) => addDays(date, direction));
    if (mode === 'week') setCursor((date) => addDays(date, direction * 7));
    if (mode === 'year') setCursor((date) => new Date(date.getFullYear() + direction, date.getMonth(), 1));
  };
  const title = mode === 'day'
    ? new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(cursor)
    : mode === 'week'
      ? `${new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' }).format(startOfWeek(cursor))} – ${new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }).format(addDays(startOfWeek(cursor), 6))}`
      : String(cursor.getFullYear());

  return <section className="calendar-shell" aria-label="לוח משימות">
    <header className="calendar-toolbar">
      <div className="calendar-nav">
        <button type="button" onClick={() => move(-1)} aria-label="תקופה קודמת">‹</button>
        <button type="button" className="today-button" onClick={() => setCursor(new Date())}>היום</button>
        <button type="button" onClick={() => move(1)} aria-label="תקופה הבאה">›</button>
        <h2>{title}</h2>
      </div>
      <div className="calendar-modes" aria-label="בחירת תצוגת לוח שנה">
        {([['day', 'יומי'], ['week', 'שבועי'], ['year', 'שנתי']] as const).map(([value, label]) => <button type="button" key={value} className={mode === value ? 'active' : ''} aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</button>)}
      </div>
      <a className="calendar-export" href="/api/calendar" download>הורדת היומן שלי</a>
    </header>
    <div className="calendar-legend"><span><i className="legend-maoz" />Maoz</span><span><i className="legend-nissan" />Nissan</span><span className="calendar-hint">לחיצה על משימה פותחת את כל הפרטים</span></div>
    {mode === 'day' && <DayView date={cursor} tasks={byDate.get(toKey(cursor)) ?? []} open={open} isToday={toKey(cursor) === today} />}
    {mode === 'week' && <WeekView date={cursor} byDate={byDate} open={open} today={today} />}
    {mode === 'year' && <YearView year={cursor.getFullYear()} byDate={byDate} today={today} onSelectDate={(date) => { setCursor(date); setMode('day'); }} />}
  </section>;
}

function DayView({ date, tasks, open, isToday }: { date: Date; tasks: Task[]; open: (task: Task) => void; isToday: boolean }) {
  const openTasks = tasks.filter((task) => task.status !== 'Done');
  return <div className="day-view">
    <div className={`day-summary ${isToday ? 'is-today' : ''}`}><span>{hebrewDays[date.getDay()]}</span><strong>{date.getDate()}</strong><p>{tasks.length ? `${openTasks.length} פתוחות · ${tasks.length} בסך הכול` : 'אין משימות לתאריך זה'}</p></div>
    <div className="day-agenda">
      <div className="all-day-label"><span>יעדים ליום</span><small>משימות ללא שעה מוגדרת</small></div>
      <div className="day-task-stack">{tasks.length ? tasks.map((task) => <CalendarTask key={task.id} task={task} open={open} expanded />) : <EmptyCalendarState />}</div>
      <div className="day-time-grid" aria-hidden="true">{['09:00', '11:00', '13:00', '15:00', '17:00'].map((time) => <div key={time}><span>{time}</span><i /></div>)}</div>
    </div>
  </div>;
}

function WeekView({ date, byDate, open, today }: { date: Date; byDate: Map<string, Task[]>; open: (task: Task) => void; today: string }) {
  const start = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  return <div className="week-view">{days.map((day) => {
    const key = toKey(day); const dayTasks = byDate.get(key) ?? [];
    return <section className={`week-day ${key === today ? 'is-today' : ''}`} key={key} aria-label={`${hebrewDays[day.getDay()]} ${day.getDate()}`}>
      <header><span>{hebrewDays[day.getDay()]}</span><strong>{day.getDate()}</strong><b>{dayTasks.length || ''}</b></header>
      <div>{dayTasks.length ? dayTasks.map((task) => <CalendarTask key={task.id} task={task} open={open} />) : <span className="week-empty">אין משימות</span>}</div>
    </section>;
  })}</div>;
}

function YearView({ year, byDate, today, onSelectDate }: { year: number; byDate: Map<string, Task[]>; today: string; onSelectDate: (date: Date) => void }) {
  return <div className="year-view">{hebrewMonths.map((month, monthIndex) => {
    const first = new Date(year, monthIndex, 1); const days = new Date(year, monthIndex + 1, 0).getDate();
    const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
    const monthTasks = [...byDate.entries()].filter(([key]) => { const date = fromKey(key); return date.getFullYear() === year && date.getMonth() === monthIndex; }).flatMap(([, values]) => values);
    return <section className="year-month" key={month}><header><strong>{month}</strong><span>{monthTasks.length ? `${monthTasks.length} משימות` : 'ללא משימות'}</span></header><div className="mini-weekdays">{hebrewDays.map((day) => <b key={day}>{day}</b>)}</div><div className="mini-month-grid">{cells.map((day, index) => {
      if (!day) return <span className="blank" key={`blank-${index}`} />;
      const date = new Date(year, monthIndex, day); const key = toKey(date); const dayTasks = byDate.get(key) ?? [];
      if (!dayTasks.length) return <span key={key} className={`mini-day ${key === today ? 'is-today' : ''}`} aria-hidden="true"><span>{day}</span></span>;
      return <button type="button" key={key} className={`${key === today ? 'is-today' : ''} has-tasks`} onClick={() => onSelectDate(date)} aria-label={`${day} ${month}, ${dayTasks.length} משימות`}><span>{day}</span><i className={dayTasks.some((task) => task.priority === 'Urgent') ? 'urgent' : ''}>{dayTasks.length}</i><div className="year-day-peek">{dayTasks.slice(0, 3).map((task) => <span key={task.id}>{task.title}</span>)}</div></button>;
    })}</div></section>;
  })}</div>;
}

function CalendarTask({ task, open, expanded = false }: { task: Task; open: (task: Task) => void; expanded?: boolean }) {
  const assignees=task.assignees?.length?task.assignees:[task.owner];
  return <button type="button" className={`calendar-task owner-${assignees.length>1?'shared':task.owner.toLowerCase()} ${expanded ? 'expanded' : ''}`} onClick={() => open(task)}>
    <span className={`calendar-priority p-${task.priority.toLowerCase()}`} />
    <span className="calendar-task-copy"><small>{task.id} · {task.area}</small><strong>{task.title}</strong>{expanded && <em>{task.description || 'ללא תיאור'}</em>}</span>
    <span className="assignee-stack"><span>{assignees.map(name=><i key={name} className={`avatar avatar-${name.toLowerCase()}`}>{name[0]}</i>)}</span></span>
    <TaskPeek task={task} />
  </button>;
}

export function TaskPeek({ task }: { task: Task }) {
  const assignees=task.assignees?.length?task.assignees:[task.owner];
  return <span className="task-peek" aria-hidden="true"><b>{task.title}</b><small>{task.id} · {task.area}</small><span><em className={`priority-pill ${task.priority.toLowerCase()}`}>{task.priority}</em><em className={`status status-${task.status.replaceAll(' ', '-').toLowerCase()}`}>{task.status}</em></span><span className="task-peek-description">{task.description || 'אין תיאור למשימה'}</span><span className="task-peek-footer"><span className="assignee-stack"><span>{assignees.map(name=><i key={name} className={`avatar avatar-${name.toLowerCase()}`}>{name[0]}</i>)}</span></span><strong>{assignees.join(' + ')}</strong><span>{formatEstimate(task.estimateMinutes)} · יעד: {new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' }).format(fromKey(task.dueDate))}</span></span></span>;
}

function EmptyCalendarState() { return <div className="calendar-empty"><span>✓</span><strong>היום פנוי</strong><p>אין משימות עם תאריך יעד ביום הזה.</p></div>; }
