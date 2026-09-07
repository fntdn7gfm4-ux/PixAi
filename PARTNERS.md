# Provedor de pagamento

O projeto utiliza somente o Checkout Integrado InfinitePay para receber pagamentos dos serviços prestados pelo negócio.

- InfiniteTag: `lucas-banza`.
- Criação: `POST /links`.
- Confirmação: `POST /payment_check`.
- Formas aceitas pela aplicação: Pix e cartão, conforme disponibilidade apresentada no checkout.

O projeto não oferece saque, repasse, carteira, crédito ou conversão de cartão em Pix.
