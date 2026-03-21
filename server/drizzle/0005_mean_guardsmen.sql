ALTER TABLE `projects` ADD `ticket_prefix` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `next_ticket_number` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_user_ticket_prefix_idx` ON `projects` (`user_id`,`ticket_prefix`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `ticket_number` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_project_ticket_number_idx` ON `tasks` (`project_id`,`ticket_number`);