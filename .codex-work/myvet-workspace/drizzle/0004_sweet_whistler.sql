ALTER TABLE `tasks` ADD `assignees` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `parent_task_id` text DEFAULT '' NOT NULL;