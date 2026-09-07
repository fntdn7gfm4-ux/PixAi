// Configuration readiness is not proof of regulatory or commercial approval.
// References must identify actual reviewed evidence, never fabricated values.
export function launchReadiness(env) {
  const checks = {
    provider: ["sandbox", "production"].includes(env.ASAAS_ENV),
    apiKey: !!env.ASAAS_API_KEY,
    webhookToken: (env.ASAAS_WEBHOOK_TOKEN || "").length >= 32,
    withdrawalToken: (env.ASAAS_WITHDRAWAL_TOKEN || "").length >= 32,
    encryption: /^[A-Za-z0-9+/]{43}=$/.test(env.PII_ENCRYPTION_KEY || ""),
    origin: /^https:\/\/[^/]+$/.test(env.PUBLIC_BASE_URL || ""),
    enabled: env.PAYMENTS_ENABLED === "true",
    fundingMode: ["settled", "prefunded"].includes(env.FUNDING_MODE),
  };
  if (env.ASAAS_ENV === "production") Object.assign(checks, {
    productionMode: env.APP_ENV === "production",
    commercialApproval: !!env.ASAAS_BUSINESS_APPROVAL_REF,
    homologation: !!env.HOMOLOGATION_REPORT_REF,
    identityControls: !!env.IDENTITY_REVIEW_PROCESS_REF,
    operator: !!env.LEGAL_NAME && /^\d{14}$/.test(env.LEGAL_CNPJ || ""),
    support: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.SUPPORT_EMAIL || ""),
    pricing: !!env.PRICING_REVIEW_REF,
    funding: !!env.FUNDING_REVIEW_REF,
  });
  else checks.sandboxMode = env.APP_ENV === "sandbox";
  if(env.FUNDING_MODE === 'prefunded') Object.assign(checks, {
    exposureLimit: /^\d+$/.test(env.PREFUND_MAX_OUTSTANDING_CENTS || '') && Number.isSafeInteger(Number(env.PREFUND_MAX_OUTSTANDING_CENTS)) && Number(env.PREFUND_MAX_OUTSTANDING_CENTS)>0,
    reserve: /^\d+$/.test(env.PREFUND_RESERVE_CENTS || '') && Number.isSafeInteger(Number(env.PREFUND_RESERVE_CENTS)),
  });
  return { ready: Object.values(checks).every(Boolean), checks };
}
