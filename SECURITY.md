# Segurança e limites do sandbox

## Controles implementados

- Nenhum campo PAN, CVV, documento real ou chave Pix real é aceito pela API de demonstração. Campos adicionais são rejeitados.
- Dinheiro em centavos; o servidor emite e recalcula preços, verifica margem, expiração, revisão e sessão da cotação.
- Confirmação explícita antes de criar a operação de teste. Unicidade da cotação e da idempotency key no banco; tentativa de reutilização com dados diferentes é recusada.
- Sessão aleatória em cookie HttpOnly/Secure/SameSite=Strict; sem segredos em localStorage. Segredo administrativo apenas em memória da aba.
- Preparação de statements SQL e transações em lote para operação + auditoria.
- Contadores atômicos por IP resumido, sessão, cotações, confirmação e tentativas administrativas/consulta.
- Desafios de consulta com digest, expiração de cinco minutos, cinco tentativas e consumo único atômico. **O código exibido na tela não é autenticação real; consulta restrita à mesma sessão de demonstração.**
- CSP, negação de frames, proteção MIME, política de referência, restrição de permissões e validação de origem em mutações.
- Alteração de preços exige credencial administrativa e versão correta da configuração.
- Todos os endpoints de produção, pagamento e webhook estão bloqueados. Há um verificador HMAC unitariamente testado como base; ele não representa integração ou validação de nenhum PSP real.

## Antes da produção

Implementar identidade administrativa com MFA/RBAC, gerenciamento/rotação de segredos, PII cifrada, retenção, auditoria externa imutável, OTP de e-mail real, identidade verificada, limites por CPF/cartão/dispositivo/recebedor/chave e antifraude do parceiro. Adicionar outbox de e-mails, filas e reconciliação de pagamentos/Pix, regras contra replay de eventos oficiais e observabilidade sem PII. Completar revisão LGPD, pentest, backups/restauração e plano de incidentes.

O banco do sandbox não é um ledger financeiro. Não reusar dados de teste em produção. Não inserir dados de clientes até completar essas dependências.

## Credencial compartilhada no histórico

A credencial GitHub fornecida pelo usuário foi usada apenas de forma temporária no processo, sem ser gravada em arquivo de projeto, remote ou configuração Git. Ela precisa ser revogada em https://github.com/settings/tokens após o envio. A chave administrativa desta entrega é distinta e não foi adicionada ao repositório.
