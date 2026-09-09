ALTER TABLE `tasks` ADD `start_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `milestone` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `reminder_minutes` integer;