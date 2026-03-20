DROP INDEX `lanes_project_system_key_idx`;--> statement-breakpoint
ALTER TABLE `lanes` DROP COLUMN `system_key`;--> statement-breakpoint
DROP INDEX `tasks_project_status_updated_at_idx`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `status`;