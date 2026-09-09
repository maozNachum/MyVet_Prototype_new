CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_name` text NOT NULL,
	`task_id` text NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`read_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_recipient_read` ON `notifications` (`recipient_name`,`read_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_notifications_task` ON `notifications` (`task_id`);