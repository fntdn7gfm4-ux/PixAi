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
  realQuote: null,
  realSelected: null,
  realIdempotency: null,
  realStatus: null,
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
function home() { return realHome(); }
function lookup() { return '<section class="panel lookup"><div class="eyebrow">ACOMPANHE SEU PIX</div><h1>Consultar uma operação</h1><p>Informe o código da operação criada neste navegador. A consulta mostra o registro do servidor; o retorno do checkout, sozinho, não confirma o envio do Pix.</p><form id="real-lookup-form"><label for="operation-id">Código da operação</label><input id="operation-id" name="id" required maxlength="80" autocomplete="off"><button class="btn full" type="submit">Consultar</button></form></section>'; }
function adminLogin() {
  return `<section class="panel lookup"><div class="eyebrow">ÁREA ADMINISTRATIVA</div><h1>Acesso restrito.</h1><p>Use a chave administrativa configurada no ambiente do servidor. Ela fica somente na memória desta aba.</p><form id="admin-login"><label for="admin-token">Chave administrativa</label><input id="admin-token" name="token" type="password" required minlength="32" autocomplete="off"><button class="btn full" type="submit">Acessar painel →</button></form><div class="notice">A proteção administrativa é independente da jornada sem senha dos clientes.</div></section>`;
}
function dashboard() {
  const ops=state.realOperations?.operations||[];
  return '<section class="panel"><h2>Operações Asaas</h2><p>'+ops.length+' operações carregadas. '+ops.filter(o=>o.status==='COMPLETED').length+' transferências concluídas.</p><p>Consulte status, conciliação e requisitos de liberação na aba Integrações.</p></section>';
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
    )}<div><label for="enabled-installments">Parcelas disponíveis</label><input id="enabled-installments" name="installments" value="${s.installments.join(",")}" required><p class="field-help">Separe por vírgulas. Ex.: 1,3,6,9,12</p></div>${numField("maxOperationsPerSession", "Máximo de operações / sessão / dia", s.maxOperationsPerSession, "1")}</div><hr class="section-divider"><h3>Ofertas da Home</h3><p class="field-help">O preço definido é um piso. O servidor aumenta a parcela se necessário para preservar a margem.</p>${s.offers.map((o, i) => `<div class="form-grid review-box">${numField(`offer-${i}-amount`, "Receba no Pix (R$)", o.pixAmount / 100)}${numField(`offer-${i}-count`, "Quantidade de parcelas", o.installments, "1")}${numField(`offer-${i}-floor`, "Parcela de referência (R$)", o.installmentFloor / 100)}<label class="check-label"><input name="offer-${i}-featured" type="checkbox" ${o.featured ? "checked" : ""}>Destacar oferta</label></div>`).join("")}<div class="notice warning">Taxas e custos zerados são apenas referências iniciais, não confirmação de isenção. A produção dependerá de taxas oficiais, tributos e condições validadas.</div><button class="btn" type="submit">Salvar e recalcular ofertas →</button></form></section>`;
}
function integrations() {
  const checks=state.readiness?.checks || {};
  const labels={provider:'Ambiente Asaas',apiKey:'Credencial do servidor',webhookToken:'Token de eventos',withdrawalToken:'Token de autorização de saque',encryption:'Criptografia',origin:'Endereço de retorno',enabled:'Ativação de pagamentos',productionMode:'Ambiente de produção',commercialApproval:'Aprovação do modelo pelo Asaas',homologation:'Relatório de homologação',identityControls:'Processo de identificação e antifraude',operator:'Identificação da empresa',support:'Canal de suporte',pricing:'Revisão de tarifas e tributos',funding:'Revisão do capital próprio',fundingMode:'Modelo de liquidação',exposureLimit:'Limite de capital comprometido',reserve:'Reserva de saldo',sandboxMode:'Ambiente de homologação'};
  const operations=state.realOperations?.operations || [];
  return '<section class="panel"><h2>Asaas · preparação do lançamento</h2><p>O painel mostra a configuração disponível. Marcas de configuração não substituem os testes e a análise dos documentos de aprovação.</p><div class="integration-list">'+Object.entries(checks).map(([k,v])=>'<div class="review-box integration-row"><strong>'+esc(labels[k]||k)+'</strong><span class="badge">'+(v?'CONFIGURADO':'PENDENTE')+'</span></div>').join('')+'</div><p>Eventos aguardando conciliação: '+(state.realOperations?.pendingEvents||0)+'</p><button class="btn secondary" data-action="asaas-refresh">Atualizar</button> <button class="btn secondary" data-action="asaas-replay">Reprocessar eventos pendentes</button><h3>Operações Asaas</h3>'+operations.map(o=>'<article class="review-box"><strong>'+esc(o.id)+'</strong><p>'+esc(realStatusLabel[o.status]||o.status)+' · Pix '+money(o.quote.pixAmount)+' · Cartão '+money(o.quote.totalCharge)+'</p><button class="btn secondary" data-action="asaas-reconcile" data-id="'+esc(o.id)+'">Conciliar com o Asaas</button>'+(['FUNDS_AVAILABLE','PAYMENT_APPROVED','AWAITING_LIQUIDITY'].includes(o.status)?'<form class="release-form"><input type="hidden" name="id" value="'+esc(o.id)+'"><label>Referência da revisão de identidade e antifraude<input name="reference" required minlength="10" maxlength="200" placeholder="Identificador do relatório verificado"></label><label class="check-label"><input type="checkbox" required><span>Conferi a identidade do pagador e a operação '+esc(o.id)+'. Autorizo solicitar Pix de '+money(o.quote.pixAmount)+' com o saldo da conta Asaas.</span></label><button class="btn" type="submit">Autorizar solicitação de Pix</button></form>':'')+'</article>').join('')+(operations.length?'':'<p>Nenhuma operação Asaas registrada.</p>')+'</section>';
}
function admin() {
  if (!state.adminToken || !state.dashboard || !state.settings)
    return adminLogin();
  return `<div class="admin-top"><div><div class="eyebrow">CONTROLE DA OPERAÇÃO</div><h1>Visão do negócio.</h1></div><button class="btn secondary" data-action="admin-logout">Encerrar acesso</button></div><div class="tabs" role="tablist" aria-label="Administração">${[
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
  return '<article class="panel legal centered"><a class="back" href="#home">← Início</a><h1>'+(type==='privacy'?'Privacidade':'Termos de uso')+'</h1>'+(type==='privacy'?'<p>O site utiliza um cookie de sessão para vincular cotações e consultas ao navegador. Registros técnicos limitam tentativas e protegem o serviço.</p><p>Dados de cartão devem ser informados somente no checkout hospedado pelo Asaas. A confirmação de uma operação pode envolver dados de identificação e chave Pix, armazenados com proteção e utilizados para processamento e análise.</p><p>O cadastro de novas operações está indisponível enquanto são finalizados os dados do responsável, o canal de privacidade e as condições de tratamento e retenção.</p>':'<p>A disponibilidade de pagamentos depende da liberação do serviço. No momento, novas cobranças e transferências não estão disponíveis.</p><p>Antes de confirmar uma operação, deverão ser apresentados valor do Pix, total cobrado, parcelamento, custos e condições aplicáveis. A aprovação do cartão não significa que o Pix foi concluído.</p><p>O envio depende de confirmação pelo parceiro, verificações de identidade, saldo disponível e limites operacionais. As condições comerciais definitivas serão publicadas antes da contratação.</p>')+'</article>';
}
const realStatusLabel = {
  CHECKOUT_CREATING: "Preparando checkout",
  CHECKOUT_UNCERTAIN: "Checkout em conciliação — não repita o pagamento",
  AWAITING_FUNDS: "Pagamento registrado; aguardando liquidação",
  FUNDS_AVAILABLE: "Saldo recebido; aguardando revisão de identidade",
  PIX_SUBMITTING: "Solicitando transferência",
  PIX_UNCERTAIN: "Transferência em conciliação — não repita o envio",
  PAYMENT_DISPUTED: "Pagamento em contestação ou estorno",
  AWAITING_PAYMENT: "Aguardando confirmação do pagamento…",
  PAYMENT_APPROVED: "Pagamento aprovado; aguardando liberação do Pix",
  AWAITING_LIQUIDITY: "Pagamento registrado; Pix aguardando saldo do operador",
  PIX_PROCESSING: "Pix em processamento…",
  COMPLETED: "Pix enviado com sucesso.",
  PAYMENT_FAILED: "Pagamento não aprovado.",
  PIX_FAILED: "Não foi possível enviar o Pix. Nossa equipe foi notificada.",
};
function realHome() {
  if(!state.bootstrap?.paymentsEnabled) return '<section class="intro"><div><div class="eyebrow"><span class="status-dot"></span> PIXAI</div><h1>Seu Pix.<br>Mais possibilidades.</h1><p>Escolha o valor e confira as condições de pagamento no cartão, com clareza em cada etapa.</p></div></section><section class="panel"><h2>Pagamentos ainda indisponíveis</h2><p>Estamos finalizando a liberação do serviço. Não é possível contratar uma operação ou efetuar um pagamento neste momento.</p><a class="btn secondary" href="#lookup">Consultar uma operação existente</a></section>';

  return `<section class="intro"><div><div class="eyebrow"><span class="status-dot"></span> PAGAMENTO NO CARTÃO</div><h1>Receba no Pix<br>pagando no cartão.</h1><p>Pagamento processado pelo Asaas. A chave Pix precisa ser do mesmo CPF de quem paga.</p></div></section>
 <div class="custom-card"><span class="icon-box" aria-hidden="true">＋</span><div><h3>Quanto você quer receber?</h3><p>Informe o valor do Pix.</p></div><form id="real-amount-form"><label class="money-field"><span aria-hidden="true">R$</span><input name="amount" inputmode="decimal" placeholder="180,00" required autocomplete="off" aria-label="Quanto você quer receber?" maxlength="12"></label><button class="btn" type="submit">Ver parcelas <span aria-hidden="true">→</span></button></form></div>
 <p class="fine-print">O Pix só é enviado depois que o Asaas confirma o pagamento do cartão, e apenas para uma chave Pix cujo titular seja o mesmo CPF informado nesta página.</p>`;
}
function realConfirmView() {
  const q = state.realQuote;
  const selected =
    state.realSelected || q.options.find((o) => o.recommended) || q.options[0];
  const shown = q.options.filter((o) =>
    [1, 3, 6, 12, selected.installments].includes(o.installments),
  );
  return `<a class="back" href="#real">← Alterar valor</a><div class="checkout-layout"><section class="panel"><h2>Confirme os dados.</h2><p>Você recebe ${money(selected.pixAmount)} no Pix.</p><div class="options">${shown
    .map(
      (o) =>
        `<label class="option ${selected.installments === o.installments ? "selected" : ""}"><input type="radio" name="real-installments" value="${o.installments}" ${selected.installments === o.installments ? "checked" : ""}><span class="option-main"><strong>${installmentMarkup(o)}</strong></span><span class="option-total">${money(o.totalCharge)}<br><small>no total</small></span></label>`,
    )
    .join(
      "",
    )}</div><form id="real-confirm-form"><div class="form-grid"><div class="wide"><label for="real-name">Nome completo</label><input id="real-name" name="name" required maxlength="140" autocomplete="name"></div><div><label for="real-email">E-mail</label><input id="real-email" name="email" type="email" required autocomplete="email"></div><div><label for="real-cpf">CPF</label><input id="real-cpf" name="cpf" required inputmode="numeric" placeholder="000.000.000-00" autocomplete="off"></div><div><label for="real-pix-type">Tipo de chave Pix</label><select id="real-pix-type" name="pixKeyType"><option value="CPF">CPF</option></select></div><div class="wide"><label for="real-pix-key">Chave Pix</label><input id="real-pix-key" name="pixKey" required autocomplete="off"><p class="field-help">A chave precisa pertencer ao mesmo CPF informado acima. A consulta da chave não substitui a verificação da identidade do pagador.</p></div></div><div class="notice warning">Você será redirecionado ao checkout seguro do Asaas para pagar no cartão. Nenhum dado de cartão passa por este site. A cobrança no cartão pode ser confirmada antes de haver saldo para o Pix. Nesse caso, a operação ficará aguardando aporte do operador; o pagamento não comprova envio do Pix. O checkout permite até o número de parcelas escolhido; o total desta cotação permanece o mesmo.</div><label class="check-label"><input name="consent" type="checkbox" required><span>Conferi os valores, aceito o total exibido e entendo que o Pix depende da liquidação do cartão e da revisão de identidade, sem garantia de envio imediato.</span></label><button class="btn full" type="submit">Pagar e receber Pix →</button></form></section></div>`;
}
function realResultView() {
  const s = state.realStatus;
  if (!s)
    return `<section class="panel centered"><h1>Consultando sua operação…</h1><p>Aguarde um instante.</p></section>`;
  return `<div class="centered"><a class="back" href="#real">← Nova operação</a><section class="panel"><div class="eyebrow">STATUS DA OPERAÇÃO</div><h1>${realStatusLabel[s.status] || s.status}</h1><div class="receipt-id">${esc(s.id)}</div><div class="row"><span>Você recebe no Pix</span><strong>${money(s.quote.pixAmount)}</strong></div><div class="row"><span>Total no cartão</span><strong>${money(s.quote.totalCharge)}</strong></div><p class="field-help">O retorno do checkout não confirma o pagamento por si só; esta página consulta o status real a cada poucos segundos.</p></section></div>`;
}
let realPollTimer;
async function pollRealStatus(id) {
  clearTimeout(realPollTimer);
  try {
    state.realStatus = await api(`real/status/${id}`);
  } catch (e) {
    notice(e.message);
    return;
  }
  if (location.hash.slice(1).split("?")[0] !== "real-result") return;
  render(false);
  if (!["COMPLETED", "PAYMENT_FAILED", "PIX_FAILED", "PAYMENT_DISPUTED", "PIX_UNCERTAIN", "CHECKOUT_UNCERTAIN"].includes(state.realStatus.status))
    realPollTimer = setTimeout(() => pollRealStatus(id), 4000);
}
function render(startPolling = true) {
  const [route, queryString]=(location.hash.slice(1)||'home').split('?');
  const params=new URLSearchParams(queryString||'');
  if(route==='real-confirm' && (!state.realQuote || !state.bootstrap?.paymentsEnabled)) return navigate('home');
  const views = {
    home,
    lookup,
    admin,
    real: realHome,
    "real-confirm": realConfirmView,
    "real-result": realResultView,
    privacy: () => legal("privacy"),
    terms: () => legal("terms"),
  };
  main.innerHTML = (views[route] || home)();
  main.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "instant" });
  if (route === "real-result") {
    const op = params.get("op");
    if (op && startPolling) pollRealStatus(op);
  } else {
    clearTimeout(realPollTimer);
  }
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
  await loadAsaasAdmin();
}
async function loadAsaasAdmin() {
  const [r,o]=await Promise.all([api('real/admin/readiness',{admin:true}),api('real/admin/operations',{admin:true})]);
  state.readiness=r;state.realOperations=o;
}
document.addEventListener("click", async (event) => {
  const b = event.target.closest("[data-action]");
  if (!b) return;
  const action = b.dataset.action;
  b.disabled = true;
  try {
    if(action==='asaas-refresh') { await loadAsaasAdmin();render(); }
    if(action==='asaas-replay') { const r=await api('real/admin/replay',{method:'POST',admin:true,body:{}});await loadAsaasAdmin();render();notice(r.processed+' eventos conciliados.'); }
    if(action==='asaas-reconcile') { await api('real/admin/reconcile',{method:'POST',admin:true,body:{id:b.dataset.id}});await loadAsaasAdmin();render(); }
    if (action === "admin-tab") {
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
  if (event.target.name === "real-installments") {
    state.realSelected = state.realQuote.options.find(
      (q) => q.installments === Number(event.target.value),
    );
    render();
  }
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
    if(form.classList.contains('release-form')) {
      const op=state.realOperations.operations.find(o=>o.id===data.get('id'));
      const released=await api('real/admin/release',{method:'POST',admin:true,body:{id:op.id,pixAmount:op.quote.pixAmount,reviewReference:data.get('reference'),confirmed:true}});
      await loadAsaasAdmin();render();notice(released.status==='AWAITING_LIQUIDITY'?'Pagamento registrado. O Pix aguarda saldo do operador.':'Solicitação registrada. Aguarde a confirmação do Asaas.');
    }
    if(form.id==='real-lookup-form') { state.realStatus=null;navigate('real-result?op='+encodeURIComponent(data.get('id'))); }
    if (form.id === "real-amount-form") {
      state.realQuote = await api("real/quotes", {
        method: "POST",
        body: { pixAmount: parseAmount(data.get("amount")) },
      });
      state.realSelected =
        state.realQuote.options.find((o) => o.recommended) ||
        state.realQuote.options[0];
      state.realIdempotency = crypto.randomUUID();
      navigate("real-confirm");
    }
    if (form.id === "real-confirm-form") {
      const result = await api("real/confirm", {
        method: "POST",
        key: state.realIdempotency,
        body: {
          quoteId: state.realQuote.id,
          installments: state.realSelected.installments,
          name: data.get("name"),
          email: data.get("email"),
          cpf: data.get("cpf"),
          pixKeyType: data.get("pixKeyType"),
          pixKey: data.get("pixKey"),
          confirmed: true,
          termsVersion: "real-v1",
        },
      });
      if (result.checkoutUrl) location.href = result.checkoutUrl;
      else navigate(`real-result?op=${encodeURIComponent(result.id)}`);
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
window.addEventListener("hashchange", render);
try {
  state.bootstrap = await api("bootstrap");
  $('#env-bar').innerHTML='<span class="status-dot"></span><strong>PixAI</strong><span>'+(state.bootstrap.paymentsEnabled?'Confira as condições antes de confirmar.':'Novos pagamentos ainda indisponíveis.')+'</span>';
} catch (e) {
  notice(e.message);
  const bar = $("#env-bar");
  if (bar)
    bar.innerHTML =
      '<span class="status-dot"></span><strong>SERVIÇO INDISPONÍVEL</strong><span>Não foi possível verificar o ambiente. Pagamentos não estão disponíveis.</span>';
}
render();
