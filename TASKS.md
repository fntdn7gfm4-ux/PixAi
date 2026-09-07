# Estado da entrega e caminho para produção

Atualização Asaas: [LAUNCH.md](LAUNCH.md) detalha a integração implementada e as pendências ainda necessárias. O checklist abaixo é o histórico da primeira demonstração, não uma afirmação de que a integração Asaas esteja homologada.

## Concluído

- [x] Substituir runtime legado e cadastro com senha pela jornada web de teste sem conta.
- [x] Implementar Pricing Engine backend, ofertas, outro valor, margem e arredondamento.
- [x] Persistir configurações, cotações, operações simuladas, sessões e auditoria.
- [x] Recalcular ao confirmar; aplicar idempotência e validade da cotação.
- [x] Exercitar sucesso, cartão recusado, análise e falha Pix sem movimentação financeira.
- [x] Criar recibo de teste e consulta por desafio limitado à sessão.
- [x] Painel administrativo, preços e preparação de configurações de parceiros.
- [x] Adicionar logo oficial e documentar limitações.
- [x] Testes de preços, estados, segurança de API e cenários.

## Exige parceiro e homologação — não implementado como serviço real

- [ ] Aprovação comercial do modelo cartão → Pix e definição da instituição responsável.
- [ ] Adaptador oficial de cartão/Pix, taxas reais, funding, tokenização e 3DS.
- [ ] KYC/AML, identificação real, validação do destinatário e antifraude.
- [ ] OTP real por e-mail, comprovante automático e outbox idempotente.
- [ ] Webhooks oficiais assinados, proteção contra replay e conciliação.
- [ ] Limites por CPF, token de cartão, dispositivo, chave Pix e recebedor.
- [ ] Revisão manual operacional, chargebacks, estornos e compensações.
- [ ] Ambientes isolados de homologação e produção, backups e observabilidade.
- [ ] Política LGPD final, identidade administrativa com MFA e avaliação jurídica/CET.
- [ ] Pentest e testes fim a fim com as APIs oficiais antes de movimentar valores reais.
