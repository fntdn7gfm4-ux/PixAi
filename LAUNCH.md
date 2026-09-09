# Publicação InfinitePay — 7 de setembro de 2026

## Configuração adotada

- Modelo: pagamento dos serviços prestados pelo próprio negócio.
- InfiniteTag: `lucas-banza`.
- Referência informada de autorização: `IP-2314a3254x83`.
- Valor mínimo: R$ 20,00.
- Valor máximo: R$ 250,00.
- Recebimento: conforme o plano “na hora” configurado na conta InfinitePay.
- Ambiente: site público, ainda sem divulgação, para testes com recursos do titular.

## Jornada

1. Cliente seleciona uma opção e informa nome, e-mail, CPF e celular (celular pode ser desativado no painel); a quinta opção também solicita o valor personalizado.
2. O servidor recalcula e valida o limite, então soma a taxa estimada do cartão e a margem mínima de lucro (30% por padrão) ao valor do serviço para chegar no total cobrado.
3. O servidor cria um link do Checkout Integrado InfinitePay com um identificador único.
4. Cliente escolhe Pix ou cartão e eventuais parcelas no checkout da InfinitePay.
5. No retorno ou webhook, o servidor consulta `payment_check` usando o identificador da operação e as referências da transação.
6. Somente uma resposta paga, com valor integral e forma aceita, conclui o pagamento.

## Segurança operacional

Não solicitar cartão, CVV ou senha por mensagem. Em resultado incerto, consultar o pagamento antes de gerar uma nova cobrança. Para pausar imediatamente novas cobranças, desmarcar “Aceitar novos pagamentos” no painel ou definir `INFINITEPAY_ENABLED=false` e republicar.

O site registra pagamentos, mas não define automaticamente o escopo, prazo, cancelamento ou reembolso do serviço. Essas condições devem constar no orçamento ou contrato enviado ao cliente.

Documentação técnica oficial: https://www.infinitepay.io/checkout-documentacao
