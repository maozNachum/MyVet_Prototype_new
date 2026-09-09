CREATE TABLE `saved_views` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_name` text NOT NULL,
	`name` text NOT NULL,
	`filters` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_saved_views_owner_updated` ON `saved_views` (`owner_name`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_saved_views_owner_name` ON `saved_views` (`owner_name`,`name`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `estimate_minutes` integer DEFAULT 60 NOT NULL;