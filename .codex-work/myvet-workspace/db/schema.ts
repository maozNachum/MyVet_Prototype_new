import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const tasks = sqliteTable('tasks', {
  id:text('id').primaryKey(), title:text('title').notNull(), description:text('description').notNull().default(''), owner:text('owner').notNull(), assignees:text('assignees').notNull().default('[]'), priority:text('priority').notNull(), status:text('status').notNull(), startDate:text('start_date').notNull().default(''), dueDate:text('due_date').notNull(), estimateMinutes:integer('estimate_minutes').notNull().default(60), area:text('area').notNull(), projectId:text('project_id').notNull().default(''), tags:text('tags').notNull().default('[]'), dependencies:text('dependencies').notNull().default('[]'), parentTaskId:text('parent_task_id').notNull().default(''), blocker:text('blocker').notNull().default(''), milestone:integer('milestone',{mode:'boolean'}).notNull().default(false), reminderMinutes:integer('reminder_minutes'), recurring:integer('recurring',{mode:'boolean'}).notNull().default(false), recurrenceRule:text('recurrence_rule').notNull().default(''), recurrenceEnd:text('recurrence_end').notNull().default(''), recurrenceSourceId:text('recurrence_source_id'), recurrenceKey:text('recurrence_key'), comments:text('comments').notNull().default('[]'), version:integer('version').notNull().default(1), archivedAt:text('archived_at'), createdAt:text('created_at').notNull(), updatedAt:text('updated_at').notNull()
}, (table) => [
  index('idx_tasks_status_due_date').on(table.status, table.dueDate),
  index('idx_tasks_owner_status').on(table.owner, table.status),
  index('idx_tasks_updated_at').on(table.updatedAt),
  index('idx_tasks_archived_at').on(table.archivedAt),
  index('idx_tasks_project_id').on(table.projectId),
  uniqueIndex('idx_tasks_recurrence_key').on(table.recurrenceKey),
]);

export const workspaceMeta = sqliteTable('workspace_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const taskEvents = sqliteTable('task_events', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  actorEmail: text('actor_email').notNull(),
  actorName: text('actor_name').notNull(),
  eventType: text('event_type').notNull(),
  summary: text('summary').notNull(),
  details: text('details').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_task_events_task_created').on(table.taskId, table.createdAt),
  index('idx_task_events_created_at').on(table.createdAt),
]);

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  recipientName: text('recipient_name').notNull(),
  taskId: text('task_id').notNull(),
  type: text('type').notNull(),
  message: text('message').notNull(),
  readAt: text('read_at'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_notifications_recipient_read').on(table.recipientName, table.readAt, table.createdAt),
  index('idx_notifications_task').on(table.taskId),
]);

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6559d4'),
  owner: text('owner').notNull(),
  status: text('status').notNull().default('Planned'),
  health: text('health').notNull().default('On track'),
  startDate: text('start_date').notNull(),
  dueDate: text('due_date').notNull(),
  description: text('description').notNull().default(''),
  version: integer('version').notNull().default(1),
  archivedAt: text('archived_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_projects_status_due').on(table.status, table.dueDate),
]);

export const taskTemplates = sqliteTable('task_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  taskData: text('task_data').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const savedViews = sqliteTable('saved_views', {
  id: text('id').primaryKey(),
  ownerName: text('owner_name').notNull(),
  name: text('name').notNull(),
  filters: text('filters').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_saved_views_owner_updated').on(table.ownerName, table.updatedAt),
  uniqueIndex('idx_saved_views_owner_name').on(table.ownerName, table.name),
]);
