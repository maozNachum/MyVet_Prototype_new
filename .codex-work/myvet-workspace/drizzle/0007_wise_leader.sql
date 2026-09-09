CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#6559d4' NOT NULL,
	`owner` text NOT NULL,
	`status` text DEFAULT 'Planned' NOT NULL,
	`health` text DEFAULT 'On track' NOT NULL,
	`start_date` text NOT NULL,
	`due_date` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_projects_status_due` ON `projects` (`status`,`due_date`);--> statement-breakpoint
CREATE TABLE `task_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`task_data` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `project_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence_rule` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence_end` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence_source_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence_key` text;--> statement-breakpoint
CREATE INDEX `idx_tasks_project_id` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tasks_recurrence_key` ON `tasks` (`recurrence_key`);