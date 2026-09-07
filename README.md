# PixAI — portal de pagamento de serviços

Aplicação web para cobrar serviços previamente orçados ou contratados. O cliente seleciona uma opção, informa nome, e-mail e CPF — além do valor quando escolher a opção personalizada — e conclui o pagamento no checkout hospedado da InfinitePay. O celular também pode ser coletado no portal e enviado pronto para o checkout, evitando que a InfinitePay peça esse dado de novo; pode ser desligado pelo painel.

## Fluxo em produção

- Valores permitidos: R$ 20 a R$ 250.
- InfiniteTag: `lucas-banza` (sem `$` na integração).
- O valor exibido ao cliente já é o valor final enviado ao checkout: preço do serviço mais a taxa estimada do cartão e a margem mínima de lucro (30% por padrão, ajustável no painel).
- Pix e cartão são oferecidos conforme a configuração da conta InfinitePay.
- O site nunca recebe número do cartão ou CVV.
- Webhook e retorno do checkout acionam uma consulta `payment_check`; nenhum campo `paid` recebido por webhook é aceito sem conferência direta.
- Dados de identificação persistidos são criptografados.
- A conclusão do pagamento é separada do escopo e do prazo do serviço, que continuam regidos pelo orçamento ou contrato.

## Operação

O painel em `/admin.html` usa `ADMIN_TOKEN` e permite pausar novas cobranças, ajustar a InfiniteTag, limites, todos os textos e rótulos da página, além de criar, editar, ativar ou remover produtos e serviços com preço fixo ou valor livre. Pagamentos confirmados podem ter a entrega validada com responsável, data e comprovante ou observação. O recebimento segue o plano configurado na conta InfinitePay; o sistema não faz repasse, saque ou conversão de cartão em Pix.

O catálogo inicial tem cinco opções editáveis: R$ 20, R$ 50, R$ 100, R$ 250 e uma opção de valor personalizado.

Para executar localmente: `npm run dev`. Para validar: `npm run check`.

Veja [LAUNCH.md](LAUNCH.md) para a configuração de publicação e [SECURITY.md](SECURITY.md) para os controles aplicados.
