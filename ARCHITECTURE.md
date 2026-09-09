# Arquitetura

O navegador coleta os dados do serviço e solicita uma cotação ao Worker. O Worker valida valor e campos, cria um identificador idempotente, criptografa os dados do cliente no D1 e solicita o link ao Checkout Integrado InfinitePay.

O cliente informa os dados financeiros somente no checkout hospedado. O retorno e o webhook não são tratados como prova isolada: eles acionam `payment_check`, e a operação só passa para `COMPLETED` quando o provedor confirma pagamento integral por Pix ou cartão.

O painel administrativo consulta operações e pode pausar novas cobranças. Registros antigos do protótipo permanecem no banco para preservar histórico, mas não participam da jornada pública atual.
