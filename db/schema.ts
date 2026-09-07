import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(),
  value: text("value").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
});
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  expires: integer("expires").notNull(),
});
export const quotes = sqliteTable("quotes", {
  id: text("id").primaryKey(),
  session: text("session").notNull(),
  value: text("value").notNull(),
  expires: integer("expires").notNull(),
  revision: integer("revision").notNull(),
});
export const transactions = sqliteTable(
  "operations",
  {
    id: text("id").primaryKey(),
    session: text("session").notNull(),
    quoteId: text("quote_id").notNull().unique(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    requestHash: text("request_hash").notNull(),
    environment: text("environment").notNull(),
    status: text("status").notNull(),
    value: text("value").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_operations_session_created").on(t.session, t.createdAt),
    index("idx_operations_status_created").on(t.status, t.createdAt),
  ],
);
export const challenges = sqliteTable("challenges", {
  id: text("id").primaryKey(),
  session: text("session").notNull(),
  transactionId: text("transaction_id").notNull(),
  digest: text("digest").notNull(),
  expires: integer("expires").notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumed: integer("consumed").notNull().default(0),
});
export const audit = sqliteTable("audit", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  subject: text("subject").notNull(),
  detail: text("detail").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const rateLimits = sqliteTable("rate_limits", {
  id: text("id").primaryKey(),
  count: integer("count").notNull(),
  expires: integer("expires").notNull(),
});
export const webhookEvents = sqliteTable("webhook_events", {
  id: text("id").primaryKey(),
  digest: text("digest").notNull(),
  receivedAt: integer("received_at").notNull(),
});
export const realOperations = sqliteTable(
  "real_operations",
  {
    id: text("id").primaryKey(),
    session: text("session").notNull(),
    quoteId: text("quote_id").notNull().unique(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    requestHash: text("request_hash").notNull(),
    status: text("status").notNull(),
    cpfEncrypted: text("cpf_encrypted").notNull(),
    pixKeyType: text("pix_key_type").notNull(),
    pixKeyEncrypted: text("pix_key_encrypted").notNull(),
    asaasCustomerId: text("asaas_customer_id"),
    asaasCheckoutId: text("asaas_checkout_id"),
    asaasPaymentId: text("asaas_payment_id"),
    asaasTransferId: text("asaas_transfer_id"),
    checkoutUrl: text("checkout_url"),
    providerEnvironment: text("provider_environment").notNull().default("sandbox"),
    authorizedTransferId: text("authorized_transfer_id"),
    reviewReference: text("review_reference"),
    fundingExposure: integer("funding_exposure").notNull().default(0),
    value: text("value").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_real_operations_session_created").on(t.session, t.createdAt),
    index("idx_real_operations_checkout").on(t.asaasCheckoutId),
    index("idx_real_operations_payment").on(t.asaasPaymentId),
  ],
);
export const withdrawalAuthorizations = sqliteTable(
  "withdrawal_authorizations",
  {
    id: text("id").primaryKey(),
    operationId: text("operation_id"),
    decision: text("decision").notNull(),
    reason: text("reason").notNull(),
    payload: text("payload").notNull(),
    createdAt: integer("created_at").notNull(),
  },
);
export const asaasInbox = sqliteTable("asaas_inbox", {
  id: text("id").primaryKey(),
  digest: text("digest").notNull(),
  payloadEncrypted: text("payload_encrypted").notNull(),
  status: text("status").notNull().default("PENDING"),
  receivedAt: integer("received_at").notNull(),
  processedAt: integer("processed_at"),
});
export const launchDraft = sqliteTable('launch_draft', {
  id:text('id').primaryKey(),value:text('value').notNull(),revision:integer('revision').notNull(),updatedAt:integer('updated_at').notNull(),
});
