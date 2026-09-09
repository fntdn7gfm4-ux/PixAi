CREATE TABLE `infinite_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`handle` text NOT NULL,
	`status` text NOT NULL,
	`quote` text NOT NULL,
	`recipient_encrypted` text NOT NULL,
	`access_digest` text NOT NULL,
	`checkout_url` text,
	`transaction_nsu` text,
	`invoice_slug` text,
	`payment` text,
	`operator` text,
	`settlement_reference` text,
	`transfer_reference` text,
	`received_at` integer,
	`sent_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `infinite_operations_idempotency_key_unique` ON `infinite_operations` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `infinite_operations_transaction_nsu_unique` ON `infinite_operations` (`transaction_nsu`);--> statement-breakpoint
CREATE INDEX `idx_infinite_operations_status_created` ON `infinite_operations` (`status`,`created_at`);