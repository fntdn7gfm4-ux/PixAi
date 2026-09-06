const $ = (s) => document.querySelector(s),
  main = $("#main");
const money = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    v / 100,
  );
const plainMoney = (v) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v / 100);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const date = (v) =>
  new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const statusLabel = {
  CREATED: "Criada",
  AWAITING_PAYMENT: "Aguardando confirmação",
  PROCESSING_PAYMENT: "Pagamento em processamento",
  PAYMENT_APPROVED: "Cartão aprovado",
  PIX_PROCESSING: "Pix em processamento",
  PIX_SENT: "Pix enviado",
  COMPLETED: "Concluída",
  PAYMENT_FAILED: "Pagamento recusado",
  PIX_FAILED: "Falha no Pix",
  UNDER_REVIEW: "Em análise",
  REFUNDED: "Estornada",
  CHARGEBACK: "Chargeback",
};
const state = {
  bootstrap: null,
  quote: null,
  selected: null,
  scenario: "approved",
  receipt: null,
  challenge: null,
  adminToken: "",
  adminTab: "dashboard",
  settings: null,
  dashboard: null,
  allOptions: false,
  idempotency: null,
};
let errorTimer;
function notice(message) {
  $("#notification").textContent = message;
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => ($("#notification").textContent = ""), 12000);
}
async function api(path, { method = "GET", body, admin = false, key } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (admin) headers.Authorization = `Bearer ${state.adminToken}`;
  if (key) headers["Idempotency-Key"] = key;
  const r = await fetch(`./api/${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body: body ? JSON.stringify(body) : undefined,
  });
  let value;
  try {
    value = await r.json();
  } catch {
    throw Error("O servidor está indisponível. Recarregue em instantes.");
  }
  if (!r.ok) throw Error(value.error || "Não foi possível concluir.");
  return value;
}
function navigate(route) {
  if (location.hash === `#${route}`) render();
  else location.hash = route;
}
const amountMarkup = (v) => `<small>R$</small> ${plainMoney(v)}`;
const installmentMarkup = (q) =>
  `${q.installments}x de ${money(q.installmentAmount)}`;
function progress(step) {
  return `<ol class="progress" aria-label="Etapas">${["Valor e parcelas", "Identificação", "Pagamento", "Revisão"].map((s, i) => `<li class="${i + 1 === step ? "active" : ""}" ${i + 1 === step ? 'aria-current="step"' : ""}><b>${i + 1}</b>${s}</li>`).join("")}</ol>`;
}
function summary() {
  const q = state.selected;
  return `<aside class="panel summary" aria-label="Resumo da cotação"><span class="receive-label">VOCÊ RECEBE NO PIX</span><div class="receive-amount">${amountMarkup(q.pixAmount)}</div><div class="installment">${installmentMarkup(q)}</div><hr><div class="row"><span>Total no cartão</span><strong>${money(q.totalCharge)}</strong></div><div class="row"><span>Taxas e custos incluídos</span><strong>${money(q.costs)}</strong></div><p class="field-help">Todo o total utiliza o limite do cartão, mesmo com pagamento parcelado.</p><div class="notice">Cotação de referência para teste. O preço definitivo e o CET, quando aplicável, dependem do parceiro contratado.</div><p class="field-help">Cotação válida até ${new Date(state.quote.expires).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.</p></aside>`;
}
function home() {
  const b = state.bootstrap;
  return `<section class="intro"><div><div class="eyebrow"><span class="status-dot"></span> SEU PIX. NO SEU RITMO.</div><h1>Quanto você quer<br>receber no Pix?</h1><p>Escolha o valor. Confira as parcelas. Sem criar conta.</p></div><div class="micro-pill"><span class="icon-box" aria-hidden="true">↗</span>Você escolhe como pagar.</div></section>
 <div class="offer-grid">${b.offers.map((q) => `<button class="offer ${q.featured ? "featured" : ""}" data-action="offer" data-amount="${q.pixAmount}" data-installments="${q.installments}" aria-label="Receba ${money(q.pixAmount)}, ${installmentMarkup(q)}, total ${money(q.totalCharge)}">${q.featured ? '<span class="featured-label">MAIS ESCOLHIDO*</span>' : ""}<span class="receive-label">RECEBA NO PIX</span><span class="receive-amount">${amountMarkup(q.pixAmount)}</span><span class="installment">${installmentMarkup(q)}</span><span class="total">Total utilizado do cartão<strong>${money(q.totalCharge)}</strong></span><span class="offer-action">Escolher valor <span aria-hidden="true">↗</span></span></button>`).join("")}</div>
 <div class="custom-card"><span class="icon-box" aria-hidden="true">＋</span><div><h3>Outro valor? Você decide.</h3><p>Simule de ${money(b.minAmount)} a ${money(b.maxAmount)}.</p></div><form id="custom-form"><label class="money-field"><span aria-hidden="true">R$</span><input name="amount" inputmode="decimal" placeholder="180,00" required autocomplete="off" aria-label="Quanto você quer receber?" maxlength="12"></label><button class="btn" type="submit">Ver parcelas <span aria-hidden="true">→</span></button></form></div>
 <div class="benefits"><div class="benefit"><span class="line-icon" aria-hidden="true">◎</span><div><strong>Sem criar conta</strong><p>A identificação necessária faz parte da operação.</p></div></div><div class="benefit"><span class="line-icon" aria-hidden="true">◇</span><div><strong>Cartão no ambiente do parceiro</strong><p>Integração de pagamento protegido em preparação.</p></div></div><div class="benefit"><span class="line-icon" aria-hidden="true">↗</span><div><strong>Pix após aprovação</strong><p>Aprovação do cartão não confirma o envio do Pix.</p></div></div></div>
 <section class="steps-intro"><div><div class="eyebrow">SIMPLES DO INÍCIO AO FIM</div><h2>Do cartão para o Pix,<br>com tudo às claras.</h2></div><div class="how-steps"><div><span class="number">1</span><strong>Escolha seu valor</strong><p>Veja as parcelas e o custo total antes de continuar.</p></div><div><span class="number">2</span><strong>Confira os dados</strong><p>Identificação e chave Pix, sem criar uma senha.</p></div><div><span class="number">3</span><strong>Confirme a operação</strong><p>O Pix depende da aprovação e das regras do parceiro.</p></div></div></section>
 <p class="fine-print">Ofertas ilustrativas calculadas no servidor com taxas de referência. Não representam proposta de crédito. *Destaque editorial solicitado para teste, sem estatística de vendas. Este ambiente não cobra, não transfere dinheiro e não envia e-mails.</p>`;
}
function installments() {
  const options = state.allOptions
    ? state.quote.options
    : state.quote.options.filter((q) =>
        [3, 6, 9, 12, state.selected.installments].includes(q.installments),
      );
  return `<a class="back" href="#home">← Alterar valor</a>${progress(1)}<div class="checkout-layout"><section class="panel"><h2>Uma parcela que faz sentido.</h2><p>Você recebe ${money(state.selected.pixAmount)}. Compare o total de cada opção.</p><div class="options">${options.map((q) => `<label class="option ${q.installments === state.selected.installments ? "selected" : ""}"><input type="radio" name="installments" value="${q.installments}" ${q.installments === state.selected.installments ? "checked" : ""}><span class="option-main"><strong>${installmentMarkup(q)}</strong>${q.recommended ? '<span class="badge">EQUILIBRADA</span>' : ""}<small>Custos incluídos: ${money(q.costs)}</small></span><span class="option-total">${money(q.totalCharge)}<br><small>no total</small></span></label>`).join("")}</div><button class="btn text" data-action="all-options">${state.allOptions ? "Ver opções principais" : "Ver todas as parcelas"}</button><p class="field-help">A indicação “equilibrada” prioriza 6 parcelas: menos parcelas tendem a reduzir o custo total; mais parcelas reduzem a prestação.</p><div class="notice">Você está testando uma cotação. Nenhum valor será cobrado.</div><button class="btn full" data-action="identify">Continuar com ${state.selected.installments} parcelas →</button></section>${summary()}</div>`;
}
function identify() {
  return `<a class="back" href="#installments">← Voltar às parcelas</a>${progress(2)}<div class="checkout-layout"><section class="panel"><h2>Sem senha. Com identificação.</h2><p>Na operação real, os dados serão validados pelo parceiro. Para testar, usamos uma pessoa fictícia.</p><form id="identity-form"><div class="form-grid"><div class="wide"><label for="name">Nome completo</label><input id="name" value="Pessoa de teste" readonly></div><div><label for="email">E-mail</label><input id="email" value="teste@exemplo.invalid" readonly></div><div><label for="document">CPF / CNPJ</label><input id="document" value="Documento fictício — não validado" readonly></div><div class="wide"><label for="pix">Chave Pix</label><input id="pix" value="teste@exemplo.invalid" readonly><p class="field-help">Destinatário ilustrativo. Não houve consulta ao DICT.</p></div></div><div class="notice">O teste não coleta dados pessoais. A versão real exigirá identificação, validação do destinatário e verificações antifraude.</div><label class="check-label"><input type="checkbox" required><span>Li os <a href="#terms" target="_blank" rel="noopener">termos do teste</a> e entendo que estes dados são fictícios.</span></label><button class="btn full" type="submit">Continuar para pagamento →</button></form></section>${summary()}</div>`;
}
function payment() {
  return `<a class="back" href="#identify">← Voltar à identificação</a>${progress(3)}<div class="checkout-layout"><section class="panel"><h2>Seu cartão fica com o parceiro.</h2><p>A cobrança real usará campos hospedados ou checkout oficial, com tokenização e 3DS quando suportado.</p><div class="card-placeholder"><div class="eyebrow">PAGAMENTO DE DEMONSTRAÇÃO</div><h3>Cartão fictício •••• 0000</h3><p>Não digite número, validade ou CVV. O provedor de pagamentos ainda não está conectado.</p></div><h3>Qual resultado você quer testar?</h3><div class="scenario-grid">${[
    ["approved", "Aprovação e envio do Pix"],
    ["declined", "Cartão recusado"],
    ["review", "Análise manual"],
    ["pix_failed", "Cartão aprovado, Pix falhou"],
  ]
    .map(
      ([v, t]) =>
        `<label class="scenario"><input type="radio" name="scenario" value="${v}" ${state.scenario === v ? "checked" : ""}>${t}</label>`,
    )
    .join(
      "",
    )}</div><div class="notice">As opções acima apenas exercitam o fluxo. Nenhuma autenticação 3DS ou análise KYC real será realizada.</div><button class="btn full" data-action="review">Revisar antes de confirmar →</button></section>${summary()}</div>`;
}
function review() {
  const q = state.selected;
  return `<a class="back" href="#payment">← Voltar ao pagamento</a>${progress(4)}<div class="checkout-layout"><section class="panel"><h2>Confira. Depois confirme.</h2><p>Todos os valores desta simulação, antes de continuar.</p><div class="review-box"><span class="receive-label">VOCÊ RECEBE NO PIX</span><div class="receive-amount">${amountMarkup(q.pixAmount)}</div><div class="installment">${installmentMarkup(q)}</div></div><div class="row"><span>Total utilizado do cartão</span><strong>${money(q.totalCharge)}</strong></div><div class="row"><span>Taxas e custos incluídos</span><strong>${money(q.costs)}</strong></div><div class="row"><span>Chave Pix</span><strong>t••••@exemplo.invalid</strong></div><div class="row"><span>Destinatário</span><strong>Pessoa de teste</strong></div><div class="row"><span>Cartão</span><strong>Fictício •••• 0000</strong></div><p class="field-help">CET e condições definitivas indisponíveis: não há operação financeira contratada neste teste.</p><form id="confirm-form"><label class="check-label"><input name="consent" type="checkbox" required><span>Conferi os valores e confirmo somente a simulação. Sei que não haverá cobrança nem envio de Pix.</span></label><button class="btn full" type="submit">SIMULAR PAGAMENTO E PIX →</button></form><p class="field-help">Na versão real, a cobrança só ocorrerá após o aceite em “Pagar e receber Pix”.</p></section>${summary()}</div>`;
}
function result() {
  const r = state.receipt,
    q = r.quote,
    success = r.status === "COMPLETED";
  const title = success
    ? "Fluxo de teste concluído."
    : r.status === "PAYMENT_FAILED"
      ? "Teste: cartão recusado."
      : r.status === "PIX_FAILED"
        ? "Teste: o Pix não foi enviado."
        : "Teste: operação em análise.";
  return `<div class="centered"><a class="back" href="#home">← Voltar ao início</a><section class="panel"><div class="result-head"><span class="official-logo"><img src="./assets/pixai-logo-oficial.png" alt="PixAI" width="1254" height="1254"></span><div class="result-icon ${success ? "" : "pending"}" aria-hidden="true">${success ? "✓" : "!"}</div><div class="eyebrow">COMPROVANTE DE SIMULAÇÃO</div><h1>${title}</h1><p>Nenhum dinheiro foi movimentado.</p></div><div class="review-box"><span class="receive-label">VALOR DO PIX SIMULADO</span><div class="receive-amount">${amountMarkup(q.pixAmount)}</div><div class="installment">${installmentMarkup(q)}</div></div><div class="receipt-id">${esc(r.id)}</div><div class="row"><span>Data e horário (Brasília)</span><strong>${date(r.createdAt)}</strong></div><div class="row"><span>Total simulado no cartão</span><strong>${money(q.totalCharge)}</strong></div><div class="row"><span>Taxas e custos</span><strong>${money(q.costs)}</strong></div><div class="row"><span>Pagamento simulado</span><strong>${r.paymentStatus === "APPROVED" ? "Aprovado" : r.paymentStatus === "FAILED" ? "Recusado" : "Em análise"}</strong></div><div class="row"><span>Pix simulado</span><strong>${r.pixStatus === "SENT" ? "Enviado" : r.pixStatus === "FAILED" ? "Falhou" : "Não enviado"}</strong></div><div class="row"><span>Recebedor / cartão</span><strong>Pessoa de teste / •••• 0000</strong></div><div class="row"><span>Chave Pix</span><strong>${esc(r.recipient.key)}</strong></div><div class="row"><span>Instituição processadora</span><strong>Não conectada</strong></div><div class="notice ${success ? "success" : "warning"}">${success ? "Todos os estados do cenário foram percorridos. Este documento não comprova uma transferência financeira." : r.status === "PIX_FAILED" ? "Aprovação do cartão e envio do Pix são estados separados. Na integração real, uma falha exige conciliação e eventual estorno, sem duplicar a cobrança." : r.status === "PAYMENT_FAILED" ? "O cenário encerrou antes da etapa Pix. Você pode escolher outro resultado para testar." : "O cenário foi encaminhado para análise. Não há equipe de revisão conectada neste ambiente."}</div><details><summary>Ver etapas da simulação</summary><ul class="timeline">${r.timeline.map((s) => `<li>${statusLabel[s]}</li>`).join("")}</ul></details><div class="receipt-actions"><button class="btn" data-action="download">Baixar comprovante de teste ↓</button><button class="btn secondary" data-action="lookup-receipt">Testar consulta por código</button></div><p class="field-help">E-mail não enviado. O serviço de envio e o OTP por e-mail serão conectados na homologação. A consulta de demonstração está restrita a esta sessão.</p></section></div>`;
}
function lookup() {
  return `<section class="panel lookup"><div class="eyebrow">ACOMPANHE SEU PIX</div><h1>Consultar minha transação</h1><p>Na versão real, o acesso exige um código enviado ao e-mail verificado da operação.</p><div class="notice">Demonstração restrita às transações criadas nesta sessão. Não envie dados reais. O código de teste aparece na tela; não é um OTP por e-mail.</div>${state.challenge ? `<form id="otp-form"><label for="otp">Código de verificação</label><input id="otp" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required placeholder="000000"><div class="notice warning">Código exclusivo para teste:<strong class="otp-demo">${esc(state.challenge.demoCode)}</strong>Expira em 5 minutos. Até 5 tentativas.</div><button class="btn full" type="submit">Validar e consultar →</button><button class="btn text" type="button" data-action="reset-lookup">Usar outro código de transação</button></form>` : `<form id="lookup-form"><label for="lookup-email">E-mail de teste</label><input id="lookup-email" value="teste@exemplo.invalid" readonly><label for="transaction-id">Código da transação</label><input id="transaction-id" name="transactionId" required maxlength="80" autocomplete="off" placeholder="TEST-PIX-…" value="${esc(state.receipt?.id || "")}"><p class="field-help">Você encontra o código no comprovante da simulação.</p><button class="btn full" type="submit">Gerar código de demonstração →</button></form>`}</section>`;
}
function adminLogin() {
  return `<section class="panel lookup"><div class="eyebrow">ÁREA ADMINISTRATIVA</div><h1>Acesso restrito.</h1><p>Use a chave administrativa configurada no ambiente do servidor. Ela fica somente na memória desta aba.</p><form id="admin-login"><label for="admin-token">Chave administrativa</label><input id="admin-token" name="token" type="password" required minlength="32" autocomplete="off"><button class="btn full" type="submit">Acessar painel →</button></form><div class="notice">A proteção administrativa é independente da jornada sem senha dos clientes.</div></section>`;
}
function dashboard() {
  const d = state.dashboard,
    t = d.totals;
  const metrics = [
    ["Volume Pix simulado", money(t.volume)],
    ["Operações de teste", d.totalOperations],
    ["Valor médio", money(t.average)],
    ["Receita projetada", money(t.revenue)],
    ["Taxas de gateway", money(t.gatewayFees)],
    ["Lucro projetado", money(t.profit)],
    ["Margem de contribuição", (t.margin * 100).toFixed(1) + "%"],
    ["Conversão de cotações", (d.conversion * 100).toFixed(1) + "%"],
    ["Pix simulados enviados", t.pixSent],
    ["Pix simulados falhos", t.pixFailed],
    ["Em análise / suspeitas", t.underReview],
    ["Chargebacks", t.chargebacks],
  ];
  return `<div class="notice">${esc(d.scope)} Conversão = operações ÷ cotações criadas; não representa visitantes únicos.</div><div class="metric-grid">${metrics.map(([l, v]) => `<div class="metric"><span>${l}</span><strong>${v}</strong></div>`).join("")}</div><section class="panel table-wrap"><h3>Últimas operações</h3>${d.operations.length ? `<table><thead><tr><th>Código</th><th>Data</th><th>Pix</th><th>Cartão</th><th>Status simulado</th></tr></thead><tbody>${d.operations.map((r) => `<tr><td><small>${esc(r.id)}</small></td><td>${date(r.createdAt)}</td><td>${money(r.quote.pixAmount)}</td><td>${money(r.quote.totalCharge)}</td><td>${statusLabel[r.status]}</td></tr>`).join("")}</tbody></table>` : '<div class="empty">Nenhuma operação de teste ainda. Faça uma simulação para acompanhar os indicadores.</div>'}</section>`;
}
const numField = (name, label, value, step = "0.01") =>
  `<div><label for="${name}">${label}</label><input id="${name}" name="${name}" type="number" min="0" step="${step}" value="${value}" required></div>`;
function pricingAdmin() {
  const s = state.settings.value;
  return `<section class="panel admin-settings"><h2>Preços sob seu controle.</h2><p>Configuração central aplicada a novas cotações. A margem mínima é calculada sobre o Pix entregue, após custos.</p><form id="pricing-form"><h3>Taxas de referência do gateway (%)</h3><div class="rate-grid">${s.gatewayRates.map((r, i) => numField(`rate-${i}`, `${i + 1} parcela${i ? "s" : ""}`, r / 10000)).join("")}</div><hr class="section-divider"><h3>Custos e margem</h3><div class="form-grid">${[
    ["gatewayFixedFee", "Custo fixo gateway (R$)", 100],
    ["operationalCost", "Custo operacional (R$)", 100],
    ["taxRate", "Tributos de referência (%)", 10000],
    ["fraudReserve", "Reserva antifraude (%)", 10000],
    ["minimumProfitRate", "Margem mínima (%) — mínimo 30", 10000],
    ["minimumProfitAmount", "Lucro mínimo por operação (R$)", 100],
    ["minAmount", "Pix mínimo (R$)", 100],
    ["maxAmount", "Pix máximo (R$)", 100],
  ]
    .map(([k, l, d]) => numField(k, l, s[k] / d))
    .join(
      "",
    )}<div><label for="enabled-installments">Parcelas disponíveis</label><input id="enabled-installments" name="installments" value="${s.installments.join(",")}" required><p class="field-help">Separe por vírgulas. Ex.: 1,3,6,9,12</p></div>${numField("maxOperationsPerSession", "Máximo de operações de teste / sessão / dia", s.maxOperationsPerSession, "1")}</div><hr class="section-divider"><h3>Ofertas da Home</h3><p class="field-help">O preço definido é um piso. O servidor aumenta a parcela se necessário para preservar a margem.</p>${s.offers.map((o, i) => `<div class="form-grid review-box">${numField(`offer-${i}-amount`, "Receba no Pix (R$)", o.pixAmount / 100)}${numField(`offer-${i}-count`, "Quantidade de parcelas", o.installments, "1")}${numField(`offer-${i}-floor`, "Parcela de referência (R$)", o.installmentFloor / 100)}<label class="check-label"><input name="offer-${i}-featured" type="checkbox" ${o.featured ? "checked" : ""}>Destacar oferta</label></div>`).join("")}<div class="notice warning">Taxas e custos zerados são apenas referências iniciais, não confirmação de isenção. A produção dependerá de taxas oficiais, tributos e condições validadas.</div><button class="btn" type="submit">Salvar e recalcular ofertas →</button></form></section>`;
}
function integrations() {
  return `<section class="panel"><h2>Conectar os parceiros.</h2><p>Configuração técnica preparada. Cobrança, Pix, KYC, e-mail e 3DS ainda não estão integrados.</p><div class="integration-list">${[
    ["Cartão e tokenização", "PSP_SANDBOX_API_KEY / PSP_PRODUCTION_API_KEY"],
    ["Pix e conciliação", "Adaptador oficial do parceiro de cash-out"],
    ["Webhooks assinados", "PSP_WEBHOOK_SECRET + formato oficial do parceiro"],
    ["Identidade e antifraude", "KYC_PROVIDER_API_KEY"],
    ["Comprovante e OTP por e-mail", "EMAIL_PROVIDER_API_KEY / EMAIL_FROM"],
  ]
    .map(
      ([name, key]) =>
        `<div class="review-box integration-row"><div><strong>${name}</strong><p>${key}</p></div><span class="badge">NÃO CONFIGURADO</span></div>`,
    )
    .join(
      "",
    )}</div><div class="notice warning">Não basta inserir uma chave. A operação cartão → Pix deve estar autorizada pelo parceiro e o adaptador precisa ser implementado e homologado. Não há botão para ativar produção prematuramente.</div><h3>Opções para avaliação comercial</h3><p><a href="https://developers.celcoin.com.br/docs/pagar-e-transferir-com-pix-cashout" target="_blank" rel="noopener">Celcoin — Pix cash-out</a> · <a href="https://docs.zoop.com.br/" target="_blank" rel="noopener">Zoop — pagamentos e banking</a> · <a href="https://docs.pagar.me/reference/vis%C3%A3o-geral-sobre-pagamento" target="_blank" rel="noopener">Pagar.me — processamento de cartão</a></p><p class="field-help">A documentação de cada produto não confirma permissão para este modelo de negócio. É necessária aprovação comercial específica.</p></section>`;
}
function admin() {
  if (!state.adminToken || !state.dashboard || !state.settings)
    return adminLogin();
  return `<div class="admin-top"><div><div class="eyebrow">CONTROLE DA OPERAÇÃO · SANDBOX</div><h1>Visão do negócio.</h1></div><button class="btn secondary" data-action="admin-logout">Encerrar acesso</button></div><div class="tabs" role="tablist" aria-label="Administração">${[
    ["dashboard", "Visão geral"],
    ["pricing", "Preços"],
    ["integrations", "Integrações"],
  ]
    .map(
      ([v, l]) =>
        `<button role="tab" aria-selected="${state.adminTab === v}" class="${state.adminTab === v ? "active" : ""}" data-action="admin-tab" data-tab="${v}">${l}</button>`,
    )
    .join(
      "",
    )}</div>${state.adminTab === "dashboard" ? dashboard() : state.adminTab === "pricing" ? pricingAdmin() : integrations()}`;
}
function legal(type) {
  return `<article class="panel legal centered"><a class="back" href="#home">← Início</a><div class="eyebrow">AMBIENTE DE AVALIAÇÃO</div><h1>${type === "privacy" ? "Privacidade no teste." : "Termos da demonstração."}</h1>${type === "privacy" ? `<p>Esta versão usa uma identidade fictícia e não solicita nome real, CPF, chave Pix ou dados de cartão. Não insira informações pessoais neste ambiente.</p><h2>O que o teste armazena</h2><p>Cotações, operações simuladas, estados, registros de auditoria e um identificador aleatório de sessão. Um cookie HttpOnly mantém a sessão por até 24 horas. Um hash do endereço IP é usado para limitar tentativas; não é usado para publicidade.</p><h2>Consulta e acesso</h2><p>A consulta de demonstração só permite acessar operações da mesma sessão após validar o código de teste. Administradores autorizados podem consultar os registros simulados.</p><h2>Antes de aceitar dados reais</h2><p>O responsável pela operação, canal de privacidade, bases legais, prazos de retenção, parceiros e atendimento aos direitos do titular precisam ser definidos. Este aviso não substitui a política de privacidade da futura operação financeira.</p>` : `<p>O Pixaí está em avaliação. Não há cobrança, transferência Pix, concessão de crédito, validação KYC real ou instituição de pagamento conectada.</p><h2>Preços de referência</h2><p>As ofertas são calculadas no servidor. Os valores incluem custos de referência e margem comercial. O custo efetivo, tributos, regras do cartão e CET aplicável serão determinados com o parceiro autorizado antes de qualquer operação real.</p><h2>Resultados simulados</h2><p>Os cenários de aprovação, recusa, análise e falha no Pix são fictícios e servem apenas para avaliar a experiência. Os comprovantes são identificados como teste e não comprovam movimentação de dinheiro.</p><h2>Sem e-mails reais</h2><p>O código mostrado na consulta é um recurso de demonstração. Nenhuma mensagem é enviada. Não há acesso a transações reais por esta página.</p>`}</article>`;
}
function render() {
  const route = location.hash.slice(1) || "home";
  const needsQuote = ["installments", "identify", "payment", "review"];
  if (needsQuote.includes(route) && !state.selected) return navigate("home");
  if (route === "result" && !state.receipt) return navigate("lookup");
  const views = {
    home,
    installments,
    identify,
    payment,
    review,
    result,
    lookup,
    admin,
    privacy: () => legal("privacy"),
    terms: () => legal("terms"),
  };
  main.innerHTML = (views[route] || home)();
  main.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "instant" });
}
async function getQuote(amount, n) {
  const q = await api("quotes", {
    method: "POST",
    body: { pixAmount: amount },
  });
  state.quote = q;
  state.selected =
    q.options.find((o) => o.installments === n) ||
    q.options.find((o) => o.recommended) ||
    q.options[0];
  state.idempotency = crypto.randomUUID();
  state.allOptions = false;
  state.scenario = "approved";
  navigate("installments");
}
function parseAmount(value) {
  const clean = value.trim().replace(/^R\$\s*/, "");
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(clean))
    throw Error("Informe um valor como 180,00.");
  return Math.round(Number(clean.replaceAll(".", "").replace(",", ".")) * 100);
}
async function loadAdmin() {
  const [d, s] = await Promise.all([
    api("admin/dashboard", { admin: true }),
    api("admin/settings", { admin: true }),
  ]);
  state.dashboard = d;
  state.settings = s;
}
document.addEventListener("click", async (event) => {
  const b = event.target.closest("[data-action]");
  if (!b) return;
  const action = b.dataset.action;
  b.disabled = true;
  try {
    if (action === "offer")
      await getQuote(Number(b.dataset.amount), Number(b.dataset.installments));
    else if (action === "all-options") {
      state.allOptions = !state.allOptions;
      render();
    } else if (action === "identify") navigate("identify");
    else if (action === "review") navigate("review");
    else if (action === "lookup-receipt") {
      state.challenge = null;
      navigate("lookup");
    } else if (action === "reset-lookup") {
      state.challenge = null;
      render();
    } else if (action === "download") {
      const r = state.receipt,
        q = r.quote;
      const text = `PIXAÍ — COMPROVANTE DE SIMULAÇÃO\nNENHUM DINHEIRO FOI MOVIMENTADO\n\nIdentificador: ${r.id}\nData (Brasília): ${date(r.createdAt)}\nPix simulado: ${money(q.pixAmount)}\nCartão: ${installmentMarkup(q)}\nTotal: ${money(q.totalCharge)}\nTaxas e custos: ${money(q.costs)}\nStatus: ${statusLabel[r.status]}\nPagamento simulado: ${r.paymentStatus}\nPix simulado: ${r.pixStatus}\nRecebedor: Pessoa de teste\nChave: ${r.recipient.key}\nCartão fictício: **** 0000\nInstituição: não conectada\nE-mail: não enviado\n`;
      const url = URL.createObjectURL(
        new Blob([text], { type: "text/plain;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `${r.id}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else if (action === "admin-tab") {
      state.adminTab = b.dataset.tab;
      await loadAdmin();
      render();
    } else if (action === "admin-logout") {
      state.adminToken = "";
      state.dashboard = null;
      state.settings = null;
      render();
    }
  } catch (e) {
    notice(e.message);
  } finally {
    b.disabled = false;
  }
});
document.addEventListener("change", (event) => {
  if (event.target.name === "installments" && event.target.type === "radio") {
    const scroll = window.scrollY;
    state.selected = state.quote.options.find(
      (q) => q.installments === Number(event.target.value),
    );
    render();
    window.scrollTo(0, scroll);
    $(
      `input[name="installments"][value="${state.selected.installments}"]`,
    )?.focus({ preventScroll: true });
  }
  if (event.target.name === "scenario") state.scenario = event.target.value;
});
document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (!form.reportValidity()) return;
  const button = form.querySelector("[type=submit]");
  button.disabled = true;
  const old = button.textContent;
  button.textContent = "Aguarde…";
  const data = new FormData(form);
  try {
    if (form.id === "custom-form")
      await getQuote(parseAmount(data.get("amount")));
    if (form.id === "identity-form") navigate("payment");
    if (form.id === "confirm-form") {
      state.receipt = await api("sandbox/confirm", {
        method: "POST",
        key: state.idempotency,
        body: {
          quoteId: state.quote.id,
          installments: state.selected.installments,
          scenario: state.scenario,
          confirmed: true,
          termsVersion: "sandbox-v1",
        },
      });
      navigate("result");
    }
    if (form.id === "lookup-form") {
      state.challenge = await api("lookup/request", {
        method: "POST",
        body: { transactionId: data.get("transactionId") },
      });
      render();
    }
    if (form.id === "otp-form") {
      state.receipt = await api("lookup/verify", {
        method: "POST",
        body: {
          challengeId: state.challenge.challengeId,
          code: data.get("code"),
        },
      });
      state.challenge = null;
      navigate("result");
    }
    if (form.id === "admin-login") {
      state.adminToken = data.get("token");
      try {
        await loadAdmin();
        render();
      } catch (e) {
        state.adminToken = "";
        throw e;
      }
    }
    if (form.id === "pricing-form") {
      const s = structuredClone(state.settings.value);
      s.gatewayRates = s.gatewayRates.map((_, i) =>
        Math.round(Number(data.get(`rate-${i}`)) * 10000),
      );
      for (const k of [
        "gatewayFixedFee",
        "operationalCost",
        "minimumProfitAmount",
        "minAmount",
        "maxAmount",
      ])
        s[k] = Math.round(Number(data.get(k)) * 100);
      for (const k of ["taxRate", "fraudReserve", "minimumProfitRate"])
        s[k] = Math.round(Number(data.get(k)) * 10000);
      s.installments = data
        .get("installments")
        .split(",")
        .map((v) => Number(v.trim()));
      s.maxOperationsPerSession = Number(data.get("maxOperationsPerSession"));
      s.offers = s.offers.map((o, i) => ({
        pixAmount: Math.round(Number(data.get(`offer-${i}-amount`)) * 100),
        installments: Number(data.get(`offer-${i}-count`)),
        installmentFloor: Math.round(
          Number(data.get(`offer-${i}-floor`)) * 100,
        ),
        featured: data.has(`offer-${i}-featured`),
      }));
      state.settings = await api("admin/settings", {
        method: "PUT",
        admin: true,
        body: { value: s, revision: state.settings.revision },
      });
      state.bootstrap = await api("bootstrap");
      render();
      notice(
        "Preços salvos. Novas cotações já usam a configuração atualizada.",
      );
    }
  } catch (e) {
    notice(e.message);
  } finally {
    button.disabled = false;
    button.textContent = old;
  }
});
window.addEventListener("hashchange", () => {
  if (state.bootstrap) render();
});
try {
  state.bootstrap = await api("bootstrap");
  render();
} catch (e) {
  main.innerHTML =
    '<section class="panel centered"><h1>Estamos preparando o ambiente.</h1><p>A conexão com o servidor não está disponível. Tente recarregar em instantes.</p><a class="btn" href="./">Tentar novamente</a></section>';
  notice(e.message);
}
