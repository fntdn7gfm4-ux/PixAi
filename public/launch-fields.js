export const launchGroups = [
  {title:'Empresa e atendimento',fields:[
    ['legalName','Nome empresarial','text'],['tradeName','Marca / nome fantasia','text'],['cnpj','CNPJ','text'],['businessAddress','Endereço comercial público','text'],['supportEmail','E-mail de suporte','email'],['privacyEmail','E-mail de privacidade','email'],['publicPhone','Telefone público','text'],
  ]},
  {title:'Tributos, custos e capital',fields:[
    ['taxRegime','Regime tributário','text'],['taxBasis','Fundamento / confirmação do contador','textarea'],['taxRate','Tributos sobre a cobrança (%)','number'],['monthlyTaxCost','DAS e tributos fixos mensais (R$)','number'],['monthlyOperatingCost','Outros custos mensais (R$)','number'],['perOperationCost','Custo operacional por transação (R$)','number'],['fraudCostRate','Provisão de perdas por fraude (%)','number'],['minimumMargin','Margem mínima sobre cobrança (%)','number'],['capitalLimit','Capital máximo comprometido (R$)','number'],['balanceReserve','Reserva de saldo (R$)','number'],['fundingPlan','Como será feito o aporte de saldo','textarea'],
  ]},
  {title:'Homologação e operação',fields:[
    ['businessApproval','Protocolo / referência da aprovação do modelo no Asaas','textarea'],['businessActivityReview','Revisão do CNAE e enquadramento da atividade','textarea'],['identityProcess','Identificação e titularidade do cartão','textarea'],['antiFraudProcess','Regras de antifraude e revisão','textarea'],['withdrawalAuthorization','Configuração e evidência da autorização de saques','textarea'],['homologationReport','Relatório de testes com o sandbox Asaas','textarea'],['paymentDeadline','Prazo máximo para envio do Pix','text'],['refundProcess','Cancelamento, estorno e prazo de resposta','textarea'],['emailSetup','OTP, mensagens e comprovantes: fornecedor e estado','textarea'],['adminMfa','MFA e gestão dos administradores','textarea'],['monitoring','Monitoramento e conciliação de pendências','textarea'],['backups','Backup e teste de recuperação','textarea'],['retention','Prazos e rotina de retenção/exclusão','textarea'],['legalReview','Referência da revisão dos termos e privacidade','textarea'],
  ]},
  {title:'Documentos para revisão',fields:[['termsText','Termos de uso — minuta editável','document'],['privacyText','Política de privacidade — minuta editável','document']]},
];
