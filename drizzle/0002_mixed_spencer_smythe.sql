CREATE TABLE `asaas_inbox` (
	`id` text PRIMARY KEY NOT NULL,
	`digest` text NOT NULL,
	`payload_encrypted` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`received_at` integer NOT NULL,
	`processed_at` integer
);
--> statement-breakpoint
ALTER TABLE `real_operations` ADD `checkout_url` text;--> statement-breakpoint
ALTER TABLE `real_operations` ADD `provider_environment` text DEFAULT 'sandbox' NOT NULL;--> statement-breakpoint
ALTER TABLE `real_operations` ADD `authorized_transfer_id` text;--> statement-breakpoint
ALTER TABLE `real_operations` ADD `review_reference` text;