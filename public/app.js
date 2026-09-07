const main=document.querySelector('#main');
const notice=document.querySelector('#notification');
const adminPage=document.body?.dataset?.admin==='true';
let bootstrap={paymentsEnabled:false,minAmount:2000,maxAmount:25000,serviceLabel:'Serviços profissionais',products:[],content:{}};
let adminToken=sessionStorage.getItem('pixai-admin-token')||'';

const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const money=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100);
const when=value=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'—';
const amountFrom=value=>{
  const normalized=String(value).trim().replace(/\s/g,'').replace(/\./g,'').replace(',','.');
  const number=Number(normalized);
  return Number.isFinite(number)?Math.round(number*100):NaN;
};
const statusLabel={CHECKOUT_CREATING:'Criando checkout',CHECKOUT_UNCERTAIN:'Confira na InfinitePay',AWAITING_PAYMENT:'Aguardando pagamento',COMPLETED:'Pagamento confirmado',DELIVERED:'Produto entregue',PAYMENT_CONFIRMED:'Pagamento confirmado',READY_FOR_MANUAL_PIX:'Registro antigo',FAILED:'Falhou'};

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
  const content={
    eyebrow:'Checkout seguro pela InfinitePay',title:'Pague seu serviço com clareza e segurança.',subtitle:'Informe os dados do seu orçamento e siga para o ambiente de pagamento da InfinitePay.',
    formTitle:'Dados do pagamento',formHelp:'Use a descrição, a referência e o valor que você recebeu no orçamento ou contrato.',
    descriptionLabel:'Serviço contratado',descriptionPlaceholder:'Ex.: consultoria, manutenção ou criação de conteúdo',
    amountLabel:'Valor',nameLabel:'Nome do cliente',emailLabel:'E-mail',buttonLabel:'Continuar para o pagamento',...bootstrap.content,
  };
  const products=bootstrap.products||[];
  main.innerHTML=`
    <section class="intro">
      <div><div class="eyebrow">${esc(content.eyebrow)}</div><h1>${esc(content.title)}</h1><p>${esc(content.subtitle)}</p></div>
      <div class="micro-pill"><span class="icon-box" aria-hidden="true">✓</span><span><strong>Confirmação automática</strong><br>Pix ou cartão no checkout</span></div>
    </section>
    <div class="checkout-layout">
      <section class="panel">
        <h2>${esc(content.formTitle)}</h2><p>${esc(content.formHelp)}</p>
        <form id="service-form">
          <div class="form-grid">
            ${products.length?`<div class="wide"><label for="product">${esc(bootstrap.serviceLabel)}</label><select id="product" name="productId" required><option value="">Selecione</option>${products.map(product=>`<option value="${esc(product.id)}">${esc(product.name)}${product.customPrice?'':' — '+money(product.price)}</option>`).join('')}</select></div>`:''}
            <div><label for="amount">${esc(content.amountLabel)}</label><div class="money-field"><span>R$</span><input id="amount" name="amount" inputmode="decimal" required placeholder="100,00"></div><p class="field-help">Entre ${money(bootstrap.minAmount)} e ${money(bootstrap.maxAmount)}.</p></div>
            <div class="wide"><label for="description">${esc(content.descriptionLabel)}</label><input id="description" name="description" maxlength="160" required placeholder="${esc(content.descriptionPlaceholder)}"></div>
            <div><label for="name">${esc(content.nameLabel)}</label><input id="name" name="name" autocomplete="name" maxlength="140" required></div>
            <div><label for="email">${esc(content.emailLabel)}</label><input id="email" name="email" type="email" autocomplete="email" maxlength="200" required></div>
          </div>
          <label class="check-label"><input name="confirmed" type="checkbox" required><span>Confirmo que a referência, a descrição e o valor correspondem ao serviço solicitado e aceito os <a href="#terms"><u>Termos de uso</u></a> e a <a href="#privacy"><u>Política de privacidade</u></a>.</span></label>
          <button class="btn full" ${bootstrap.paymentsEnabled?'':'disabled'}>${bootstrap.paymentsEnabled?esc(content.buttonLabel)+' →':'Pagamentos indisponíveis'}</button>
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
  document.querySelector('#product')?.addEventListener('change',event=>{
    const product=products.find(item=>item.id===event.currentTarget.value);
    const form=document.querySelector('#service-form');
    if(!product||!form) return;
    form.elements.namedItem('description').value=product.description;
    const amount=form.elements.namedItem('amount');
    amount.readOnly=!product.customPrice;
    amount.value=product.customPrice?'':(product.price/100).toFixed(2).replace('.',',');
  });
}

async function startPayment(event) {
  event.preventDefault();
  const form=event.currentTarget,button=form.querySelector('button');
  const field=name=>form.elements.namedItem(name);
  const amount=amountFrom(field('amount').value);
  button.disabled=true;button.textContent='Preparando checkout…';
  try {
    const productId=field('productId')?.value||null;
    const quoted=await api('infinitepay/quote',{method:'POST',body:{amount,productId}});
    const key=crypto.randomUUID();
    const result=await api('infinitepay/create',{method:'POST',body:{
      amount,totalCharge:quoted.quote.totalCharge,productId,
      serviceDescription:field('description').value,name:field('name').value,email:field('email').value,confirmed:field('confirmed').checked,
    },});
    if(!result.checkoutUrl) throw Error('O checkout não respondeu. Aguarde um instante e tente novamente.');
    sessionStorage.setItem('pixai-operation-'+result.id,result.accessToken);
    location.assign(result.checkoutUrl);
  } catch(error) {
    alertUser(error.message);button.disabled=false;button.textContent=(bootstrap.content?.buttonLabel||'Continuar para o pagamento')+' →';
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
    const complete=['COMPLETED','DELIVERED','PAYMENT_CONFIRMED'].includes(operation.status);
    const quote=operation.quote||{};
    main.innerHTML=`<section class="panel centered">
      <div class="result-head"><div class="result-icon ${complete?'':'pending'}">${complete?'✓':'…'}</div><h1>${complete?'Pagamento confirmado':'Pagamento em processamento'}</h1><p>${complete?'O pagamento do serviço foi registrado com sucesso.':'A InfinitePay ainda está processando ou aguardando o pagamento.'}</p></div>
      <div class="review-box">
        <div class="row"><span>Opção</span><strong>${esc(quote.productName||'Serviço')}</strong></div>
        <div class="row"><span>Serviço</span><strong>${esc(quote.serviceDescription||'Serviço')}</strong></div>
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
const contentFields=[
  ['eyebrow','Chamada superior'],['title','Título principal'],['subtitle','Texto de apresentação'],
  ['formTitle','Título do formulário'],['formHelp','Orientação do formulário'],
  ['descriptionLabel','Rótulo da descrição'],['descriptionPlaceholder','Exemplo da descrição'],
  ['amountLabel','Rótulo do valor'],['nameLabel','Rótulo do nome'],['emailLabel','Rótulo do e-mail'],['buttonLabel','Texto do botão'],
];
function contentEditor(key,label,value) {
  const wide=['subtitle','formHelp'].includes(key),tag=wide?'textarea':'input';
  return `<div class="${wide?'wide':''}"><label for="content-${key}">${label}</label>${tag==='textarea'?`<textarea id="content-${key}" data-content="${key}" maxlength="300" required>${esc(value)}</textarea>`:`<input id="content-${key}" data-content="${key}" maxlength="300" value="${esc(value)}" required>`}</div>`;
}
function productEditor(product) {
  return `<div class="product-editor" data-product-row data-id="${esc(product.id)}">
    <div class="product-editor-head"><strong>${esc(product.name||'Novo produto')}</strong><button class="btn text remove-product" type="button">Remover</button></div>
    <div class="form-grid">
      <div><label>Nome</label><input data-product-field="name" maxlength="100" value="${esc(product.name)}" required></div>
      <div><label>Preço</label><div class="money-field"><span>R$</span><input data-product-field="price" inputmode="decimal" value="${product.price==null?'':(product.price/100).toFixed(2).replace('.',',')}" ${product.customPrice?'disabled':''}></div></div>
      <div class="wide"><label>Descrição</label><input data-product-field="description" maxlength="160" value="${esc(product.description)}" required></div>
    </div>
    <div class="product-checks"><label class="check-label"><input data-product-field="active" type="checkbox" ${product.active?'checked':''}><span>Disponível na página</span></label><label class="check-label"><input data-product-field="customPrice" type="checkbox" ${product.customPrice?'checked':''}><span>Cliente informa o valor</span></label></div>
  </div>`;
}
function wireProductRows() {
  document.querySelectorAll('[data-product-row]').forEach(row=>{
    row.querySelector('.remove-product').onclick=()=>row.remove();
    const custom=row.querySelector('[data-product-field="customPrice"]'),price=row.querySelector('[data-product-field="price"]');
    custom.onchange=()=>{price.disabled=custom.checked;if(custom.checked)price.value='';};
  });
}
async function adminDashboard() {
  main.innerHTML='<div class="loading">Carregando pagamentos…</div>';
  try {
    const [configuration,data]=await Promise.all([api('infinitepay/admin/config',{admin:true}),api('infinitepay/admin/operations',{admin:true})]);
    const operations=data.operations||[],completed=operations.filter(item=>['COMPLETED','DELIVERED','PAYMENT_CONFIRMED'].includes(item.status));
    const volume=completed.reduce((sum,item)=>sum+(item.quote.serviceAmount??item.quote.totalCharge??0),0);
    main.innerHTML=`<section class="admin-settings"><div class="admin-top"><div><div class="eyebrow">InfinitePay</div><h1>Painel de pagamentos</h1></div><button id="logout" class="btn secondary">Sair</button></div>
      <div class="metric-grid"><div class="metric"><span>Pagamentos</span><strong>${operations.length}</strong></div><div class="metric"><span>Confirmados</span><strong>${completed.length}</strong></div><div class="metric"><span>Volume confirmado</span><strong>${money(volume)}</strong></div><div class="metric"><span>Integração</span><strong>${configuration.serverEnabled&&configuration.value.enabled?'Ativa':'Pausada'}</strong></div></div>
      <form id="config-form">
        <section class="panel" style="margin-top:25px"><h2>Pagamento e limites</h2><p>Todas as alterações são aplicadas à página pública após salvar.</p><div class="form-grid">
          <div><label for="handle">InfiniteTag</label><input id="handle" name="handle" maxlength="80" value="${esc(configuration.value.handle)}" required><p class="field-help">Sem o símbolo $.</p></div>
          <div><label for="service-label">Rótulo do catálogo</label><input id="service-label" name="service-label" maxlength="100" value="${esc(configuration.value.serviceLabel)}" required></div>
          <div><label for="min-amount">Valor mínimo</label><div class="money-field"><span>R$</span><input id="min-amount" name="min-amount" inputmode="decimal" value="${(configuration.value.minAmount/100).toFixed(2).replace('.',',')}" required></div></div>
          <div><label for="max-amount">Valor máximo</label><div class="money-field"><span>R$</span><input id="max-amount" name="max-amount" inputmode="decimal" value="${(configuration.value.maxAmount/100).toFixed(2).replace('.',',')}" required></div></div>
        </div><label class="check-label"><input id="enabled" name="enabled" type="checkbox" ${configuration.value.enabled?'checked':''}><span>Aceitar novos pagamentos</span></label></section>
        <section class="panel" style="margin-top:25px"><h2>Textos e campos da página</h2><div class="form-grid">${contentFields.map(([key,label])=>contentEditor(key,label,configuration.value.content[key])).join('')}</div></section>
        <section class="panel" style="margin-top:25px"><div class="admin-top"><div><h2>Produtos e serviços</h2><p>Crie preços fixos ou deixe o cliente informar o valor.</p></div><button id="add-product" class="btn secondary" type="button">+ Adicionar</button></div><div id="product-list">${configuration.value.products.map(productEditor).join('')}</div></section>
        <button class="btn full save-admin" type="submit">Salvar todas as alterações</button>
      </form>
      <section class="panel" style="margin-top:25px"><h2>Pagamentos e entregas</h2><div class="table-wrap">${operations.length?`<table><thead><tr><th>Data</th><th>Produto</th><th>Serviço</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead><tbody>${operations.map(item=>`<tr><td>${when(item.createdAt)}</td><td>${esc(item.quote.productName||'Registro anterior')}</td><td>${esc(item.quote.serviceDescription||'Registro anterior')}</td><td>${money(item.quote.serviceAmount??item.quote.totalCharge)}</td><td>${esc(statusLabel[item.status]||item.status)}${item.deliveredAt?`<br><small>${when(item.deliveredAt)}</small>`:''}</td><td><button class="btn text detail" data-id="${esc(item.id)}">Cliente</button>${item.status==='COMPLETED'?`<button class="btn text delivery" data-id="${esc(item.id)}">Confirmar entrega</button>`:''}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Nenhum pagamento registrado.</div>'}</div></section>
      <dialog id="delivery-dialog" class="delivery-dialog"><form id="delivery-form" method="dialog"><div class="admin-top"><h2>Validar entrega</h2><button class="btn text" value="cancel" type="button" id="close-delivery">Fechar</button></div><p>Registre quem conferiu e o comprovante, protocolo ou observação da entrega.</p><input type="hidden" name="id"><label for="delivery-operator">Responsável</label><input id="delivery-operator" name="operator" maxlength="100" required><label for="delivery-reference" style="margin-top:16px">Comprovante ou observação</label><textarea id="delivery-reference" name="reference" maxlength="200" required></textarea><label class="check-label"><input name="confirmed" type="checkbox" required><span>Confirmo que o produto ou serviço foi entregue ao cliente.</span></label><button class="btn full" type="submit">Validar entrega</button></form></dialog>
    </section>`;
    document.querySelector('#logout').onclick=()=>{sessionStorage.removeItem('pixai-admin-token');adminToken='';adminLogin();};
    wireProductRows();
    document.querySelector('#add-product').onclick=()=>{
      const list=document.querySelector('#product-list'),wrapper=document.createElement('div');
      wrapper.innerHTML=productEditor({id:'produto-'+Date.now().toString(36),name:'Novo produto',description:'Descrição do produto ou serviço',price:configuration.value.minAmount,active:true,customPrice:false});
      list.append(wrapper.firstElementChild);wireProductRows();
    };
    document.querySelector('#config-form').addEventListener('submit',async event=>{
      event.preventDefault();
      try {
        const elements=event.currentTarget.elements;
        const content=Object.fromEntries(contentFields.map(([key])=>[key,document.querySelector(`[data-content="${key}"]`).value]));
        const products=[...document.querySelectorAll('[data-product-row]')].map(row=>{
          const field=name=>row.querySelector(`[data-product-field="${name}"]`),customPrice=field('customPrice').checked;
          return {id:row.dataset.id,name:field('name').value,description:field('description').value,price:customPrice?null:amountFrom(field('price').value),active:field('active').checked,customPrice};
        });
        await api('infinitepay/admin/config',{method:'PUT',admin:true,body:{revision:configuration.revision,value:{
          handle:elements.namedItem('handle').value,serviceLabel:elements.namedItem('service-label').value,enabled:elements.namedItem('enabled').checked,
          minAmount:amountFrom(elements.namedItem('min-amount').value),maxAmount:amountFrom(elements.namedItem('max-amount').value),content,products,
        }}});
        alertUser('Página, campos e produtos atualizados.');adminDashboard();
      }
      catch(error){alertUser(error.message);}
    });
    document.querySelectorAll('.detail').forEach(button=>button.onclick=async()=>{
      try {const detail=await api('infinitepay/admin/recipient',{method:'POST',admin:true,body:{id:button.dataset.id}});alertUser(`${detail.name} — ${detail.email} — ${detail.serviceDescription||'Serviço'}`);}
      catch(error){alertUser(error.message);}
    });
    const deliveryDialog=document.querySelector('#delivery-dialog'),deliveryForm=document.querySelector('#delivery-form');
    document.querySelector('#close-delivery').onclick=()=>deliveryDialog.close();
    document.querySelectorAll('.delivery').forEach(button=>button.onclick=()=>{deliveryForm.reset();deliveryForm.elements.namedItem('id').value=button.dataset.id;deliveryDialog.showModal();});
    deliveryForm.addEventListener('submit',async event=>{
      event.preventDefault();const elements=event.currentTarget.elements;
      try {await api('infinitepay/admin/delivered',{method:'POST',admin:true,body:{id:elements.namedItem('id').value,operator:elements.namedItem('operator').value,reference:elements.namedItem('reference').value,confirmed:elements.namedItem('confirmed').checked}});deliveryDialog.close();alertUser('Entrega validada.');adminDashboard();}
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
const promo=document.querySelector('#promo-popup');
if(promo){promo.addEventListener('click',()=>promo.remove());document.addEventListener('keydown',event=>{if(event.key==='Escape')promo.remove();},{once:true});}
api('infinitepay/bootstrap').then(data=>{bootstrap=data;setEnv();route();}).catch(error=>{setEnv();home();alertUser(error.message);});
