CREATE TABLE `real_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`session` text NOT NULL,
	`quote_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`status` text NOT NULL,
	`cpf_encrypted` text NOT NULL,
	`pix_key_type` text NOT NULL,
	`pix_key_encrypted` text NOT NULL,
	`asaas_customer_id` text,
	`asaas_checkout_id` text,
	`asaas_payment_id` text,
	`asaas_transfer_id` text,
	`value` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `real_operations_quote_id_unique` ON `real_operations` (`quote_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `real_operations_idempotency_key_unique` ON `real_operations` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_real_operations_session_created` ON `real_operations` (`session`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_real_operations_checkout` ON `real_operations` (`asaas_checkout_id`);--> statement-breakpoint
CREATE INDEX `idx_real_operations_payment` ON `real_operations` (`asaas_payment_id`);--> statement-breakpoint
CREATE TABLE `withdrawal_authorizations` (
	`id` text PRIMARY KEY NOT NULL,
	`operation_id` text,
	`decision` text NOT NULL,
	`reason` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
