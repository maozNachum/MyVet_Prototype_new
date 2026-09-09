CREATE TABLE `task_events` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`actor_name` text NOT NULL,
	`event_type` text NOT NULL,
	`summary` text NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_task_events_task_created` ON `task_events` (`task_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_task_events_created_at` ON `task_events` (`created_at`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `archived_at` text;--> statement-breakpoint
CREATE INDEX `idx_tasks_status_due_date` ON `tasks` (`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `idx_tasks_owner_status` ON `tasks` (`owner`,`status`);--> statement-breakpoint
CREATE INDEX `idx_tasks_updated_at` ON `tasks` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_tasks_archived_at` ON `tasks` (`archived_at`);