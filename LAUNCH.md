# Preparação Asaas — 6 de setembro de 2026

Estado: integração técnica em preparação. A publicação continua com `PAYMENTS_ENABLED=false`; não confundir credencial configurada com operação homologada.

Interface pública: referências à demonstração e seus fluxos foram retirados. A página informa a indisponibilidade de novos pagamentos até a liberação. Webhook de eventos criado no Asaas e habilitado para este site; autorização de saques ainda requer configuração/homologação separada.

## Decisões do responsável

- Capital próprio para antecipar o Pix, sem contratar antecipação automática do Asaas.
- Limite agregado inicial: R$ 1.000 em principal Pix ainda não liquidado pelo cartão.
- Reserva mínima de saldo: R$ 0, por instrução do responsável. Tarifas continuam exigindo saldo além do principal.
- Margem mínima do lançamento: lucro / total cobrado >= 30%, após tarifas e custos configurados. O cálculo anterior da demonstração usa lucro / principal Pix; é mantido apenas no simulador legado.

## Conferido na conta, somente leitura

Cadastro e documentos aprovados. Consulta autenticada de tarifas retornou HTTP 200. Cartão: 2,99% à vista, 3,49% de 2 a 6 parcelas, 3,99% de 7 a 12 parcelas, mais R$ 0,49; recebimento em 32 dias. API informou Pix de saída R$ 2,00, sujeito à franquia mensal. O motor provisiona tarifas normais, sem depender de descontos/franquias, e conservadoramente R$ 0,49 por parcela até homologar a alocação exata. Tributos, custo operacional e perdas não foram confirmados.

## Fluxo implementado

1. Consulta de tarifas oficiais, cotação em centavos, limite por operação e recálculo ao confirmar.
2. Reserva única da cotação ANTES do POST de checkout. Em resultado incerto, a operação não é recriada automaticamente.
3. Checkout hospedado Asaas com INSTALLMENT e limite de parcelas. O pagador pode escolher menos parcelas no checkout; o total cotado não muda.
4. Webhook autenticado pelo token específico, corpo limitado e inbox cifrada. Eventos são concluídos só após conciliação; administrador pode reprocessar pendentes.
5. Busca das cobranças pelo checkout no Asaas, conferência de cliente, cartão, IDs e soma total. Confirmação não é liquidação. Chargebacks/estornos posteriores permanecem visíveis.
6. Pix com capital próprio só após todas as parcelas confirmadas, revisão humana documentada de identidade/antifraude, saldo para Pix + tarifa + reserva e limite agregado. Saídas são serializadas. CPF como única modalidade de chave nesta implantação; consulta mascarada não é KYC nem comprova titularidade do cartão.
7. Autorização de saque exige ID previamente registrado, valor exato e chave em bankAccount.pixAddressKey. Ausência/divergência recusa. Este mecanismo precisa ser ativado e homologado no Asaas antes de liberar pagamentos.
8. Timeout não provoca nova transferência: PIX_UNCERTAIN mantém exposição e exige conciliação operacional. Liquidação libera exposição; conclusão do Pix não a libera.

## Painel

`/#admin` → Integrações exibe pendências e operações Asaas. Atualização e conciliação são de leitura financeira. A solicitação de Pix exige formulário separado, referência de revisão, valor visível e aceite. Não preencha referências com valores fictícios. O token administrativo atual ainda não equivale a MFA corporativo.

Endpoints do parceiro:

- Eventos: `/api/real/webhooks/payment`.
- Autorização de saque: `/api/real/webhooks/authorize`.
- Tokens distintos, no servidor. Nunca usar a chave de API como token do webhook.

## Pendências reais antes do lançamento

- Aprovação documentada do Asaas para o modelo específico cartão → Pix ao pagador; cadastro aprovado por si só não comprova isso.
- Razão social/CNPJ, suporte, termos, política de privacidade, regime tributário e custos de operação.
- Capital efetivamente disponível na conta; configurar limite não deposita dinheiro.
- Sandbox Asaas separado, testes com checkout e webhooks reais do sandbox, inclusive parcelamento, eventos fora de ordem, erro de transferência e disputa.
- Processo verificável de identidade e titularidade do cartão antes da cobrança; integração OTP/e-mail, recuperação de sessão e comprovantes reais ainda pendentes. Revisão manual posterior ao pagamento não substitui esse desenho.
- Homologar associação dos eventos e formato do destinatário da transferência na conta; não flexibilizar validação quando os campos faltarem.
- Reconciliação operacional de estados incertos, monitoramento recorrente, reprocessamento com agendamento, backups e recuperação de desastres.
- Administração com MFA, auditoria de acesso e revisão de segurança/LGPD.

## Ativação e reversão

Ambientes Asaas e APP_ENV devem corresponder para criar cobranças. Requisitos estão em `server/readiness.mjs`. As referências de aprovação são registros de evidência, não botões que substituem as atividades acima. Não configurar PAYMENTS_ENABLED=true até concluir as pendências. Para pausar novas cobranças, definir false e publicar; webhooks e consulta de operações existentes continuam atendidos. Não apagar a chave AES nem reverter migrações com dados.

Hospedagem principal permanece Sites (.openai/hosting.json). wrangler.toml é alternativa ainda não provisionada e não deve ser usada para este deploy.

## Preparação InfinitePay

O Checkout Integrado InfinitePay também está preparado como alternativa de recebimento. A InfiniteTag informada pelo responsável é `lucas-banza` (sem o prefixo `$`, como exigido pela API). O painel administrativo permite registrar a conferência de tarifas, o plano de recebimento e o prazo de atendimento antes de habilitar a integração.

O servidor cria links com `order_nsu`, `redirect_url` e `webhook_url`, mas nunca confia isoladamente no retorno do navegador ou no corpo do webhook: a confirmação é refeita em `/payment_check` e deve coincidir com o pedido e o valor registrados. O Pix permanece manual e só pode ser marcado como enviado após o recebimento líquido ser conferido pelo operador.

`INFINITEPAY_ENABLED=false` continua obrigatório até a revisão comercial, operacional e jurídica. A documentação pública não oferece um ambiente sandbox separado nem uma API de transferência Pix neste fluxo; por isso, testes de pagamento devem usar os recursos oficialmente disponibilizados pela conta, e o envio ao destinatário não é automatizado.

## Documentação oficial

- https://docs.asaas.com/docs/checkout-para-cart%C3%A3o-de-cr%C3%A9dito
- https://docs.asaas.com/reference/listar-cobrancas
- https://docs.asaas.com/reference/recuperar-taxas-da-conta
- https://docs.asaas.com/docs/webhook-para-cobrancas
- https://docs.asaas.com/docs/mecanismo-para-validacao-de-saque-via-webhooks

## Painel separado e testes administrativos

Acesse /admin.html e autentique com ADMIN_TOKEN. A aba Pendências salva rascunhos parciais privados, com controle de versão, incluindo contatos, custos e minutas dos documentos. Preenchê-los não ativa pagamentos nem publica os textos automaticamente. A aba Testar fluxo executa cinco cenários simulados sem chamar o Asaas ou movimentar dinheiro, inclusive espera por saldo zero.

