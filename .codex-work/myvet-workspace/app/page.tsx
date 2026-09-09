'use client';
import { DragEvent as ReactDragEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TaskCalendar, TaskPeek } from './TaskCalendar';
import { TaskGantt } from './TaskGantt';
import { buildTodayPlan, draftTaskFromText, formatEstimate, weeklySummary } from './workspaceIntelligence';
type Comment = {
    author: string;
    text: string;
    time: string;
};
type ActivityEvent = {
    id: string;
    taskId: string;
    taskTitle: string;
    actorName: string;
    eventType: string;
    summary: string;
    createdAt: string;
};
type NotificationItem = {
    id: string;
    taskId: string;
    taskTitle: string;
    type: string;
    message: string;
    readAt: string | null;
    createdAt: string;
};
type Project = { id:string;name:string;color:string;owner:'Maoz'|'Nissan';status:'Planned'|'Active'|'Paused'|'Done';health:'On track'|'At risk'|'Off track';startDate:string;dueDate:string;description:string;version:number;createdAt:string;updatedAt:string };
type TaskTemplate = { id:string;name:string;taskData:Partial<Task>;createdBy:string;createdAt:string;updatedAt:string };
type SavedView = { id:string;name:string;filters:Record<string,string>;createdAt:string;updatedAt:string };
type UndoState = { label:string;before:Task[];after:Task[] };
export type Task = {
    id: string;
    title: string;
    description: string;
    owner: 'Maoz' | 'Nissan';
    assignees: Array<'Maoz' | 'Nissan'>;
    priority: 'Urgent' | 'High' | 'Medium' | 'Low';
    status: string;
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
    recurring: boolean;
    recurrenceRule: '' | 'weekly' | 'monthly';
    recurrenceEnd: string;
    recurrenceSourceId?: string | null;
    comments: Comment[];
    version: number;
    archivedAt?: string | null;
    createdAt?: string;
    updatedAt?: string;
};
const statuses = ['Backlog', 'To Do', 'In Progress', 'Review', 'Blocked', 'Done'];
const areas = ['Product', 'Backend', 'Frontend', 'Business', 'Security', 'Operations', 'AI & Automation'];
const colors: Record<string, string> = { Product: '#6c5ce7', Backend: '#2f80ed', Frontend: '#ec8b4d', Business: '#1fa47a', Security: '#d95d78', Operations: '#7b8794', 'AI & Automation': '#8b5cf6' };
const nav = [['סקירה', '◫'], ['המשימות שלי', '✓'], ['היום', '⌁'], ['השבוע', '▦'], ['פרויקטים', '◈'], ['לוח שנה', '▣'], ['גאנט', '◇'], ['לוח משימות', '▤'], ['רשימה', '☷'], ['עדכון שבועי', '↗']];
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const todayKey = () => dateKey(new Date());
const plusDays = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return dateKey(date); };
const emptyTask = (owner: Task['owner']): Task => ({ id: '', title: '', description: '', owner, assignees: [owner], priority: 'Medium', status: 'Backlog', startDate: todayKey(), dueDate: plusDays(7), estimateMinutes: 60, area: 'Product', projectId: '', tags: [], dependencies: [], parentTaskId: '', blocker: '', milestone: false, reminderMinutes: null, recurring: false, recurrenceRule: '', recurrenceEnd: '', comments: [], version: 0 });
const fmt = (d: string) => { const date = new Date(`${d}T12:00:00`); return Number.isNaN(date.getTime()) ? 'ללא תאריך' : new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' }).format(date); };
const priorityRank: Record<Task['priority'], number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
const statusRank: Record<string, number> = { Blocked: 0, 'In Progress': 1, Review: 2, 'To Do': 3, Backlog: 4, Done: 5 };
const smartCompare = (a: Task, b: Task) => statusRank[a.status] - statusRank[b.status] || priorityRank[a.priority] - priorityRank[b.priority] || a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title, 'he');
const commentTime = (value: string) => { const date = new Date(value); if (Number.isNaN(date.getTime()))
    return value; return new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' }).format(date); };
const pendingDependencies = (task: Task, all: Task[]) => task.dependencies.filter(id => all.find(item => item.id === id)?.status !== 'Done');
const isLocked = (task: Task, all: Task[]) => pendingDependencies(task, all).length > 0;
const assigneesOf = (task: Task) => task.assignees?.length ? task.assignees : [task.owner];
const childCount = (task: Task, all: Task[]) => all.filter(item => item.parentTaskId === task.id).length;
const childProgress = (task: Task, all: Task[]) => {
    if (!task.id)
        return { done: 0, total: 0 };
    const descendants: Task[] = [];
    const collect = (parentId: string) => all.filter(item => item.parentTaskId === parentId).forEach(item => { descendants.push(item); collect(item.id); });
    collect(task.id);
    return { done: descendants.filter(item => item.status === 'Done').length, total: descendants.length };
};
const hierarchyOrder = (items: Task[]) => { const ids = new Set(items.map(item => item.id)), result: Task[] = []; const children = new Map<string, Task[]>(); items.forEach(item => { const parent = ids.has(item.parentTaskId) ? item.parentTaskId : ''; children.set(parent, [...(children.get(parent) || []), item]); }); const visit = (parent: string) => { (children.get(parent) || []).forEach(item => { result.push(item); visit(item.id); }); }; visit(''); return result.length === items.length ? result : items; };
export default function Home() {
    const [tasks, setTasks] = useState<Task[]>([]), [workspaceProjects,setWorkspaceProjects]=useState<Project[]>([]), [templates,setTemplates]=useState<TaskTemplate[]>([]), [savedViews,setSavedViews]=useState<SavedView[]>([]), [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]), [notifications, setNotifications] = useState<NotificationItem[]>([]), [notificationOpen, setNotificationOpen] = useState(false), [active, setActive] = useState('סקירה'), [person, setPerson] = useState<'Maoz' | 'Nissan'>('Maoz'), [query, setQuery] = useState(''), [owner, setOwner] = useState('כולם'), [priority, setPriority] = useState('הכול'), [status, setStatus] = useState('הכול'), [area, setArea] = useState('הכול'), [sort, setSort] = useState('חכם'), [editing, setEditing] = useState<Task | null>(null), [creating, setCreating] = useState(false), [mobile, setMobile] = useState(false), [toast, setToast] = useState(''), [undo,setUndo]=useState<UndoState|null>(null), [userMenu, setUserMenu] = useState(false), [settingsOpen, setSettingsOpen] = useState(false), [commandOpen,setCommandOpen]=useState(false), [assistantOpen,setAssistantOpen]=useState(false), [compact, setCompact] = useState(false), [preferencesReady, setPreferencesReady] = useState(false), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(''), [saving, setSaving] = useState(false), [saveError, setSaveError] = useState(''), [syncState,setSyncState]=useState<'syncing'|'live'|'offline'>('syncing');
    const searchRef = useRef<HTMLInputElement>(null);
    const savingRef = useRef(false);
    const liveChannelRef = useRef<BroadcastChannel | null>(null);
    const loadTasks = useCallback(async (silent = false) => { if (!silent)
        setLoading(true); if (!silent) setSyncState('syncing'); try {
        const response = await fetch('/api/tasks', { cache: 'no-store' });
        const data = await response.json() as unknown;
        if (!response.ok)
            throw new Error((data as {
                error?: string;
            }).error || 'לא ניתן לטעון את המשימות.');
        if (!Array.isArray(data))
            throw new Error('התקבלה תשובה לא תקינה מהשרת.');
        setTasks(data as Task[]);
        setLoadError('');
        setSyncState('live');
    }
    catch (error) {
        if (!silent)
            setLoadError(error instanceof Error ? error.message : 'לא ניתן לטעון את המשימות.');
        setSyncState('offline');
    }
    finally {
        if (!silent)
            setLoading(false);
    } }, []);
    const loadActivity = useCallback(async () => { try {
        const response = await fetch('/api/activity', { cache: 'no-store' });
        const data = await response.json() as unknown;
        if (response.ok && Array.isArray(data))
            setActivityEvents(data as ActivityEvent[]);
    }
    catch { } }, []);
    const loadNotifications = useCallback(async () => { try {
        const response = await fetch('/api/notifications', { cache: 'no-store' });
        const data = await response.json() as unknown;
        if (response.ok && Array.isArray(data))
            setNotifications(data as NotificationItem[]);
    }
    catch { } }, []);
    const loadProjects=useCallback(async()=>{try{const response=await fetch('/api/projects',{cache:'no-store'});const data=await response.json() as unknown;if(response.ok&&Array.isArray(data))setWorkspaceProjects(data as Project[])}catch{}},[]);
    const loadTemplates=useCallback(async()=>{try{const response=await fetch('/api/templates',{cache:'no-store'});const data=await response.json() as unknown;if(response.ok&&Array.isArray(data))setTemplates(data as TaskTemplate[])}catch{}},[]);
    const loadSavedViews=useCallback(async()=>{try{const response=await fetch('/api/saved-views',{cache:'no-store'});const data=await response.json() as unknown;if(response.ok&&Array.isArray(data))setSavedViews(data as SavedView[])}catch{}},[]);
    useEffect(() => { const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('myvet-workspace-live'); liveChannelRef.current = channel; const onMessage=()=>{void loadTasks(true);void loadActivity();void loadNotifications();}; channel?.addEventListener('message',onMessage); const initial = window.setTimeout(() => { void loadTasks(); void loadActivity(); void loadNotifications(); void loadProjects(); void loadTemplates(); void loadSavedViews(); }, 0); const refresh = () => { if (document.visibilityState === 'visible') {
        void loadTasks(true);
        void loadActivity();
        void loadNotifications();
        void loadProjects();
    } }; const online=()=>{setSyncState('syncing');refresh();};const offline=()=>setSyncState('offline'); const interval = window.setInterval(refresh, 5000); window.addEventListener('focus', refresh);window.addEventListener('online',online);window.addEventListener('offline',offline); return () => { window.clearTimeout(initial); window.clearInterval(interval); window.removeEventListener('focus', refresh);window.removeEventListener('online',online);window.removeEventListener('offline',offline);channel?.removeEventListener('message',onMessage);channel?.close();liveChannelRef.current=null; }; }, [loadTasks, loadActivity, loadNotifications,loadProjects,loadTemplates,loadSavedViews]);
    useEffect(() => { const timer = setTimeout(() => { const saved = localStorage.getItem('myvet-preferences'); if (saved) {
        try {
            const prefs = JSON.parse(saved);
            if (prefs.person === 'Maoz' || prefs.person === 'Nissan')
                setPerson(prefs.person);
            if (typeof prefs.compact === 'boolean')
                setCompact(prefs.compact);
        }
        catch { }
    } setPreferencesReady(true); }, 0); return () => clearTimeout(timer); }, []);
    useEffect(() => { if (preferencesReady)
        localStorage.setItem('myvet-preferences', JSON.stringify({ person, compact })); }, [person, compact, preferencesReady]);
    useEffect(() => { const close = () => setUserMenu(false); if (userMenu) {
        window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    } }, [userMenu]);
    useEffect(() => { if (!undo) return; const timer=window.setTimeout(()=>setUndo(null),8000);return()=>window.clearTimeout(timer); }, [undo]);
    useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { const target = event.target as HTMLElement | null; const typing = target?.matches('input,textarea,select,[contenteditable="true"]'); if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !editing && !settingsOpen && !assistantOpen) {
        event.preventDefault();
        setCommandOpen(true);
    } else if (!typing && !editing && !settingsOpen && !assistantOpen && !commandOpen && !saving && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        setSaveError('');
        setCreating(true);
        setEditing(emptyTask(person));
    } }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown); }, [editing, settingsOpen, assistantOpen, commandOpen, saving, person]);
    const availableAreas = useMemo(() => [...new Set([...areas, ...tasks.map(task => task.area)])], [tasks]);
    const filtered = useMemo(() => { const q = query.trim().toLocaleLowerCase('he'); const today = todayKey(), weekEnd = plusDays(6); const visible = tasks.filter(task => { const parent = tasks.find(item => item.id === task.parentTaskId); const match = !q || `${task.title} ${task.description} ${task.id} ${task.area} ${task.tags.join(' ')} ${parent?.title || ''}`.toLocaleLowerCase('he').includes(q); const assigned = active === 'המשימות שלי' ? assigneesOf(task).includes(person) : true; const timed = active === 'היום' ? task.status !== 'Done' : active === 'השבוע' ? task.status !== 'Done' && task.dueDate >= today && task.dueDate <= weekEnd : true; return match && assigned && timed && (owner === 'כולם' || assigneesOf(task).includes(owner as Task['owner'])) && (priority === 'הכול' || task.priority === priority) && (status === 'הכול' || task.status === status) && (area === 'הכול' || task.area === area); }); return visible.sort((a, b) => sort === 'תאריך יעד' ? a.dueDate.localeCompare(b.dueDate) : sort === 'עדיפות' ? priorityRank[a.priority] - priorityRank[b.priority] || a.dueDate.localeCompare(b.dueDate) : sort === 'סטטוס' ? statusRank[a.status] - statusRank[b.status] || a.dueDate.localeCompare(b.dueDate) : sort === 'עודכן לאחרונה' ? (b.updatedAt || '').localeCompare(a.updatedAt || '') : sort === 'נוצר לאחרונה' ? (b.createdAt || '').localeCompare(a.createdAt || '') : smartCompare(a, b)); }, [tasks, query, active, person, owner, priority, status, area, sort]);
    const showToast = (message: string, duration = 3200) => { setToast(message); window.setTimeout(() => setToast(current => current === message ? '' : current), duration); };
    const saveRequest = async (task: Task, isNew = false) => {
        const response = await fetch('/api/tasks', { method: isNew ? 'POST' : 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(task) });
        const data = await response.json() as unknown;
        const payload = data as {
            error?: string;
            code?: string;
            current?: Task;
        };
        if (!response.ok) {
            if (payload.code === 'VERSION_CONFLICT' && payload.current)
                setTasks(previous => previous.map(item => item.id === payload.current!.id ? payload.current! : item));
            throw new Error(payload.error || 'השמירה נכשלה.');
        }
        return data as Task;
    };
    const persist = async (task: Task, isNew = false) => { if (savingRef.current)
        return false; savingRef.current = true; setSaving(true); setSaveError(''); try {
        const before = tasks.find(item => item.id === task.id);
        const saved = await saveRequest(task, isNew);
        setTasks(previous => isNew ? [saved, ...previous] : previous.map(item => item.id === saved.id ? saved : item));
        if (before && !isNew) setUndo({ label: 'השינוי נשמר', before: [before], after: [saved] });
        setEditing(null);
        setCreating(false);
        void loadActivity();
        void loadNotifications();
        liveChannelRef.current?.postMessage({ type: 'tasks-changed', id: saved.id });
        showToast(isNew ? 'המשימה נוצרה' : 'השינויים נשמרו', isNew ? 3200 : 8000);
        return true;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'השמירה נכשלה. נסו שוב.';
        setSaveError(message);
        showToast('לא הצלחנו לשמור את השינוי');
        return false;
    }
    finally {
        savingRef.current = false;
        setSaving(false);
    } };
    const saveMany = async (updates: Task[], label: string) => { if (savingRef.current || !updates.length) return 0; savingRef.current = true; setSaving(true); const before = updates.map(update => tasks.find(task => task.id === update.id)).filter((task): task is Task => Boolean(task)); const saved: Task[] = []; try {
        for (const update of updates) saved.push(await saveRequest(update));
        setTasks(current => current.map(task => saved.find(item => item.id === task.id) || task));
        setUndo({ label, before, after: saved }); showToast(label, 8000); liveChannelRef.current?.postMessage({ type: 'tasks-changed' }); void loadActivity(); void loadNotifications(); return saved.length;
    } catch (error) { showToast(error instanceof Error ? error.message : 'חלק מהשינויים לא נשמרו'); await loadTasks(true); return saved.length; } finally { savingRef.current = false; setSaving(false); } };
    const undoChanges = async () => { const action = undo; if (!action || savingRef.current) return; savingRef.current = true; setSaving(true); try { const restored: Task[] = []; for (const previous of action.before) { const current = action.after.find(item => item.id === previous.id); if (!current) continue; restored.push(await saveRequest({ ...previous, version: current.version })); } setTasks(items => items.map(task => restored.find(item => item.id === task.id) || task)); setUndo(null); showToast('השינוי בוטל'); liveChannelRef.current?.postMessage({ type: 'tasks-changed' }); void loadActivity(); } catch { showToast('לא ניתן לבטל כי הנתונים השתנו בינתיים'); await loadTasks(true); setUndo(null); } finally { savingRef.current = false; setSaving(false); } };
    const archiveTask = async (task: Task) => { if (savingRef.current || !window.confirm(`להעביר את „${task.title}” לארכיון? אפשר לשחזר אותה אחר כך מההגדרות.`))
        return false; savingRef.current = true; setSaving(true); setSaveError(''); try {
        const response = await fetch('/api/tasks', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: task.id, version: task.version }) });
        const data = await response.json() as {
            error?: string;
        };
        if (!response.ok)
            throw new Error(data.error || 'ההעברה לארכיון נכשלה.');
        setTasks(previous => previous.filter(item => item.id !== task.id));
        setEditing(null);
        void loadActivity();
        void loadNotifications();
        showToast('המשימה הועברה לארכיון');
        return true;
    }
    catch (error) {
        setSaveError(error instanceof Error ? error.message : 'ההעברה לארכיון נכשלה.');
        showToast('לא הצלחנו להעביר את המשימה לארכיון');
        return false;
    }
    finally {
        savingRef.current = false;
        setSaving(false);
    } };
    const move = (task: Task, nextStatus: string) => { const pending = pendingDependencies(task, tasks); if (pending.length && nextStatus !== 'Backlog') {
        showToast(`המשימה נעולה עד להשלמת ${pending.length} משימות תלויות`);
        return Promise.resolve(false);
    } if (nextStatus === 'Blocked' && !task.blocker) {
        setSaveError('יש לפרט מה חוסם את המשימה לפני השמירה.');
        setCreating(false);
        setEditing({ ...task, status: 'Blocked' });
        return Promise.resolve(false);
    } const activeChildren = tasks.filter(item => item.parentTaskId === task.id && item.status !== 'Done'); if (nextStatus === 'Done' && activeChildren.length) {
        showToast(`יש להשלים קודם ${activeChildren.length} משימות משנה פעילות`);
        setCreating(false);
        setEditing(task);
        return Promise.resolve(false);
    } return persist({ ...task, status: nextStatus }); };
    const projects = availableAreas.map(name => { const projectTasks = tasks.filter(task => task.area === name); return { name, color: colors[name] || '#64748b', progress: projectTasks.length ? Math.round(projectTasks.filter(task => task.status === 'Done').length / projectTasks.length * 100) : 0, open: projectTasks.filter(task => task.status !== 'Done').length }; });
    const clearFilters = () => { setOwner('כולם'); setPriority('הכול'); setStatus('הכול'); setArea('הכול'); setSort('חכם'); setQuery(''); };
    const applySavedView = (view: SavedView) => { const value=view.filters;setQuery(value.query||'');setOwner(value.owner||'כולם');setPriority(value.priority||'הכול');setStatus(value.status||'הכול');setArea(value.area||'הכול');setSort(value.sort||'חכם');if(value.active)setActive(value.active); };
    const saveCurrentView = async (name:string) => { if(!name.trim())return;const filters={query,owner,priority,status,area,sort,active};const response=await fetch('/api/saved-views',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:name.trim(),filters})});const data=await response.json() as SavedView&{error?:string};if(!response.ok){showToast(data.error||'שמירת התצוגה נכשלה');return;}setSavedViews(current=>[data,...current]);showToast('התצוגה נשמרה');};
    const deleteSavedView = async (view: SavedView) => { const response=await fetch('/api/saved-views',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({id:view.id})});if(!response.ok){showToast('מחיקת התצוגה נכשלה');return;}setSavedViews(current=>current.filter(item=>item.id!==view.id));showToast('התצוגה נמחקה');};
    const openTask = (task: Task) => { setSaveError(''); setCreating(false); setEditing(task); };
    const commentAuthor = (): Task['owner'] => document.body.dataset.userEmail === 'nisank2@gmail.com' ? 'Nissan' : 'Maoz';
    const markNotifications = async (ids: string[] | null) => { const response = await fetch('/api/notifications', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ids ? { ids } : { all: true }) }); if (response.ok) {
        const now = new Date().toISOString();
        setNotifications(current => current.map(item => !ids || ids.includes(item.id) ? { ...item, readAt: now } : item));
    } };
    const openNotification = (item: NotificationItem) => { if (!item.readAt)
        void markNotifications([item.id]); const task = tasks.find(task => task.id === item.taskId); if (task)
        openTask(task); setNotificationOpen(false); };
    const createFromTemplate=(template:TaskTemplate)=>{const base=emptyTask(person);setCreating(true);setSaveError('');setEditing({...base,...template.taskData,id:'',startDate:base.startDate,dueDate:base.dueDate,dependencies:[],parentTaskId:'',comments:[],version:0})};
    const saveTemplate=async(task:Task)=>{const name=window.prompt('שם התבנית',task.title);if(!name?.trim())return;const response=await fetch('/api/templates',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:name.trim(),taskData:task})});const data=await response.json() as {error?:string};if(!response.ok){showToast(data.error||'שמירת התבנית נכשלה');return}await loadTemplates();showToast('התבנית נשמרה')};
    const createFromSmartDraft=(draft:Partial<Task>)=>{setAssistantOpen(false);setCreating(true);setSaveError('');setEditing({...emptyTask(person),...draft,id:'',comments:[],dependencies:[],parentTaskId:'',version:0});};
    return <main className={`app-shell ${compact ? 'compact' : ''}`} dir="rtl">
  <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}><div className="brand"><span className="brand-mark">M</span><div><strong>MyVet</strong><small>Workspace</small></div><button className="close-mobile" aria-label="סגירת תפריט" onClick={() => setMobile(false)}>×</button></div><nav className="main-nav">{nav.map(([name, icon]) => <button key={name} className={active === name ? 'active' : ''} aria-current={active === name ? 'page' : undefined} onClick={() => { setActive(name); setMobile(false); }}><span className="nav-icon" aria-hidden="true">{icon}</span>{name}{name === 'המשימות שלי' && <b>{tasks.filter(task => assigneesOf(task).includes(person) && task.status !== 'Done').length}</b>}</button>)}</nav><div className="nav-label"><span>תחומים</span></div><div className="project-nav">{projects.map(project => <button key={project.name} className={area === project.name ? 'active' : ''} title={`הצגת משימות ${project.name}`} onClick={() => { setArea(project.name); setActive('רשימה'); setMobile(false); }}><i style={{ background: project.color }}/>{project.name}<span>{project.progress}%</span></button>)}</div><div className="sidebar-foot"><button className="settings-button" onClick={() => { setSettingsOpen(true); setUserMenu(false); }}>⚙ הגדרות</button><div className="user-menu-wrap" onClick={event => event.stopPropagation()}><button className="mini-user" aria-expanded={userMenu} aria-haspopup="menu" onClick={() => setUserMenu(value => !value)}><span className={`avatar avatar-${person.toLowerCase()}`}>{person[0]}</span><span><strong>{person}</strong><small>תצוגת עבודה</small></span><span className="user-chevron">⌄</span></button>{userMenu && <div className="user-menu" role="menu"><small>הצגת משימות עבור</small>{(['Maoz', 'Nissan'] as const).map(name => <button key={name} role="menuitem" className={person === name ? 'selected' : ''} onClick={() => { setPerson(name); setUserMenu(false); }}><span className={`avatar avatar-${name.toLowerCase()}`}>{name[0]}</span><span><strong>{name}</strong><small>{name === 'Maoz' ? 'מעוז' : 'ניסן'}</small></span>{person === name && <b>✓</b>}</button>)}<button role="menuitem" onClick={() => { setSettingsOpen(true); setUserMenu(false); }}>⚙ פתיחת הגדרות</button><a role="menuitem" href="/signout-with-chatgpt?return_to=/">↪ יציאה מהאתר</a></div>}</div></div></aside>
  {mobile && <button className="backdrop" aria-label="סגירת תפריט" onClick={() => setMobile(false)}/>}
  <section className="workspace"><header className="topbar"><button className="mobile-menu" aria-label="פתיחת תפריט" onClick={() => setMobile(true)}>☰</button><label className="search"><span>⌕</span><input aria-label="חיפוש בסביבת העבודה" ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="חיפוש משימות, תיאור, תחומים ותגיות..."/><button type="button" onClick={() => setCommandOpen(true)} aria-label="פתיחת פלטת פקודות"><kbd>Ctrl K</kbd></button></label><div className={`sync-state sync-${syncState}`} role="status"><i/>{syncState==='live'?'מסונכרן':syncState==='syncing'?'מסנכרן':'לא מחובר'}</div><div className="top-actions"><button className="icon-button smart-button" aria-label="פתיחת העוזר החכם" title="עוזר חכם" onClick={()=>setAssistantOpen(true)}>✦</button><div className="notification-wrap"><button className="icon-button" aria-label={`התראות, ${notifications.filter(item => !item.readAt).length} לא נקראו`} aria-expanded={notificationOpen} onClick={() => setNotificationOpen(value => !value)}>♢{notifications.some(item => !item.readAt) && <i />}</button>{notificationOpen && <NotificationPanel items={notifications} open={openNotification} markAll={() => void markNotifications(null)}/>}</div>{templates.length>0&&<select className="template-picker" aria-label="יצירת משימה מתבנית" value="" onChange={event=>{const template=templates.find(item=>item.id===event.target.value);if(template)createFromTemplate(template)}}><option value="">מתבנית…</option>{templates.map(template=><option value={template.id} key={template.id}>{template.name}</option>)}</select>}<div className="person-switch" aria-label="בחירת תצוגת עבודה">{(['Maoz', 'Nissan'] as const).map(name => <button key={name} className={person === name ? 'selected' : ''} aria-pressed={person === name} onClick={() => setPerson(name)}>{name}</button>)}</div><button className="new-task" disabled={saving} onClick={() => { setSaveError(''); setCreating(true); setEditing(emptyTask(person)); }} title="יצירת משימה חדשה">＋ משימה חדשה</button></div></header>
   <div className="content">
    {loading ? <LoadingState /> : loadError ? <ErrorState message={loadError} retry={() => loadTasks()}/> : active === 'סקירה' ? <Dashboard tasks={tasks} activityEvents={activityEvents} projects={projects} person={person} open={openTask} setActive={setActive} openArea={name => { setArea(name); setActive('רשימה'); }}/> : active === 'פרויקטים' ? <ProjectsView projects={workspaceProjects} tasks={tasks} person={person} refresh={loadProjects} openTask={openTask}/> : <><div className="view-head"><div><p>MyVet Workspace</p><h1>{active}</h1><span>{active === 'לוח שנה' ? 'כל המשימות לפי תאריך יעד' : active === 'גאנט' ? 'ציר זמן לפי תאריכים, תלויות ואבני דרך' : active === 'לוח משימות' ? 'מבט על העבודה בתהליך' : active === 'היום' ? 'תוכנית עבודה ממוקדת לפי דחיפות, תלויות ועומס' : active === 'עדכון שבועי' ? 'סיכום מוכן לשיתוף מתוך נתוני העבודה' : `${filtered.length} משימות מוצגות`}</span></div><button className="secondary" onClick={clearFilters}>ניקוי סינון</button></div>{active!=='עדכון שבועי'&&<><SavedViewBar views={savedViews} apply={applySavedView} save={name=>void saveCurrentView(name)} remove={view=>void deleteSavedView(view)}/><Filters owner={owner} setOwner={setOwner} priority={priority} setPriority={setPriority} status={status} setStatus={setStatus} area={area} setArea={setArea} areas={availableAreas} sort={sort} setSort={setSort}/></>}{active === 'עדכון שבועי' ? <WeeklyUpdateView tasks={tasks}/> : active === 'היום' ? <SmartToday tasks={filtered} all={tasks} person={person} open={openTask} move={move}/> : active === 'לוח שנה' ? <TaskCalendar tasks={filtered} open={openTask}/> : active === 'גאנט' ? <TaskGantt tasks={filtered} open={openTask} saveMany={saveMany}/> : active === 'לוח משימות' ? <Board tasks={filtered} all={tasks} open={openTask} move={move}/> : <List tasks={filtered} all={tasks} open={openTask} complete={task => move(task, task.status === 'Done' ? 'To Do' : 'Done')} saveMany={saveMany}/>}</>}
   </div>
  </section>
  {editing && <TaskModal task={editing} isNew={creating} all={tasks} projects={workspaceProjects} person={commentAuthor()} areas={availableAreas} saving={saving} error={saveError} close={() => { if (!saving) {
        setEditing(null);
        setCreating(false);
        setSaveError('');
    } }} save={persist} archive={archiveTask} saveTemplate={saveTemplate}/>} {settingsOpen && <SettingsModal person={person} setPerson={setPerson} compact={compact} setCompact={setCompact} dataChanged={() => { void loadTasks(true); void loadActivity(); }} close={() => setSettingsOpen(false)}/>} {commandOpen&&<CommandPalette tasks={tasks} views={savedViews} close={()=>setCommandOpen(false)} navigate={setActive} openTask={openTask} applyView={applySavedView} create={()=>{setCommandOpen(false);setCreating(true);setEditing(emptyTask(person));}}/>}{assistantOpen&&<SmartAssistant tasks={tasks} person={person} close={()=>setAssistantOpen(false)} create={createFromSmartDraft}/>} {toast && <div className="toast" role="status"><span>{toast}</span>{undo&&<button disabled={saving} onClick={()=>void undoChanges()}>ביטול</button>}</div>}
 </main>;
}
function LoadingState() { return <div className="page-state" role="status"><span className="spinner"/><strong>טוענים את סביבת העבודה…</strong></div>; }
function ErrorState({ message, retry }: {
    message: string;
    retry: () => void;
}) { return <div className="page-state error-state" role="alert"><span>!</span><strong>לא הצלחנו לטעון את המשימות</strong><p>{message}</p><button className="secondary" onClick={retry}>ניסיון נוסף</button></div>; }
function SavedViewBar({views,apply,save,remove}:{views:SavedView[];apply:(view:SavedView)=>void;save:(name:string)=>void;remove:(view:SavedView)=>void}) { const [adding,setAdding]=useState(false),[name,setName]=useState('');const submit=()=>{const value=name.trim();if(!value)return;save(value);setName('');setAdding(false);};return <div className="saved-views" aria-label="תצוגות שמורות"><strong>תצוגות</strong>{adding?<span className="saved-view-create"><input autoFocus maxLength={50} aria-label="שם התצוגה החדשה" placeholder="שם התצוגה" value={name} onChange={event=>setName(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')submit();if(event.key==='Escape'){setAdding(false);setName('');}}}/><button disabled={!name.trim()} onClick={submit}>שמירה</button><button aria-label="ביטול שמירת תצוגה" onClick={()=>{setAdding(false);setName('');}}>×</button></span>:<button onClick={()=>setAdding(true)}>＋ שמירת התצוגה</button>}{views.map(view=><span key={view.id}><button onClick={()=>apply(view)}>{view.name}</button><button aria-label={`מחיקת התצוגה ${view.name}`} onClick={()=>remove(view)}>×</button></span>)}</div>; }

function SmartToday({tasks,all,person,open,move}:{tasks:Task[];all:Task[];person:Task['owner'];open:(task:Task)=>void;move:(task:Task,status:string)=>void}) {
    const plan=buildTodayPlan(tasks,person);
    const section=(title:string,subtitle:string,items:ReturnType<typeof buildTodayPlan>['now'],action?:string)=><section className="today-section"><header><div><h2>{title}</h2><p>{subtitle}</p></div><b>{items.length}</b></header><div>{items.length?items.map(({task,reason})=><article key={task.id}><button className="today-task-main" onClick={()=>open(task)}><span className={`priority-dot p-${task.priority.toLowerCase()}`}/><span><strong>{task.title}</strong><small>{reason} · {formatEstimate(task.estimateMinutes)}</small></span><AssigneeStack task={task}/></button>{action&&<button className="today-action" disabled={isLocked(task,all)} onClick={()=>move(task,action)}>{action==='In Progress'?'התחלה':'השלמה'}</button>}</article>):<div className="panel-empty">אין משימות באזור הזה</div>}</div></section>;
    return <div className="today-plan"><div className="today-focus-note"><span>✦</span><div><strong>תוכנית העבודה של {person}</strong><p>הסדר מתעדכן לפי דחיפות, תלויות, עומס ותאריכי יעד. ההחלטה נשארת בידיים שלכם.</p></div></div><div className="today-grid">{section('להתחיל עכשיו','שלוש המשימות בעלות הערך הגבוה ביותר',plan.now,'In Progress')}{section('דורש תשומת לב','איחורים, חסימות ותלויות',plan.attention)}{section('בהמשך','המשימות הבאות בתור',plan.later,'Done')}</div></div>;
}

function WeeklyUpdateView({tasks}:{tasks:Task[]}) {
    const report=weeklySummary(tasks), [copied,setCopied]=useState(false); const copy=async()=>{await navigator.clipboard.writeText(report.text);setCopied(true);window.setTimeout(()=>setCopied(false),2200);};
    return <section className="weekly-update"><header><span>↗</span><div><p>סיכום אוטומטי על בסיס הנתונים האמיתיים</p><h2>עדכון שבועי של MyVet</h2></div><button className="secondary" onClick={()=>void copy()}>{copied?'הועתק ✓':'העתקה לשיתוף'}</button></header><div className="weekly-metrics"><article><strong>{report.done}</strong><span>הושלמו השבוע</span></article><article><strong>{report.dueSoon}</strong><span>מתוכננות לשבוע הבא</span></article><article className={report.blocked?'attention':''}><strong>{report.blocked}</strong><span>חסומות</span></article><article className={report.overdue?'attention':''}><strong>{report.overdue}</strong><span>באיחור</span></article></div><textarea readOnly aria-label="טיוטת עדכון שבועי" value={report.text}/><p className="weekly-note">הטיוטה נוצרת מקומית מנתוני המשימות ואינה נשלחת לאף גורם. אפשר להעתיק ולערוך לפני שיתוף.</p></section>;
}

function CommandPalette({tasks,views,close,navigate,openTask,applyView,create}:{tasks:Task[];views:SavedView[];close:()=>void;navigate:(value:string)=>void;openTask:(task:Task)=>void;applyView:(view:SavedView)=>void;create:()=>void}) {
    const [value,setValue]=useState(''); const q=value.trim().toLocaleLowerCase('he');
    useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')close();};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[close]);
    const matching=tasks.filter(task=>!q||`${task.title} ${task.id} ${task.area}`.toLocaleLowerCase('he').includes(q)).slice(0,7);
    const go=(view:string)=>{navigate(view);close();};
    return <div className="modal-wrap command-wrap" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}><section className="command-palette" role="dialog" aria-modal="true" aria-label="פלטת פקודות"><header><span>⌕</span><input autoFocus value={value} onChange={event=>setValue(event.target.value)} placeholder="חיפוש פעולה, תצוגה או משימה…"/><kbd>Esc</kbd></header><div className="command-results">{!q&&<><small>פעולות מהירות</small><button onClick={create}><b>＋</b><span><strong>משימה חדשה</strong><em>C</em></span></button>{['היום','המשימות שלי','לוח משימות','גאנט'].map(view=><button key={view} onClick={()=>go(view)}><b>→</b><span><strong>מעבר אל {view}</strong></span></button>)}{views.length>0&&<small>תצוגות שמורות</small>}{views.map(view=><button key={view.id} onClick={()=>{applyView(view);close();}}><b>◉</b><span><strong>{view.name}</strong><em>תצוגה שמורה</em></span></button>)}</>}<small>משימות</small>{matching.map(task=><button key={task.id} onClick={()=>{openTask(task);close();}}><b className={`priority-dot p-${task.priority.toLowerCase()}`}/><span><strong>{task.title}</strong><em>{task.id} · {task.status} · {fmt(task.dueDate)}</em></span></button>)}{q&&!matching.length&&<div className="command-empty">לא נמצאו משימות מתאימות</div>}</div></section></div>;
}

function SmartAssistant({tasks,person,close,create}:{tasks:Task[];person:Task['owner'];close:()=>void;create:(draft:Partial<Task>)=>void}) {
    const [text,setText]=useState('');const proposal=useMemo(()=>text.trim()?draftTaskFromText(text,person,tasks):null,[text,person,tasks]);
    useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')close();};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[close]);
    return <div className="modal-wrap" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}><section className="smart-assistant" role="dialog" aria-modal="true" aria-labelledby="smart-title"><header><div><span>עוזר חכם מבוקר</span><h2 id="smart-title">הפיכת טקסט למשימה</h2></div><button aria-label="סגירת העוזר" onClick={close}>×</button></header><div><label>מה צריך לקרות?<textarea autoFocus value={text} onChange={event=>setText(event.target.value)} placeholder="לדוגמה: ניסן צריך לבדוק הרשאות Backend בדחיפות עד מחר"/></label>{proposal&&<section className="smart-proposal"><small>הצעה לבדיקה — שום דבר לא נשמר עדיין</small><h3>{proposal.title}</h3><div><span>אחראי <b>{proposal.owner}</b></span><span>עדיפות <b>{proposal.priority}</b></span><span>תחום <b>{proposal.area}</b></span><span>יעד <b>{fmt(proposal.dueDate)}</b></span></div>{proposal.duplicate&&<p className="duplicate-warning">ייתכן שכבר קיימת משימה דומה: <strong>{proposal.duplicate.title}</strong></p>}</section>}<div className="smart-capabilities"><span>✦ מציע מבנה בלבד</span><span>✓ דורש אישור לפני שמירה</span><span>⌁ מזהה כפילויות אפשריות</span></div></div><footer><button className="secondary" onClick={close}>ביטול</button><button className="new-task" disabled={!proposal} onClick={()=>proposal&&create(proposal)}>המשך לעריכת המשימה</button></footer></section></div>;
}
function NotificationPanel({ items, open, markAll }: {
    items: NotificationItem[];
    open: (item: NotificationItem) => void;
    markAll: () => void;
}) {
    const unread = items.filter(item => !item.readAt).length;
    return <section className="notification-panel" role="dialog" aria-label="התראות"><header><div><strong>התראות</strong><small>{unread ? `${unread} לא נקראו` : 'הכול נקרא'}</small></div>{unread > 0 && <button type="button" onClick={markAll}>סימון הכול כנקרא</button>}</header><div>{items.length ? items.slice(0, 20).map(item => <button type="button" key={item.id} className={item.readAt ? '' : 'unread'} onClick={() => open(item)}><span className="notification-dot"/><span><strong>{item.message}</strong><small>{item.taskTitle} · {commentTime(item.createdAt)}</small></span></button>) : <div className="notification-empty"><b>אין עדכונים חדשים</b><span>הקצאות, תיוגים ותלויות שנפתחו יופיעו כאן.</span></div>}</div></section>;
}
function ProjectsView({ projects, tasks, person, refresh, openTask }: {
    projects: Project[];
    tasks: Task[];
    person: Task['owner'];
    refresh: () => Promise<void>;
    openTask: (task: Task) => void;
}) {
    const [creating, setCreating] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
    const [draft, setDraft] = useState({ name: '', description: '', color: '#6559d4', owner: person, status: 'Active', health: 'On track', startDate: todayKey(), dueDate: plusDays(30) });
    const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(''); try {
        const response = await fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error || 'יצירת הפרויקט נכשלה.');
        await refresh();
        setCreating(false);
        setDraft({ name: '', description: '', color: '#6559d4', owner: person, status: 'Active', health: 'On track', startDate: todayKey(), dueDate: plusDays(30) });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'יצירת הפרויקט נכשלה.'); } finally { setSaving(false); } };
    return <><div className="view-head project-view-head"><div><p>MyVet Workspace</p><h1>פרויקטים</h1><span>מסגרת עבודה עם בעלים, יעד והתקדמות אמיתית מהמשימות</span></div><button className="new-task" onClick={() => setCreating(value => !value)}>{creating ? 'סגירה' : '＋ פרויקט חדש'}</button></div>
    {creating && <form className="project-create" onSubmit={submit}><label>שם הפרויקט<input autoFocus required maxLength={100} value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))}/></label><label>בעלים<select value={draft.owner} onChange={event => setDraft(current => ({ ...current, owner: event.target.value as Task['owner'] }))}><option>Maoz</option><option>Nissan</option></select></label><label>תאריך התחלה<input type="date" required value={draft.startDate} max={draft.dueDate} onChange={event => setDraft(current => ({ ...current, startDate: event.target.value }))}/></label><label>תאריך יעד<input type="date" required value={draft.dueDate} min={draft.startDate} onChange={event => setDraft(current => ({ ...current, dueDate: event.target.value }))}/></label><label className="project-description">תיאור<textarea maxLength={2000} value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))}/></label><label>צבע<input type="color" value={draft.color} onChange={event => setDraft(current => ({ ...current, color: event.target.value }))}/></label>{error && <div className="form-error" role="alert">{error}</div>}<button className="new-task" disabled={saving}>{saving ? 'יוצרים…' : 'יצירת פרויקט'}</button></form>}
    {projects.length ? <section className="workspace-project-grid">{projects.map(project => { const projectTasks = tasks.filter(task => task.projectId === project.id); const done = projectTasks.filter(task => task.status === 'Done').length, percent = projectTasks.length ? Math.round(done / projectTasks.length * 100) : 0; const blocked = projectTasks.filter(task => task.status === 'Blocked').length; return <article key={project.id} className="workspace-project-card"><header><span style={{ background: project.color }}/><div><h2>{project.name}</h2><small>{project.owner} · {project.status}</small></div><b className={`health health-${project.health.replaceAll(' ', '-').toLowerCase()}`}>{project.health}</b></header>{project.description && <p>{project.description}</p>}<div className="project-dates"><span>{fmt(project.startDate)}</span><i>←</i><span>{fmt(project.dueDate)}</span></div><div className="project-progress-label"><span>{done} מתוך {projectTasks.length} הושלמו</span><strong>{percent}%</strong></div><div className="progress"><i style={{ width: `${percent}%`, background: project.color }}/></div><footer><span>{projectTasks.filter(task => task.status !== 'Done').length} פתוחות</span><span>{blocked} חסומות</span></footer>{projectTasks.length > 0 && <div className="project-task-links">{projectTasks.filter(task => task.status !== 'Done').slice(0, 3).map(task => <button key={task.id} onClick={() => openTask(task)}>{task.title}<span>←</span></button>)}</div>}</article>; })}</section> : !creating && <div className="projects-empty"><span>◈</span><h2>אין עדיין פרויקטים</h2><p>צרו פרויקט ראשון וקשרו אליו משימות מתוך חלון המשימה.</p><button className="new-task" onClick={() => setCreating(true)}>יצירת פרויקט ראשון</button></div>}</>;
}
function Dashboard({ tasks, activityEvents, projects, person, open, setActive, openArea }: {
    tasks: Task[];
    activityEvents: ActivityEvent[];
    projects: {
        name: string;
        color: string;
        progress: number;
        open: number;
    }[];
    person: string;
    open: (task: Task) => void;
    setActive: (value: string) => void;
    openArea: (value: string) => void;
}) {
    const attention = [...tasks].filter(task => task.status !== 'Done').sort(smartCompare).slice(0, 4);
    const updates = activityEvents.slice(0, 6);
    const done = tasks.filter(task => task.status === 'Done').length;
    const percent = Math.round(done / tasks.length * 100) || 0;
    const today = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    const founderSummary = (name: Task['owner']) => ({ open: tasks.filter(task => assigneesOf(task).includes(name) && task.status !== 'Done').length, progress: tasks.filter(task => assigneesOf(task).includes(name) && task.status === 'In Progress').length, blocked: tasks.filter(task => assigneesOf(task).includes(name) && task.status === 'Blocked').length });
    return <><div className="welcome"><div><p>{today}</p><h1>שלום, {person === 'Maoz' ? 'מעוז' : 'ניסן'} <span>👋</span></h1><p className="sub">הנה תמונת המצב של MyVet להיום</p></div><div className="team-summary" aria-label="תמונת מצב צוותית">{(['Maoz', 'Nissan'] as const).map(name => { const summary = founderSummary(name); return <div key={name}><span className={`avatar avatar-${name.toLowerCase()}`}>{name[0]}</span><span><strong>{name}</strong><small>{summary.progress} בביצוע · {summary.blocked} חסומות · {summary.open} פתוחות</small></span></div>; })}</div></div><section className="stats-grid"><Metric icon="◎" tone="violet" label="משימות פתוחות" value={tasks.filter(task => task.status !== 'Done').length} note="בכל התחומים"/><Metric icon="!" tone="red" label="דורשות טיפול" value={tasks.filter(task => task.status !== 'Done' && (task.priority === 'Urgent' || task.dueDate <= todayKey())).length} note="דחופות או באיחור"/><Metric icon="⊘" tone="amber" label="משימות חסומות" value={tasks.filter(task => task.status === 'Blocked').length} note="ממתינות להחלטה"/><article className="progress-card"><div className="progress-head"><span className="stat-icon green">↗</span><span><small>התקדמות כללית</small><strong>{percent}%</strong></span></div><div className="progress"><i style={{ width: `${percent}%` }}/></div><p>{done} מתוך {tasks.length} הושלמו</p></article></section><div className="dashboard-grid"><section className="panel tasks-panel"><div className="panel-head"><div><h2>דורש תשומת לב</h2><p>חסומות, דחופות ובעלות יעד קרוב</p></div><button onClick={() => setActive('רשימה')}>כל המשימות ←</button></div><div>{attention.length ? attention.map(task => <TaskRow key={task.id} task={task} open={open}/>) : <div className="panel-empty">אין כרגע משימות שדורשות טיפול 🎉</div>}</div></section><section className="panel activity-panel"><div className="panel-head"><div><h2>פעילות אחרונה</h2><p>שינויים אמיתיים שבוצעו בסביבת העבודה</p></div></div><div className="activity-list">{updates.length ? updates.map(event => <Activity key={event.id} event={event} task={tasks.find(task => task.id === event.taskId)} open={open}/>) : <div className="panel-empty">הפעילות הבאה שתבוצע תופיע כאן</div>}</div></section></div><section className="panel projects-panel"><div className="panel-head"><div><h2>התקדמות לפי תחום</h2><p>סטטוס התחומים הפעילים</p></div></div><div className="project-grid">{projects.map((project, index) => <article role="button" tabIndex={0} aria-label={`פתיחת משימות ${project.name}`} key={project.name} onClick={() => openArea(project.name)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openArea(project.name);
    } }}><div><span className="project-icon" style={{ background: `${project.color}18`, color: project.color }}>{['P', 'B', 'F', '₪', 'S', 'O', 'AI'][index] || project.name.slice(0, 2)}</span><span><strong>{project.name}</strong><small>{project.open} משימות פתוחות</small></span><b>{project.progress}%</b></div><div className="progress"><i style={{ width: `${project.progress}%`, background: project.color }}/></div><small className="project-action">פתיחת התחום ←</small></article>)}</div></section></>;
}
function Metric({ icon, tone, label, value, note }: {
    icon: string;
    tone: string;
    label: string;
    value: number;
    note: string;
}) { return <article><span className={`stat-icon ${tone}`}>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div></article>; }
export function AssigneeStack({ task, showNames = false }: {
    task: Task;
    showNames?: boolean;
}) { const names = assigneesOf(task); return <span className="assignee-stack" aria-label={`אחראים: ${names.join(', ')}`}><span>{names.map(name => <i key={name} className={`avatar avatar-${name.toLowerCase()}`}>{name[0]}</i>)}</span>{showNames && <small>{names.join(' + ')}</small>}</span>; }
function Activity({ event, task, open }: {
    event: ActivityEvent;
    task?: Task;
    open: (t: Task) => void;
}) { return <button className="activity-item" disabled={!task} onClick={() => task && open(task)}><span className={`avatar avatar-${event.actorName.toLowerCase()}`}>{event.actorName[0]}</span><span><strong>{event.actorName}</strong><small>{commentTime(event.createdAt)}</small><b>{event.summary}</b><em><span>{event.taskTitle}</span></em></span>{task && <span className="activity-arrow">←</span>}</button>; }
function Filters(props: {
    owner: string;
    setOwner: (value: string) => void;
    priority: string;
    setPriority: (value: string) => void;
    status: string;
    setStatus: (value: string) => void;
    area: string;
    setArea: (value: string) => void;
    areas: string[];
    sort: string;
    setSort: (value: string) => void;
}) { return <div className="filters" aria-label="סינון ומיון משימות"><span>מסננים</span><label><span>אחראי</span><select aria-label="סינון לפי אחראי" value={props.owner} onChange={event => props.setOwner(event.target.value)}><option>כולם</option><option>Maoz</option><option>Nissan</option></select></label><label><span>עדיפות</span><select aria-label="סינון לפי עדיפות" value={props.priority} onChange={event => props.setPriority(event.target.value)}><option>הכול</option><option>Urgent</option><option>High</option><option>Medium</option><option>Low</option></select></label><label><span>סטטוס</span><select aria-label="סינון לפי סטטוס" value={props.status} onChange={event => props.setStatus(event.target.value)}><option>הכול</option>{statuses.map(value => <option key={value}>{value}</option>)}</select></label><label><span>תחום</span><select aria-label="סינון לפי תחום" value={props.area} onChange={event => props.setArea(event.target.value)}><option>הכול</option>{props.areas.map(value => <option key={value}>{value}</option>)}</select></label><label className="sort-filter"><span>מיון</span><select aria-label="מיון משימות" value={props.sort} onChange={event => props.setSort(event.target.value)}><option>חכם</option><option>תאריך יעד</option><option>עדיפות</option><option>סטטוס</option><option>עודכן לאחרונה</option><option>נוצר לאחרונה</option></select></label></div>; }
function TaskRow({ task, open }: {
    task: Task;
    open: (task: Task) => void;
}) { return <article role="button" aria-label={`פתיחת המשימה ${task.title}`} className="task-row task-hover-wrap" tabIndex={0} onClick={() => open(task)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    open(task);
} }}><span className={`check ${task.status === 'Done' ? 'checked' : ''}`} aria-hidden="true">{task.status === 'Done' ? '✓' : ''}</span><div className="task-main"><div><span className={`priority-dot p-${task.priority.toLowerCase()}`}/><small>{task.id}</small><span className={`status status-${task.status.replaceAll(' ', '-').toLowerCase()}`}>{task.status}</span></div><h3>{task.title}</h3><p><span className="area-dot" style={{ background: colors[task.area] || '#64748b' }}/>{task.area}<span>·</span><span className={task.dueDate < todayKey() && task.status !== 'Done' ? 'late' : ''}>◷ {fmt(task.dueDate)}</span>{task.blocker && <span className="blocked-inline">⊘ חסומה</span>}</p></div><div className="assignee"><AssigneeStack task={task} showNames/></div><TaskPeek task={task}/></article>; }
function List({ tasks, all, open, complete, saveMany }: {
    tasks: Task[];
    all: Task[];
    open: (task: Task) => void;
    complete: (task: Task) => void;
    saveMany: (tasks:Task[],message:string)=>Promise<number>;
}) {
    const ordered = hierarchyOrder(tasks), [selected,setSelected]=useState<string[]>([]); const selectedTasks=ordered.filter(task=>selected.includes(task.id));
    const toggle=(id:string)=>setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);
    const update=async(patch:(task:Task)=>Task,label:string)=>{const candidates=selectedTasks.map(patch).filter(task=>!isLocked(task,all)||task.status==='Backlog');const count=await saveMany(candidates,label);if(count)setSelected([]);};
    return <section className="panel list-panel">{selected.length>0&&<div className="bulk-bar" role="region" aria-label="פעולות מרובות"><strong>נבחרו {selected.length}</strong><select aria-label="שינוי אחראי למשימות שנבחרו" defaultValue="" onChange={event=>{const name=event.target.value as Task['owner'];if(name)void update(task=>({...task,owner:name,assignees:[name,...task.assignees.filter(value=>value!==name)]}),`${selected.length} משימות הוקצו מחדש`);}}><option value="">אחראי…</option><option>Maoz</option><option>Nissan</option></select><select aria-label="שינוי עדיפות למשימות שנבחרו" defaultValue="" onChange={event=>{const value=event.target.value as Task['priority'];if(value)void update(task=>({...task,priority:value}),`עדיפות עודכנה ב־${selected.length} משימות`);}}><option value="">עדיפות…</option>{['Urgent','High','Medium','Low'].map(value=><option key={value}>{value}</option>)}</select><select aria-label="שינוי סטטוס למשימות שנבחרו" defaultValue="" onChange={event=>{const value=event.target.value;if(value)void update(task=>({...task,status:value}),`סטטוס עודכן ב־${selected.length} משימות`);}}><option value="">סטטוס…</option>{statuses.filter(value=>value!=='Blocked').map(value=><option key={value}>{value}</option>)}</select><label>יעד<input type="date" onChange={event=>{const value=event.target.value;if(value)void update(task=>({...task,dueDate:value,startDate:task.startDate>value?value:task.startDate}),`תאריך יעד עודכן ב־${selected.length} משימות`);}}/></label><button onClick={()=>setSelected([])}>ניקוי</button></div>}<div className="list-head"><label className="bulk-check"><input type="checkbox" aria-label="בחירת כל המשימות המוצגות" checked={ordered.length>0&&selected.length===ordered.length} onChange={event=>setSelected(event.target.checked?ordered.map(task=>task.id):[])}/></label><span>משימה</span><span>אחראים</span><span>עדיפות</span><span>תאריך יעד</span><span>סטטוס</span></div>{ordered.length ? ordered.map(task => { const locked = isLocked(task, all), parent = all.find(item => item.id === task.parentTaskId), children = childCount(task, all); return <div className={`list-row task-hover-wrap ${locked ? 'task-locked' : ''} ${parent ? 'child-task' : ''} ${selected.includes(task.id)?'selected':''}`} key={task.id} onClick={() => open(task)}><label className="bulk-check" onClick={event=>event.stopPropagation()}><input type="checkbox" aria-label={`בחירת ${task.title}`} checked={selected.includes(task.id)} onChange={()=>toggle(task.id)}/></label><div>{parent && <span className="hierarchy-branch" aria-hidden="true">↳</span>}<button className={`check ${task.status === 'Done' ? 'checked' : ''}`} disabled={locked} title={locked ? 'יש להשלים קודם את משימות התלות' : task.status === 'Done' ? 'פתיחה מחדש' : 'סימון כהושלמה'} aria-label={task.status === 'Done' ? `פתיחה מחדש של ${task.title}` : `סימון ${task.title} כהושלמה`} onClick={event => { event.stopPropagation(); complete(task); }}>{locked ? '⌁' : task.status === 'Done' ? '✓' : ''}</button><button className="list-task-button" onClick={event => { event.stopPropagation(); open(task); }}><small>{parent ? `תחת ${parent.title}` : `${task.id} · ${task.area}`}</small><strong>{task.title}{children > 0 && <em className="super-task-badge">משימת־על · {children}</em>}</strong></button></div><span className="owner-cell"><AssigneeStack task={task} showNames/></span><span className={`priority-pill ${task.priority.toLowerCase()}`}>{task.priority}</span><span className={task.dueDate < todayKey() && task.status !== 'Done' ? 'late' : ''}>{fmt(task.dueDate)}<small className="estimate-inline">{formatEstimate(task.estimateMinutes)}</small></span>{locked ? <span className="status status-locked">Locked · {pendingDependencies(task, all).length}</span> : <span className={`status status-${task.status.replaceAll(' ', '-').toLowerCase()}`}>{task.status}</span>}<TaskPeek task={task}/></div>; }) : <div className="empty-state"><b>לא נמצאו משימות</b><span>נסו לשנות את הסינון או החיפוש</span></div>}</section>; }
function Board({ tasks, all, open, move }: {
    tasks: Task[];
    all: Task[];
    open: (task: Task) => void;
    move: (task: Task, status: string) => void;
}) {
    const [showEmpty, setShowEmpty] = useState(false);
    const effectiveStatus = (task: Task) => isLocked(task, all) ? 'Backlog' : task.status;
    const visibleStatuses = showEmpty ? statuses : statuses.filter(columnStatus => tasks.some(task => effectiveStatus(task) === columnStatus));
    return <><div className="board-toolbar"><span>{visibleStatuses.length} שלבים מוצגים</span><button type="button" className="secondary" aria-pressed={showEmpty} onClick={() => setShowEmpty(value => !value)}>{showEmpty ? 'הסתרת שלבים ריקים' : 'הצגת כל השלבים'}</button></div><div className="board">{visibleStatuses.map(columnStatus => {
            const columnTasks = tasks.filter(task => effectiveStatus(task) === columnStatus);
            return <section className="board-column" key={columnStatus} onDragOver={event => event.preventDefault()} onDrop={event => { const task = tasks.find(item => item.id === event.dataTransfer.getData('text/plain')); if (task && effectiveStatus(task) !== columnStatus)
                move(task, columnStatus); }}>
   <header><span className={`column-dot status-${columnStatus.replaceAll(' ', '-').toLowerCase()}`}/><strong>{columnStatus}</strong><b>{columnTasks.length}</b></header>
   <div>{columnTasks.map(task => <KanbanTaskCard key={task.id} task={task} all={all} open={open} move={move}/>)}</div>
  </section>;
        })}</div></>;
}
function KanbanTaskCard({ task, all, open, move }: {
    task: Task;
    all: Task[];
    open: (task: Task) => void;
    move: (task: Task, status: string) => void;
}) {
    const locked = isLocked(task, all);
    const keyboard = (event: ReactKeyboardEvent<HTMLElement>) => { if (event.target !== event.currentTarget)
        return; if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open(task);
    } };
    const drag = (event: ReactDragEvent<HTMLElement>) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.id); };
    const parent = all.find(item => item.id === task.parentTaskId), children = childCount(task, all);
    return <article aria-label={`משימה ${task.title}, ${locked ? 'נעולה' : task.status}`} className={`kanban-card task-hover-wrap ${locked ? 'task-locked' : ''}`} tabIndex={0} draggable={!locked} onDragStart={drag} onClick={() => open(task)} onKeyDown={keyboard}><div><span className={`priority-dot p-${task.priority.toLowerCase()}`}/><small>{task.id}</small></div><h3>{task.title}</h3>{parent && <p className="parent-note">↳ {parent.title}</p>}{children > 0 && <p className="super-note">משימת־על · {children} משימות משנה</p>}{locked && <p className="dependency-note">⌁ ממתינה ל-{pendingDependencies(task, all).length} משימות</p>}{task.blocker && <p className="blocker-note">⊘ {task.blocker}</p>}<footer><span><i style={{ background: colors[task.area] || '#64748b' }}/>{task.area}</span><AssigneeStack task={task}/></footer><div className="card-meta"><span className={task.dueDate < todayKey() && task.status !== 'Done' ? 'late' : ''}>◷ {fmt(task.dueDate)}</span><span>{task.comments.length ? `◌ ${task.comments.length}` : ''}</span></div><select className="card-status" aria-label={`שינוי סטטוס של ${task.title}`} value={locked ? 'Backlog' : task.status} disabled={locked} onClick={event => event.stopPropagation()} onChange={event => { event.stopPropagation(); move(task, event.target.value); }}>{statuses.map(value => <option key={value}>{value}</option>)}</select><TaskPeek task={task}/></article>;
}
type ArchivedTask = {
    id: string;
    title: string;
    area: string;
    version: number;
    archivedAt: string;
};
function SettingsModal({ person, setPerson, compact, setCompact, dataChanged, close }: {
    person: 'Maoz' | 'Nissan';
    setPerson: (value: 'Maoz' | 'Nissan') => void;
    compact: boolean;
    setCompact: (value: boolean) => void;
    dataChanged: () => void;
    close: () => void;
}) {
    const [archived, setArchived] = useState<ArchivedTask[]>([]), [archiveError, setArchiveError] = useState(''), [restoring, setRestoring] = useState('');
    const loadArchive = useCallback(async () => { try {
        const response = await fetch('/api/archive', { cache: 'no-store' });
        const data = await response.json() as unknown;
        if (!response.ok)
            throw new Error((data as {
                error?: string;
            }).error || 'לא ניתן לטעון את הארכיון.');
        setArchived(Array.isArray(data) ? data as ArchivedTask[] : []);
        setArchiveError('');
    }
    catch (error) {
        setArchiveError(error instanceof Error ? error.message : 'לא ניתן לטעון את הארכיון.');
    } }, []);
    useEffect(() => { const initial = window.setTimeout(() => void loadArchive(), 0); const previous = document.activeElement as HTMLElement | null; const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape')
        close(); }; window.addEventListener('keydown', onKeyDown); return () => { window.clearTimeout(initial); window.removeEventListener('keydown', onKeyDown); previous?.focus(); }; }, [close, loadArchive]);
    const restore = async (task: ArchivedTask) => { setRestoring(task.id); setArchiveError(''); try {
        const response = await fetch('/api/archive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: task.id, version: task.version }) });
        const data = await response.json() as {
            error?: string;
        };
        if (!response.ok)
            throw new Error(data.error || 'השחזור נכשל.');
        await loadArchive();
        dataChanged();
    }
    catch (error) {
        setArchiveError(error instanceof Error ? error.message : 'השחזור נכשל.');
    }
    finally {
        setRestoring('');
    } };
    return <div className="modal-wrap" onMouseDown={event => { if (event.target === event.currentTarget)
        close(); }}><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><header><div><span>MyVet Workspace</span><h2 id="settings-title">הגדרות</h2></div><button type="button" aria-label="סגירת הגדרות" onClick={close}>×</button></header><div className="settings-body"><fieldset><legend>תצוגת עבודה ברירת מחדל</legend><p>הבחירה קובעת את תצוגת ״המשימות שלי״ ואת האחראי המוצע למשימה חדשה. היא אינה משנה הרשאות גישה.</p><div className="settings-options">{(['Maoz', 'Nissan'] as const).map(name => <button key={name} className={person === name ? 'selected' : ''} onClick={() => setPerson(name)}><span className={`avatar avatar-${name.toLowerCase()}`}>{name[0]}</span><span><strong>{name}</strong><small>{name === 'Maoz' ? 'מעוז' : 'ניסן'}</small></span>{person === name && <b>✓</b>}</button>)}</div></fieldset><fieldset><legend>צפיפות תצוגה</legend><p>אפשר לבחור תצוגה מרווחת או קומפקטית. ההעדפה נשמרת במכשיר הזה.</p><div className="density-switch"><button className={!compact ? 'selected' : ''} onClick={() => setCompact(false)}>מרווחת</button><button className={compact ? 'selected' : ''} onClick={() => setCompact(true)}>קומפקטית</button></div></fieldset><fieldset><legend>גיבוי ושחזור</legend><p>הורדת גיבוי כוללת את המשימות ואת היסטוריית הפעילות. משימות בארכיון אינן מוצגות בלוחות, ואפשר לשחזר אותן מכאן.</p><a className="secondary settings-export" href="/api/export" download>הורדת גיבוי מלא</a>{archiveError && <div className="form-error" role="alert">{archiveError}</div>}<div className="archive-list">{archived.length ? archived.map(task => <div key={task.id}><span><strong>{task.title}</strong><small>{task.id} · {task.area}</small></span><button className="secondary" disabled={restoring === task.id} onClick={() => void restore(task)}>{restoring === task.id ? 'משחזרים…' : 'שחזור'}</button></div>) : <p className="archive-empty">אין משימות בארכיון</p>}</div></fieldset></div><footer><button className="new-task" onClick={close}>שמירה וסגירה</button></footer></section></div>;
}
const calendarDate = (key: string) => key.replaceAll('-', '');
const nextCalendarDay = (key: string) => { const date = new Date(`${key}T12:00:00`); date.setDate(date.getDate() + 1); return dateKey(date); };
function googleCalendarUrl(task: Task) { const params = new URLSearchParams({ action: 'TEMPLATE', text: task.title, dates: `${calendarDate(task.startDate || task.dueDate)}/${calendarDate(nextCalendarDay(task.dueDate))}` }); return `https://calendar.google.com/calendar/render?${params.toString()}`; }
function downloadCalendarEvent(task: Task) { const escape = (value: string) => value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(',', '\\,').replaceAll(';', '\\;'); const alarm = task.reminderMinutes ? `BEGIN:VALARM\r\nTRIGGER:-PT${task.reminderMinutes}M\r\nACTION:DISPLAY\r\nDESCRIPTION:${escape(task.title)}\r\nEND:VALARM\r\n` : ''; const content = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//MyVet Workspace//HE\r\nBEGIN:VEVENT\r\nUID:${task.id}@myvet-workspace\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}\r\nDTSTART;VALUE=DATE:${calendarDate(task.startDate || task.dueDate)}\r\nDTEND;VALUE=DATE:${calendarDate(nextCalendarDay(task.dueDate))}\r\nSUMMARY:${escape(task.title)}\r\n${alarm}END:VEVENT\r\nEND:VCALENDAR\r\n`; const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' })); link.download = `${task.id || 'myvet-task'}.ics`; link.click(); URL.revokeObjectURL(link.href); }
function TaskModal({ task, isNew, all, projects, person, areas, saving, error, close, save, archive, saveTemplate }: {
    task: Task;
    isNew: boolean;
    all: Task[];
    projects: Project[];
    person: Task['owner'];
    areas: string[];
    saving: boolean;
    error: string;
    close: () => void;
    save: (task: Task, isNew: boolean) => Promise<boolean>;
    archive: (task: Task) => Promise<boolean>;
    saveTemplate: (task: Task) => Promise<void>;
}) {
    const [draft, setDraft] = useState(task), [comment, setComment] = useState('');
    const modalRef = useRef<HTMLFormElement>(null);
    const field = <K extends keyof Task>(key: K, value: Task[K]) => setDraft(current => ({ ...current, [key]: value }));
    const pending = pendingDependencies(draft, all);
    const progress = childProgress(draft, all);
    const isDescendant = (candidateId: string) => { if (!draft.id)
        return false; let current = all.find(item => item.id === candidateId); const seen = new Set<string>(); while (current?.parentTaskId && !seen.has(current.id)) {
        if (current.parentTaskId === draft.id)
            return true;
        seen.add(current.id);
        current = all.find(item => item.id === current?.parentTaskId);
    } return false; };
    const parentOptions = all.filter(item => item.id !== draft.id && !isDescendant(item.id));
    useEffect(() => { const previous = document.activeElement as HTMLElement | null; const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving)
        close(); if (event.key === 'Tab') {
        const focusable = [...(modalRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])') || [])];
        if (!focusable.length)
            return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        }
        else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    } }; window.addEventListener('keydown', onKeyDown); return () => { window.removeEventListener('keydown', onKeyDown); previous?.focus(); }; }, [close, saving]);
    const submit = async (event: FormEvent) => { event.preventDefault(); if (draft.title.trim() && draft.assignees.length)
        await save({ ...draft, title: draft.title.trim(), description: draft.description.trim(), owner: draft.assignees[0], status: pending.length ? 'Backlog' : draft.status, startDate: draft.milestone ? draft.dueDate : draft.startDate }, isNew); };
    const addComment = () => { const text = comment.trim(); if (!text)
        return; field('comments', [...draft.comments, { author: person, text, time: new Date().toISOString() }]); setComment(''); };
    const toggleDependency = (id: string) => field('dependencies', draft.dependencies.includes(id) ? draft.dependencies.filter(value => value !== id) : [...draft.dependencies, id]);
    const toggleAssignee = (name: Task['owner']) => { if (draft.assignees.includes(name)) {
        if (draft.assignees.length > 1)
            field('assignees', draft.assignees.filter(value => value !== name));
    }
    else
        field('assignees', [...draft.assignees, name]); };
    return <div className="modal-wrap" onMouseDown={event => {
        if(event.target===event.currentTarget&&!saving)
            close();
    }}><form ref={modalRef} className="task-modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title" onSubmit={submit} aria-busy={saving}><header><div><span>{isNew? 'משימה חדשה':draft.id}</span><h2 id="task-modal-title">{isNew? 'יצירת משימה':draft.title}</h2></div><button type="button" aria-label="סגירת פרטי משימה" disabled={saving} onClick={close}>×</button></header><div className="modal-body"><div className="modal-main">{error&&<div className="form-error" role="alert">{error}</div>}{pending.length>0&&<div className="dependency-alert" role="status"><strong>⌁ המשימה נעולה</strong><span>אפשר להתחיל אותה רק לאחר השלמת: {pending.map(id => all.find(item => item.id===id)?.title||id).join(', ')}</span></div>}{progress.total>0&&<div className="subtask-rollup"><span><strong>התקדמות משימות משנה</strong><small>{progress.done} מתוך {progress.total} הושלמו</small></span><div className="progress"><i style={{ width: `${Math.round(progress.done/progress.total*100)}%` }} /></div></div>}<label>כותרת<input autoFocus required maxLength={180} value={draft.title} onChange={event => field('title',event.target.value)} placeholder="מה צריך לעשות?" /></label><label>תיאור<textarea maxLength={5000} value={draft.description} onChange={event => field('description',event.target.value)} placeholder="הוסיפו הקשר, קריטריונים וקישורים..." /></label><fieldset className="assignee-picker"><legend>אחראים</legend><p>המשתמש הראשון ברשימה הוא בעל האחריות הראשי. אפשר לצרף את המשתמש השני כשותף.</p><div>{(['Maoz','Nissan'] as const).map(name => <label key={name} className={draft.assignees.includes(name)? 'selected':''}><input type="checkbox" checked={draft.assignees.includes(name)} disabled={draft.assignees.length===1&&draft.assignees.includes(name)} onChange={() => toggleAssignee(name)} /><span className={`avatar avatar-${name.toLowerCase()}`}>{name[0]}</span><span><strong>{name}</strong><small>{draft.assignees[0]===name? 'אחראי ראשי':name==='Maoz'? 'מעוז':'ניסן'}</small></span><b>{draft.assignees.includes(name)? '✓':''}</b></label>)}</div></fieldset><div className="form-grid"><label>עדיפות<select value={draft.priority} onChange={event => field('priority',event.target.value as Task['priority'])}>{['Urgent','High','Medium','Low'].map(value => <option key={value}>{value}</option>)}</select></label><label>סטטוס<select value={pending.length? 'Backlog':draft.status} disabled={pending.length>0} onChange={event => field('status',event.target.value)}>{statuses.map(value => <option key={value}>{value}</option>)}</select><small className="field-help">{pending.length? 'ייפתח לבחירה לאחר השלמת התלויות':''}</small></label><label>תחום<select value={draft.area} onChange={event => field('area',event.target.value)}>{areas.map(value => <option key={value}>{value}</option>)}</select></label><label>פרויקט<select value={draft.projectId} onChange={event => field('projectId',event.target.value)}><option value="">ללא פרויקט</option>{projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label><label>משימת־על<select value={draft.parentTaskId} onChange={event => field('parentTaskId',event.target.value)}><option value="">ללא משימת־על</option>{parentOptions.map(item => <option key={item.id} value={item.id}>{item.id} — {item.title}</option>)}</select><small className="field-help">המשימה תוצג כמשימת משנה תחת הבחירה.</small></label><label>תאריך התחלה<input required disabled={draft.milestone} type="date" value={draft.milestone? draft.dueDate:draft.startDate} max={draft.dueDate} onChange={event => field('startDate',event.target.value)} /></label><label>תאריך יעד<input required type="date" min={draft.milestone? undefined:draft.startDate} value={draft.dueDate} onChange={event => field('dueDate',event.target.value)} /></label><label>הערכת זמן<select value={draft.estimateMinutes} onChange={event => field('estimateMinutes',Number(event.target.value))}><option value="15">15 דקות</option><option value="30">30 דקות</option><option value="60">שעה</option><option value="120">שעתיים</option><option value="240">חצי יום</option><option value="480">יום עבודה</option><option value="960">יומיים</option><option value="2400">שבוע עבודה</option></select><small className="field-help">משמשת לתכנון העומס והיום.</small></label><label>תזכורת<select value={draft.reminderMinutes??''} onChange={event => field('reminderMinutes',event.target.value? Number(event.target.value):null)}><option value="">ללא תזכורת</option><option value="10">10 דקות לפני</option><option value="30">30 דקות לפני</option><option value="60">שעה לפני</option><option value="1440">יום לפני</option></select></label><label>חזרה<select value={draft.recurrenceRule} onChange={event => field('recurrenceRule',event.target.value as Task['recurrenceRule'])}><option value="">ללא חזרה</option><option value="weekly">כל שבוע</option><option value="monthly">כל חודש</option></select></label>{draft.recurrenceRule&&<label>חזרה עד<input type="date" min={draft.dueDate} value={draft.recurrenceEnd} onChange={event => field('recurrenceEnd',event.target.value)} /></label>}<label className="milestone-toggle"><input type="checkbox" checked={draft.milestone} onChange={event => field('milestone',event.target.checked)} /><span><strong>אבן דרך</strong><small>תוצג כנקודה מרכזית בגאנט</small></span></label></div><fieldset className="dependency-picker"><legend>תלויות במשימות</legend><p>המשימה תישאר ב־Backlog עד שכל המשימות המסומנות יושלמו.</p><div>{all.filter(item => item.id!==draft.id).length? all.filter(item => item.id!==draft.id).map(item => <label key={item.id} className={draft.dependencies.includes(item.id)? 'selected':''}><input type="checkbox" checked={draft.dependencies.includes(item.id)} onChange={() => toggleDependency(item.id)} /><span><strong>{item.title}</strong><small>{item.id} · {item.status}</small></span><b>{item.status==='Done'? '✓':'⌁'}</b></label>):<span className="dependency-empty">אין עדיין משימות אחרות שאפשר לבחור כתלות.</span>}</div></fieldset><label>תגיות<input value={draft.tags.join(', ')} onChange={event => field('tags',event.target.value.split(',').map(value => value.trim()).filter(Boolean))} placeholder="security, clinic, api" /></label>{draft.status==='Blocked'&&<label className="blocker-field">מה חוסם את המשימה?<textarea required maxLength={1000} value={draft.blocker} onChange={event => field('blocker',event.target.value)} placeholder="כתבו מה נדרש כדי להתקדם" /></label>}{!isNew&&<section className="calendar-actions"><div><strong>יומן ותזכורות</strong><small>רק כותרת המשימה וטווח התאריכים מועברים ליומן. קובץ היומן כולל את התזכורת שנבחרה.</small></div><div><a className="calendar-google" target="_blank" rel="noreferrer" href={googleCalendarUrl(draft)}>הוספה ל־Google Calendar</a><button type="button" className="secondary" onClick={() => downloadCalendarEvent(draft)}>הורדה עם תזכורת</button></div></section>}</div><aside className="comments"><h3>תגובות</h3>{draft.comments.length? draft.comments.map((item,index) => <div className="comment" key={`${item.time}-${index}`}><span className={`avatar avatar-${item.author.toLowerCase()}`}>{item.author[0]}</span><p><strong>{item.author}</strong><small>{commentTime(item.time)}</small>{item.text}</p></div>):<div className="comments-empty">עדיין אין תגובות</div>}<div className="comment-box"><div className="mention-shortcuts"><button type="button" onClick={() => setComment(value => `${value}${value&&!value.endsWith(' ')? ' ':''}@Maoz `)}>@Maoz</button><button type="button" onClick={() => setComment(value => `${value}${value&&!value.endsWith(' ')? ' ':''}@Nissan `)}>@Nissan</button></div><textarea maxLength={2000} value={comment} onChange={event => setComment(event.target.value)} placeholder="כתיבת תגובה..." /><button type="button" disabled={!comment.trim()||saving} onClick={addComment}>הוספה</button><small>מחבר התגובה נקבע אוטומטית לפי החשבון המחובר.</small></div></aside></div><footer><button type="button" className="secondary" disabled={saving||!draft.title.trim()} onClick={() => void saveTemplate(draft)}>שמירה כתבנית</button>{!isNew&&<button type="button" className="danger-button" disabled={saving} onClick={() => void archive(draft)}>העברה לארכיון</button>}<span className="footer-spacer" /><button type="button" className="secondary" disabled={saving} onClick={close}>ביטול</button><button className="new-task" disabled={saving||!draft.assignees.length}>{saving? 'שומרים…':isNew? 'יצירת משימה':'שמירת שינויים'}</button></footer></form></div>;
}
