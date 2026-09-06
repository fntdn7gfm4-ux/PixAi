import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const settings = sqliteTable('settings', { id: text('id').primaryKey(), value: text('value').notNull(), revision: integer('revision').notNull().default(1), updatedAt: integer('updated_at').notNull() });
export const sessions = sqliteTable('sessions', { id: text('id').primaryKey(), expires: integer('expires').notNull() });
export const quotes = sqliteTable('quotes', { id: text('id').primaryKey(), session: text('session').notNull(), value: text('value').notNull(), expires: integer('expires').notNull(), revision: integer('revision').notNull() });
export const transactions = sqliteTable('operations', {
  id: text('id').primaryKey(), session: text('session').notNull(), quoteId: text('quote_id').notNull().unique(),
  idempotencyKey: text('idempotency_key').notNull().unique(), requestHash: text('request_hash').notNull(),
  environment: text('environment').notNull(), status: text('status').notNull(), value: text('value').notNull(), createdAt: integer('created_at').notNull()
}, t => [index('idx_operations_session_created').on(t.session, t.createdAt), index('idx_operations_status_created').on(t.status, t.createdAt)]);
export const challenges = sqliteTable('challenges', { id: text('id').primaryKey(), session: text('session').notNull(), transactionId: text('transaction_id').notNull(), digest: text('digest').notNull(), expires: integer('expires').notNull(), attempts: integer('attempts').notNull().default(0), consumed: integer('consumed').notNull().default(0) });
export const audit = sqliteTable('audit', { id: text('id').primaryKey(), action: text('action').notNull(), subject: text('subject').notNull(), detail: text('detail').notNull(), createdAt: integer('created_at').notNull() });
export const rateLimits = sqliteTable('rate_limits', { id: text('id').primaryKey(), count: integer('count').notNull(), expires: integer('expires').notNull() });
export const webhookEvents = sqliteTable('webhook_events', { id: text('id').primaryKey(), digest: text('digest').notNull(), receivedAt: integer('received_at').notNull() });
