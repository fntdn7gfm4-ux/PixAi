# PixAI — portal de pagamento de serviços

Aplicação web para cobrar serviços previamente orçados ou contratados. O cliente informa referência, descrição, valor, nome e e-mail e conclui o pagamento no checkout hospedado da InfinitePay.

## Fluxo em produção

- Valores permitidos: R$ 20 a R$ 250.
- InfiniteTag: `lucas-banza` (sem `$` na integração).
- O valor enviado ao checkout é exatamente o valor informado no portal.
- Pix e cartão são oferecidos conforme a configuração da conta InfinitePay.
- O site nunca recebe número do cartão ou CVV.
- Webhook e retorno do checkout acionam uma consulta `payment_check`; nenhum campo `paid` recebido por webhook é aceito sem conferência direta.
- Dados de identificação persistidos são criptografados.
- A conclusão do pagamento é separada do escopo e do prazo do serviço, que continuam regidos pelo orçamento ou contrato.

## Operação

O painel em `/admin.html` usa `ADMIN_TOKEN` e permite pausar novas cobranças, ajustar a InfiniteTag, limites, todos os textos e rótulos da página, além de criar, editar, ativar ou remover produtos e serviços com preço fixo ou valor livre. Pagamentos confirmados podem ter a entrega validada com responsável, data e comprovante ou observação. O recebimento segue o plano configurado na conta InfinitePay; o sistema não faz repasse, saque ou conversão de cartão em Pix.

O catálogo inicial tem cinco opções editáveis: R$ 20, R$ 50, R$ 100, R$ 250 e uma opção de valor personalizado. A página pública exibe a arte promocional em um popup a cada carregamento, fechado por clique ou tecla Escape.

Para executar localmente: `npm run dev`. Para validar: `npm run check`.

Veja [LAUNCH.md](LAUNCH.md) para a configuração de publicação e [SECURITY.md](SECURITY.md) para os controles aplicados.
