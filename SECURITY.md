# Segurança

- Nenhum número de cartão ou CVV passa pelo site; esses dados ficam no checkout InfinitePay.
- Valores usam centavos inteiros e são recalculados no servidor dentro do limite configurado.
- Criação de checkout é idempotente para impedir duplicações em repetição de rede.
- Dados de cliente armazenados são cifrados com AES-GCM.
- Links de acompanhamento usam um segredo por operação armazenado apenas como resumo criptográfico.
- Webhooks não são confiados isoladamente; cada confirmação é consultada na API InfinitePay e conferida pelo valor.
- Referências de transação têm unicidade no banco para impedir reutilização.
- Rotas administrativas usam token forte e comparação em tempo constante.
- Limites de requisição e cabeçalhos de proteção são aplicados pelo Worker.

Operação recomendada: manter segredos somente no ambiente hospedado, rotacionar o token administrativo, preservar backups, revisar registros com status incerto e manter um procedimento de incidentes e reembolsos.
