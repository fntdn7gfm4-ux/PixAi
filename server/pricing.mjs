// Monetary values are integer BRL cents. Rates are parts per million (1% = 10,000).
export const DEFAULT_SETTINGS = {
  gatewayRates: [
    42000, 85200, 99000, 112500, 125800, 138800, 151600, 164200, 176500, 188500,
    200400, 212000,
  ],
  gatewayFixedFee: 0,
  taxRate: 0,
  fraudReserve: 0,
  operationalCost: 0,
  minimumProfitRate: 300000,
  minimumProfitAmount: 0,
  minAmount: 2000,
  maxAmount: 500000,
  installments: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  offers: [
    { pixAmount: 2000, installments: 2, installmentFloor: 1490 },
    { pixAmount: 5000, installments: 4, installmentFloor: 1890 },
    {
      pixAmount: 10000,
      installments: 6,
      installmentFloor: 2590,
      featured: true,
    },
    { pixAmount: 25000, installments: 12, installmentFloor: 3490 },
  ],
  maxOperationsPerSession: 20,
  provider: "unconfigured",
};
const ceilDiv = (a, b) => (a + b - 1n) / b;
export function validateSettings(s) {
  if (
    !s ||
    Object.keys(s).sort().join() !== Object.keys(DEFAULT_SETTINGS).sort().join()
  )
    throw Error("Configuração incompleta ou desconhecida.");
  const integer = (x, min, max) =>
    Number.isSafeInteger(x) && x >= min && x <= max;
  if (
    !Array.isArray(s.gatewayRates) ||
    s.gatewayRates.length !== 12 ||
    s.gatewayRates.some((x) => !integer(x, 0, 700000))
  )
    throw Error("Informe as 12 taxas válidas.");
  for (const k of ["gatewayFixedFee", "operationalCost", "minimumProfitAmount"])
    if (!integer(s[k], 0, 1000000)) throw Error("Custo inválido.");
  for (const k of ["taxRate", "fraudReserve"])
    if (!integer(s[k], 0, 300000)) throw Error("Percentual inválido.");
  if (!integer(s.minimumProfitRate, 300000, 3000000))
    throw Error("A margem mínima deve ser de pelo menos 30%.");
  if (s.gatewayRates.some((r) => r + s.taxRate + s.fraudReserve >= 950000))
    throw Error("A soma das taxas deve ser inferior a 95%.");
  if (
    !integer(s.minAmount, 100, 1000000) ||
    !integer(s.maxAmount, s.minAmount, 1000000)
  )
    throw Error("Limites inválidos.");
  if (
    !Array.isArray(s.installments) ||
    !s.installments.length ||
    s.installments.some((n) => !integer(n, 1, 12)) ||
    new Set(s.installments).size !== s.installments.length
  )
    throw Error("Parcelas inválidas.");
  if (
    !Array.isArray(s.offers) ||
    s.offers.length > 8 ||
    s.offers.some(
      (o) =>
        !integer(o.pixAmount, s.minAmount, s.maxAmount) ||
        !s.installments.includes(o.installments) ||
        !integer(o.installmentFloor, 90, 10000000) ||
        Object.keys(o).some(
          (k) =>
            ![
              "pixAmount",
              "installments",
              "installmentFloor",
              "featured",
            ].includes(k),
        ) ||
        (o.featured !== undefined && typeof o.featured !== "boolean"),
    )
  )
    throw Error("Ofertas fora dos limites configurados.");
  if (
    !integer(s.maxOperationsPerSession, 1, 100) ||
    s.provider !== "unconfigured"
  )
    throw Error("Parceiro ainda não homologado.");
  return s;
}
export function price(
  pixAmount,
  installments,
  settings = DEFAULT_SETTINGS,
  providerFee = null,
  floor = 0,
) {
  validateSettings(settings);
  if (
    !Number.isSafeInteger(pixAmount) ||
    pixAmount < settings.minAmount ||
    pixAmount > settings.maxAmount ||
    !settings.installments.includes(installments)
  )
    throw Error("Valor ou parcelamento fora dos limites.");
  const gatewayRate =
    providerFee?.rate ?? settings.gatewayRates[installments - 1];
  const gatewayFixedFee = providerFee?.fixedFee ?? settings.gatewayFixedFee;
  if (
    !Number.isSafeInteger(gatewayRate) ||
    gatewayRate < 0 ||
    !Number.isSafeInteger(gatewayFixedFee) ||
    gatewayFixedFee < 0
  )
    throw Error("Taxa do parceiro inválida.");
  const ppm = 1000000n,
    pix = BigInt(pixAmount),
    n = BigInt(installments),
    rate = BigInt(gatewayRate + settings.taxRate + settings.fraudReserve);
  if (rate >= ppm) throw Error("Taxas inviabilizam a operação.");
  const targetProfit = Number(
    ceilDiv(pix * BigInt(settings.minimumProfitRate), ppm),
  );
  const target = Math.max(targetProfit, settings.minimumProfitAmount);
  const minimum = ceilDiv(
    (pix + BigInt(target + gatewayFixedFee + settings.operationalCost)) * ppm,
    ppm - rate,
  );
  let installmentAmount = Math.max(Number(ceilDiv(minimum, n)), floor);
  installmentAmount = Math.max(
    90,
    Math.ceil((installmentAmount - 90) / 100) * 100 + 90,
  );
  let result;
  // Round each cost upwards independently, then re-check the actual cent-level contribution.
  for (let i = 0; i < 100; i++, installmentAmount += 100) {
    const total = installmentAmount * installments;
    const cost = (r) => Number(ceilDiv(BigInt(total) * BigInt(r), ppm));
    const gatewayCost = cost(gatewayRate) + gatewayFixedFee,
      taxCost = cost(settings.taxRate),
      fraudCost = cost(settings.fraudReserve);
    const netRevenue =
      total - gatewayCost - taxCost - fraudCost - settings.operationalCost;
    const profit = netRevenue - pixAmount;
    result = {
      pixAmount,
      installments,
      installmentAmount,
      totalCharge: total,
      costs: total - pixAmount,
      gatewayCost,
      taxCost,
      fraudCost,
      operationalCost: settings.operationalCost,
      netRevenue,
      profit,
      margin: profit / pixAmount,
      rateSource: providerFee ? "provider" : "reference",
      gatewayRate,
      targetProfit: target,
    };
    if (profit >= target) return result;
  }
  throw Error("Não foi possível formar uma oferta válida.");
}
export function homeOffers(settings) {
  return settings.offers.map((o) => ({
    ...price(o.pixAmount, o.installments, settings, null, o.installmentFloor),
    featured: !!o.featured,
  }));
}
export function quoteOptions(amount, settings) {
  const options = settings.installments.map((n) =>
    price(
      amount,
      n,
      settings,
      null,
      settings.offers.find(
        (o) => o.pixAmount === amount && o.installments === n,
      )?.installmentFloor || 0,
    ),
  );
  const target = options.reduce(
    (best, o) =>
      Math.abs(o.installments - 6) < Math.abs(best.installments - 6) ? o : best,
    options[0],
  );
  return options.map((o) => ({
    ...o,
    recommended: o.installments === target.installments,
  }));
}
