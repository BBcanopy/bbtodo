DROP INDEX `tasks_project_lane_position_idx`;--> statement-breakpoint
ALTER TABLE `tasks` ADD `parent_task_id` text REFERENCES tasks(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `tasks_project_lane_parent_position_idx` ON `tasks` (`project_id`,`lane_id`,`parent_task_id`,`position`);
