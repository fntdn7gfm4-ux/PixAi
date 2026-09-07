const main=document.querySelector('#main');
const notice=document.querySelector('#notification');
const adminPage=document.body?.dataset?.admin==='true';
let bootstrap={paymentsEnabled:false,minAmount:2000,maxAmount:25000,serviceLabel:'Serviços profissionais'};
let adminToken=sessionStorage.getItem('pixai-admin-token')||'';

const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const money=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100);
const when=value=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'—';
const amountFrom=value=>{
  const normalized=String(value).trim().replace(/\s/g,'').replace(/\./g,'').replace(',','.');
  const number=Number(normalized);
  return Number.isFinite(number)?Math.round(number*100):NaN;
};
const statusLabel={CHECKOUT_CREATING:'Criando checkout',CHECKOUT_UNCERTAIN:'Confira na InfinitePay',AWAITING_PAYMENT:'Aguardando pagamento',COMPLETED:'Pagamento confirmado',PAYMENT_CONFIRMED:'Pagamento confirmado',READY_FOR_MANUAL_PIX:'Registro antigo',FAILED:'Falhou'};

function alertUser(message) {
  notice.textContent=message;
  clearTimeout(alertUser.timer);
  alertUser.timer=setTimeout(()=>notice.textContent='',6500);
}
async function api(path,{method='GET',body,admin=false,operationToken}={}) {
  const headers={'Accept':'application/json'};
  if(body) headers['Content-Type']='application/json';
  if(admin) headers.Authorization='Bearer '+adminToken;
  if(operationToken) headers['X-Operation-Token']=operationToken;
  const response=await fetch('/api/'+path,{method,headers,body:body?JSON.stringify(body):undefined});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw Error(data.error||'Não foi possível concluir esta ação.');
  return data;
}
function setEnv() {
  const bar=document.querySelector('#env-bar');
  bar.innerHTML=`<span class="status-dot"></span><strong>INFINITEPAY</strong><span>${bootstrap.paymentsEnabled?'Pagamentos disponíveis':'Pagamentos temporariamente indisponíveis'}</span>`;
}

function home() {
  main.innerHTML=`
    <section class="intro">
      <div><div class="eyebrow">Checkout seguro pela InfinitePay</div><h1>Pague seu serviço com clareza e segurança.</h1><p>Informe os dados do seu orçamento e siga para o ambiente de pagamento da InfinitePay.</p></div>
      <div class="micro-pill"><span class="icon-box" aria-hidden="true">✓</span><span><strong>Confirmação automática</strong><br>Pix ou cartão no checkout</span></div>
    </section>
    <div class="checkout-layout">
      <section class="panel">
        <h2>Dados do pagamento</h2><p>Use a descrição, a referência e o valor que você recebeu no orçamento ou contrato.</p>
        <form id="service-form">
          <div class="form-grid">
            <div><label for="reference">Referência do serviço</label><input id="reference" name="reference" maxlength="80" required placeholder="Ex.: ORC-1024"></div>
            <div><label for="amount">Valor</label><div class="money-field"><span>R$</span><input id="amount" name="amount" inputmode="decimal" required placeholder="100,00"></div><p class="field-help">Entre ${money(bootstrap.minAmount)} e ${money(bootstrap.maxAmount)}.</p></div>
            <div class="wide"><label for="description">Serviço contratado</label><input id="description" name="description" maxlength="160" required placeholder="Ex.: consultoria, manutenção ou criação de conteúdo"></div>
            <div><label for="name">Nome do cliente</label><input id="name" name="name" autocomplete="name" maxlength="140" required></div>
            <div><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="email" maxlength="200" required></div>
          </div>
          <label class="check-label"><input name="confirmed" type="checkbox" required><span>Confirmo que a referência, a descrição e o valor correspondem ao serviço solicitado e aceito os <a href="#terms"><u>Termos de uso</u></a> e a <a href="#privacy"><u>Política de privacidade</u></a>.</span></label>
          <button class="btn full" ${bootstrap.paymentsEnabled?'':'disabled'}>${bootstrap.paymentsEnabled?'Continuar para o pagamento →':'Pagamentos indisponíveis'}</button>
        </form>
      </section>
      <aside class="panel summary">
        <div class="eyebrow">Como funciona</div>
        <div class="row"><span>1</span><strong>Confira o serviço e o valor</strong></div>
        <div class="row"><span>2</span><strong>Escolha Pix ou cartão</strong></div>
        <div class="row"><span>3</span><strong>Receba a confirmação</strong></div>
        <hr><p class="fine-print">Os dados do cartão são informados somente no checkout da InfinitePay. A forma de pagamento e o parcelamento disponíveis são apresentados lá.</p>
      </aside>
    </div>
    <section class="benefits">
      <div class="benefit"><span class="line-icon" aria-hidden="true">⌁</span><div><strong>Sem criar conta</strong><p>Você só informa os dados necessários ao pagamento.</p></div></div>
      <div class="benefit"><span class="line-icon" aria-hidden="true">▣</span><div><strong>Checkout InfinitePay</strong><p>O pagamento é processado no ambiente da operadora.</p></div></div>
      <div class="benefit"><span class="line-icon" aria-hidden="true">◎</span><div><strong>Valor exato</strong><p>O site envia o mesmo valor informado para o checkout.</p></div></div>
    </section>`;
  document.querySelector('#service-form')?.addEventListener('submit',startPayment);
}

async function startPayment(event) {
  event.preventDefault();
  const form=event.currentTarget,button=form.querySelector('button');
  const field=name=>form.elements.namedItem(name);
  const amount=amountFrom(field('amount').value);
  button.disabled=true;button.textContent='Preparando checkout…';
  try {
    const quoted=await api('infinitepay/quote',{method:'POST',body:{amount}});
    const key=crypto.randomUUID();
    const result=await api('infinitepay/create',{method:'POST',body:{
      amount,totalCharge:quoted.quote.totalCharge,serviceReference:field('reference').value,
      serviceDescription:field('description').value,name:field('name').value,email:field('email').value,confirmed:field('confirmed').checked,
    },});
    if(!result.checkoutUrl) throw Error('O checkout não respondeu. Aguarde um instante e tente novamente.');
    sessionStorage.setItem('pixai-operation-'+result.id,result.accessToken);
    location.assign(result.checkoutUrl);
  } catch(error) {
    alertUser(error.message);button.disabled=false;button.textContent='Continuar para o pagamento →';
  }
}

async function resultPage(params) {
  const id=params.get('op')||'';
  const token=params.get('token')||sessionStorage.getItem('pixai-operation-'+id)||'';
  main.innerHTML='<div class="loading">Conferindo o pagamento…</div>';
  try {
    if(params.get('transaction_nsu')&&params.get('invoice_slug')) {
      await api('infinitepay/confirm',{method:'POST',operationToken:token,body:{id,transaction_nsu:params.get('transaction_nsu'),invoice_slug:params.get('invoice_slug')}}).catch(()=>null);
    }
    const operation=await api('infinitepay/status?id='+encodeURIComponent(id),{operationToken:token});
    const complete=operation.status==='COMPLETED'||operation.status==='PAYMENT_CONFIRMED';
    const quote=operation.quote||{};
    main.innerHTML=`<section class="panel centered">
      <div class="result-head"><div class="result-icon ${complete?'':'pending'}">${complete?'✓':'…'}</div><h1>${complete?'Pagamento confirmado':'Pagamento em processamento'}</h1><p>${complete?'O pagamento do serviço foi registrado com sucesso.':'A InfinitePay ainda está processando ou aguardando o pagamento.'}</p></div>
      <div class="review-box">
        <div class="row"><span>Serviço</span><strong>${esc(quote.serviceDescription||'Serviço')}</strong></div>
        <div class="row"><span>Referência</span><strong>${esc(quote.serviceReference||operation.id)}</strong></div>
        <div class="row"><span>Valor</span><strong>${money(quote.serviceAmount??quote.totalCharge)}</strong></div>
        <div class="row"><span>Status</span><strong>${esc(statusLabel[operation.status]||operation.status)}</strong></div>
        ${operation.payment?`<div class="row"><span>Forma</span><strong>${operation.payment.method==='pix'?'Pix':'Cartão'}${operation.payment.installments>1?' em '+operation.payment.installments+'x':''}</strong></div>`:''}
      </div>
      <div class="receipt-id">Identificador: ${esc(operation.id)}</div>
      <div class="receipt-actions"><button class="btn secondary" onclick="location.reload()">Atualizar status</button><button class="btn" onclick="print()">Imprimir comprovante</button><a class="btn text" href="#home">Novo pagamento</a></div>
      <p class="fine-print">A confirmação do pagamento não altera o escopo, prazo ou condições do serviço acordados no orçamento ou contrato.</p>
    </section>`;
  } catch(error) {
    main.innerHTML=`<section class="panel centered"><div class="result-head"><div class="result-icon pending">!</div><h1>Não foi possível abrir este pagamento</h1><p>${esc(error.message)}</p></div><a class="btn full" href="#home">Voltar ao início</a></section>`;
  }
}

function terms() {
  main.innerHTML=`<article class="legal"><a class="back" href="#home">← Voltar</a><div class="eyebrow">Termos de uso</div><h1>Pagamento de serviços</h1>
    <p>Este portal é usado para pagar serviços previamente solicitados, orçados ou contratados. Antes de continuar, o cliente deve conferir a descrição, a referência e o valor.</p>
    <h2>Pagamento</h2><p>O pagamento é processado pela InfinitePay. As modalidades, o parcelamento, os custos eventualmente exibidos e a aprovação são definidos no checkout da operadora.</p>
    <h2>Prestação do serviço</h2><p>A confirmação do pagamento não substitui nem modifica o orçamento, contrato, escopo, prazo ou condições comerciais já acordados entre as partes.</p>
    <h2>Cancelamento e reembolso</h2><p>Pedidos serão analisados conforme o contrato do serviço, o estágio de execução e a legislação aplicável. O estorno, quando devido, seguirá os prazos e procedimentos da forma de pagamento.</p>
    <h2>Atendimento</h2><p>Use o canal de atendimento informado no orçamento ou contrato e tenha em mãos a referência e o identificador do pagamento.</p></article>`;
}
function privacy() {
  main.innerHTML=`<article class="legal"><a class="back" href="#home">← Voltar</a><div class="eyebrow">Privacidade</div><h1>Como tratamos seus dados</h1>
    <p>O portal coleta nome, e-mail, referência, descrição e valor do serviço para criar, identificar e conciliar o pagamento, prestar atendimento e cumprir obrigações legais.</p>
    <h2>Pagamento</h2><p>Os dados do cartão ou da conta usada no pagamento são informados diretamente à InfinitePay e não são armazenados por este site.</p>
    <h2>Segurança e retenção</h2><p>Os dados de identificação guardados pelo portal são protegidos e mantidos pelo período necessário à execução do serviço, prevenção a fraudes e cumprimento de obrigações legais.</p>
    <h2>Seus direitos</h2><p>Solicitações de acesso, correção ou eliminação podem ser feitas pelo canal de atendimento informado no orçamento ou contrato, observadas as retenções exigidas por lei.</p></article>`;
}

function adminLogin() {
  main.innerHTML=`<section class="panel lookup"><div class="eyebrow">Acesso restrito</div><h1>Administração</h1><p>Informe o token administrativo para acompanhar pagamentos e ajustar a integração.</p><form id="admin-login"><label for="token">Token administrativo</label><input id="token" type="password" autocomplete="current-password" required><button class="btn full" style="margin-top:18px">Entrar</button></form></section>`;
  document.querySelector('#admin-login').addEventListener('submit',async event=>{
    event.preventDefault();adminToken=event.currentTarget.token.value;
    try {await api('infinitepay/admin/config',{admin:true});sessionStorage.setItem('pixai-admin-token',adminToken);adminDashboard();}
    catch(error){adminToken='';alertUser(error.message);}
  });
}
async function adminDashboard() {
  main.innerHTML='<div class="loading">Carregando pagamentos…</div>';
  try {
    const [configuration,data]=await Promise.all([api('infinitepay/admin/config',{admin:true}),api('infinitepay/admin/operations',{admin:true})]);
    const operations=data.operations||[],completed=operations.filter(item=>['COMPLETED','PAYMENT_CONFIRMED'].includes(item.status));
    const volume=completed.reduce((sum,item)=>sum+(item.quote.serviceAmount??item.quote.totalCharge??0),0);
    main.innerHTML=`<section class="admin-settings"><div class="admin-top"><div><div class="eyebrow">InfinitePay</div><h1>Painel de pagamentos</h1></div><button id="logout" class="btn secondary">Sair</button></div>
      <div class="metric-grid"><div class="metric"><span>Pagamentos</span><strong>${operations.length}</strong></div><div class="metric"><span>Confirmados</span><strong>${completed.length}</strong></div><div class="metric"><span>Volume confirmado</span><strong>${money(volume)}</strong></div><div class="metric"><span>Integração</span><strong>${configuration.serverEnabled&&configuration.value.enabled?'Ativa':'Pausada'}</strong></div></div>
      <section class="panel" style="margin-top:25px"><h2>Configuração</h2><form id="config-form"><div class="form-grid"><div><label for="handle">InfiniteTag</label><input id="handle" name="handle" maxlength="80" value="${esc(configuration.value.handle)}" required><p class="field-help">Sem o símbolo $.</p></div><div><label for="service-label">Nome dos serviços</label><input id="service-label" name="service-label" maxlength="100" value="${esc(configuration.value.serviceLabel)}" required></div></div><label class="check-label"><input id="enabled" name="enabled" type="checkbox" ${configuration.value.enabled?'checked':''}><span>Aceitar novos pagamentos</span></label><button class="btn">Salvar configuração</button></form></section>
      <section class="panel" style="margin-top:25px"><h2>Pagamentos recentes</h2><div class="table-wrap">${operations.length?`<table><thead><tr><th>Data</th><th>Referência</th><th>Serviço</th><th>Valor</th><th>Status</th><th>Cliente</th></tr></thead><tbody>${operations.map(item=>`<tr><td>${when(item.createdAt)}</td><td><small>${esc(item.quote.serviceReference||item.id)}</small></td><td>${esc(item.quote.serviceDescription||'Registro anterior')}</td><td>${money(item.quote.serviceAmount??item.quote.totalCharge)}</td><td>${esc(statusLabel[item.status]||item.status)}</td><td><button class="btn text detail" data-id="${esc(item.id)}">Ver dados</button></td></tr>`).join('')}</tbody></table>`:'<div class="empty">Nenhum pagamento registrado.</div>'}</div></section>
    </section>`;
    document.querySelector('#logout').onclick=()=>{sessionStorage.removeItem('pixai-admin-token');adminToken='';adminLogin();};
    document.querySelector('#config-form').addEventListener('submit',async event=>{
      event.preventDefault();
      try {const elements=event.currentTarget.elements;await api('infinitepay/admin/config',{method:'PUT',admin:true,body:{revision:configuration.revision,value:{handle:elements.namedItem('handle').value,serviceLabel:elements.namedItem('service-label').value,enabled:elements.namedItem('enabled').checked}}});alertUser('Configuração salva.');adminDashboard();}
      catch(error){alertUser(error.message);}
    });
    document.querySelectorAll('.detail').forEach(button=>button.onclick=async()=>{
      try {const detail=await api('infinitepay/admin/recipient',{method:'POST',admin:true,body:{id:button.dataset.id}});alertUser(`${detail.name} — ${detail.email} — ${detail.serviceDescription||'Serviço'}`);}
      catch(error){alertUser(error.message);}
    });
  } catch(error) {
    if(/obrigatório|401/i.test(error.message)){sessionStorage.removeItem('pixai-admin-token');adminToken='';adminLogin();} else {main.innerHTML=`<div class="notice error">${esc(error.message)}</div>`;}
  }
}

function route() {
  const [name='home',query='']=location.hash.slice(1).split('?');
  const params=new URLSearchParams(query);
  if(adminPage) return adminToken?adminDashboard():adminLogin();
  if(name==='terms') return terms();
  if(name==='privacy') return privacy();
  if(name==='real-result') return resultPage(params);
  home();
}

window.addEventListener('hashchange',route);
api('infinitepay/bootstrap').then(data=>{bootstrap=data;setEnv();route();}).catch(error=>{setEnv();home();alertUser(error.message);});
