CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`token_count` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_session_id_idx` ON `messages` (`session_id`);--> statement-breakpoint
CREATE INDEX `messages_created_at_idx` ON `messages` (`created_at`);--> statement-breakpoint
CREATE INDEX `messages_session_id_created_at_idx` ON `messages` (`session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `preferences` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`provider` text DEFAULT 'claude' NOT NULL,
	`model` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_path_unique` ON `projects` (`path`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`provider` text DEFAULT 'claude' NOT NULL,
	`model` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_project_id_idx` ON `sessions` (`project_id`);--> statement-breakpoint
CREATE INDEX `sessions_status_idx` ON `sessions` (`status`);--> statement-breakpoint
CREATE INDEX `sessions_created_at_idx` ON `sessions` (`created_at`);--> statement-breakpoint
CREATE INDEX `sessions_project_id_created_at_idx` ON `sessions` (`project_id`,`created_at`);