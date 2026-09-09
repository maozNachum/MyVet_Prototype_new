CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`owner` text NOT NULL,
	`priority` text NOT NULL,
	`status` text NOT NULL,
	`due_date` text NOT NULL,
	`area` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`dependencies` text DEFAULT '[]' NOT NULL,
	`blocker` text DEFAULT '' NOT NULL,
	`recurring` integer DEFAULT false NOT NULL,
	`comments` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
