export const launchGroups = [
  {title:'Empresa e atendimento',fields:[
    ['legalName','Nome empresarial','text'],['tradeName','Marca / nome fantasia','text'],['cnpj','CNPJ','text'],['businessAddress','Endereço comercial público','text'],['supportEmail','E-mail de suporte','email'],['privacyEmail','E-mail de privacidade','email'],['publicPhone','Telefone público','text'],
  ]},
  {title:'Serviços',fields:[
    ['serviceCatalog','Serviços oferecidos e descrição','textarea'],['serviceScope','Como o escopo é aprovado','textarea'],['deliveryTerms','Prazos e condições de entrega','textarea'],['refundProcess','Cancelamento e reembolso','textarea'],
  ]},
  {title:'InfinitePay e operação',fields:[
    ['infiniteTag','InfiniteTag','text'],['businessApproval','Protocolo / referência da autorização','textarea'],['receivingPlan','Plano de recebimento','text'],['homologationReport','Relatório dos pagamentos de teste','textarea'],['monitoring','Monitoramento e conciliação','textarea'],['backups','Backup e recuperação','textarea'],['retention','Retenção e exclusão','textarea'],['legalReview','Revisão dos termos e privacidade','textarea'],
  ]},
  {title:'Documentos para revisão',fields:[['termsText','Termos de uso — minuta editável','document'],['privacyText','Política de privacidade — minuta editável','document']]},
];
