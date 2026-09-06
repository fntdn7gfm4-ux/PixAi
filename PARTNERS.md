# Parceiros para avaliação

Pesquisa em documentação oficial em 06/09/2026. Nenhuma conta foi aberta, contrato aceito, credencial gerada em nome do usuário ou transação real efetuada.

| Candidato | Evidência técnica | O que confirmar |
|---|---|---|
| Celcoin | [Pix cash-out](https://developers.celcoin.com.br/docs/pagar-e-transferir-com-pix-cashout) permite transferências para outras instituições, inclusive por chave. | Autorização explícita para cartão financiar Pix ao usuário; solução de cartão compatível, funding, KYC, 3DS, regras antifraude e condições de liquidação. |
| Zoop | [Documentação oficial](https://docs.zoop.com.br/) reúne cartão online, Banking/Pix, webhooks e chargeback. | Se o conjunto contratado permite este modelo de operação, checkout tokenizado, split/contas, responsabilidade por fraude e acesso a sandbox. |
| Pagar.me | [API de pagamentos](https://docs.pagar.me/reference/vis%C3%A3o-geral-sobre-pagamento) contempla cartão e tokens; a [página de Pix](https://docs.pagar.me/docs/pix-1) descreve recebimento de pagamentos Pix. | Não confundir receber Pix de uma compra com enviar Pix financiado por cartão. Confirmar elegibilidade do negócio e, se necessário, parceiro de cash-out separado. |

**Sugestão:** iniciar a avaliação comercial com Celcoin e Zoop, buscando um desenho autorizado para todo o fluxo; avaliar Pagar.me para a parte de cartão somente se a operação for expressamente aceita e compatível com o parceiro de saída Pix. Isso é uma sugestão de avaliação, não confirmação de habilitação ou contrato.

## Perguntas para o comercial

- Vocês permitem converter pagamento de cartão parcelado em Pix para o próprio usuário ou terceiro? Quais restrições, classificação da operação e elegibilidade?
- Quais KYC, validações de titularidade, documento, 3DS e limites são exigidos?
- Qual o prazo e custo de liquidação/antecipação? De onde sai o saldo para liberar Pix antes do recebível do cartão?
- Quem assume fraude, chargeback, estorno e Pix irreversível? Há reserva, garantia ou limite inicial?
- Quais taxas por parcela, custos fixos e custos do Pix, mínimos mensais e outros tributos/custos aplicáveis?
- Existe sandbox com tokenização, webhook assinado, conciliação e simulação de falhas?
- Qual instituição é responsável pela operação e quais divulgações contratuais/CET são exigidas?

## Configuração preparada

`.env.example` documenta os campos de segredo. No site, Administração → Integrações mostra o estado de cada serviço. Inserir credenciais não ativa produção. Depois de contratar, escolha um único desenho de integração, implemente o adaptador oficial e complete a homologação em ambiente isolado.

Não envie chaves pelo chat. Insira-as no cofre de segredos do ambiente ou no `.env` local ignorado pelo Git. Uma chave de API não substitui autorização comercial para o modelo do produto.
