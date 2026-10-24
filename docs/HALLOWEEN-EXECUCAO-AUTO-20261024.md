# Halloween — execução do plano automático aprovado

24/10/2026. Worktree isolada D:/projetos/tecnocell-pdv-safe-1910/.git/halloween-paid-os; alterações anteriores preservadas. Nenhum acesso a E:.

Regras: escolha manual Halloween por item no PDV para qualquer cliente, sem vale; acompanhamento automático; margem bruta receita após descontos menos custo snapshot no servidor, sem taxas/impostos/despesas. Meta>=700 por loja; unlocked_at persistente mesmo após devolução. Público visualmente inalterado. Estoque global promocional não multiplicado por loja, ERP baixa apenas pelo fluxo normal.

Contrato: novas RPCs halloween_pdv_rules(service), finalizar_venda_halloween(service) com p_operation e metadados opcionais em p_itens; halloween_margin_state(staff) com filtros e reconciliação, rotina privada de apuração por loja e gate de sorteio baseado em ticket.loja_id. Detalhes e testes em docs/HALLOWEEN-AUTO-BACKEND-20261024.md ao concluir.

Protótipo rejeitado e sua migração não aplicada retirados dos diretórios executáveis, arquivados como texto em docs/archive/halloween-manual-rejected. Não publicar aquilo.

Decisões: outras promoções em itens diferentes continuam permitidas; Halloween não acumula desconto manual no próprio item ou desconto geral. Seus descontos vão como desconto_item, demais descontos promocionais permanecem no total agregado antigo e são identificados por linha para não descontá-los da margem Halloween. Chave de tentativa é persistida junto ao rascunho da aba por operador, sem segredos. Mudança após tentativa ambígua não pode gerar chave nova e duplicar venda silenciosamente.

Entrega coordenada: testes isolados e revisão primeiro, aviso antes de qualquer publicação, sem ativação automática ou fixture financeira na empresa.

## Alteração solicitada durante execução — brindes por loja e surpresa

Teresópolis terá dois brindes gratuitos diferentes: código05090 KIT CHAVE YAXUN COMPLETO YX-6028; código12151 VENTOSA COMPLETA PROFISSIONAL YAXUN YX-A34, identificada na foto. Petrópolis mantém iCharge8Pro e Sunshine. Não são descontos nem preços de cobrança. Consulta somente leitura no Cloud confirmou05090 com preço131/custo49,97 e12151 com preço220/custo170; o preço72 informado pelo dono para o kit não foi usado como custo nem alterado no ERP. Estoque físico da promoção não foi confirmado por essa consulta.

Remover do público lista/modelos/imagens que antecipem prêmios; roda fica decorativa/surpresa, produto real só no resultado. API pública também não deve antecipar catálogo completo; internamente equipe mantém informações. Loja do token/ticket controla catálogo e saldo, não parâmetro manipulável pelo cliente. Nenhum giro novo/estoque fictício ou ativação decorrente dessa mudança.

Revisão independente encontrou: (1) devolução em compra com outra promoção usando desconto agregado incorreto; (2) replay reatribuindo caixa e dependendo do caixa atual aberto; (3) agregados NULL de custo ocultando pendência. Correções em andamento com novos testes. Preflight de replay já testado no server action antes de preços/caixa, sem mutações financeiras posteriores. Não publicar até re-revisão e suíte atualizadas.

## Conferência local realizada nesta etapa

- Navegador Chrome, prévia `http://127.0.0.1:4190/pdv?rev=2`, dados fictícios e rede do Cloud substituída por fixtures: produto KA-960 entrou a R$83 sem Halloween automático; selecionar Halloween aplicou15% e preço líquidoR$70,55; campos de desconto extra ficaram bloqueados; fechamento gerou payload com regra/versão, desconto_item12,45, desconto geral0 e UUID de operação; comprovante persistido exibiuR$70,55. Nenhuma venda na empresa.
- Painel local conferido com R$700 liberado em uma loja e R$300 na outra; configuração dos dois Yaxun de Teresópolis separada e inicialmente0/desabilitada. Quantidades locais são exemplos, não confirmação física.
- Consulta real SOMENTE LEITURA em24/10 confirmou campanha active=false/stock_confirmed=false, extensões pgcrypto e pg_cron presentes, issue_os_manual existente e ausência das três migrações consultadas (020821,061236,190000); a extensão200000 é nova nesta etapa. Nenhuma migração aplicada até esta nota.
- Vault Obsidian no caminho configurado pelo AGENTS.md não existe neste computador. Continuidade preservada nos documentos deste repositório; nenhum segredo registrado.

## Aceite operacional após publicação (sem venda fictícia em produção)

1. Entrar com funcionário ativo no domínio definitivo e abrir Promoções → Halloween em cada loja.
2. Confirmar lojas, catálogo privado correto (Teresópolis05090/12151, Petrópolis anteriores), metaR$700 e ausência de erro de sincronização. Não confirmar estoque sem separar unidades reais.
3. No PDV, consultar produto elegível e verificar que Halloween só aparece como escolha manual durante período ativo; preparar e cancelar carrinho sem fechar venda financeira de teste.
4. Na primeira venda REAL participante, selecionar Halloween no produto, confirmar preço e pagamento normal. Conferir participação automática e uma única baixa; não digitar novamente a venda.
5. Não ativar antes de confirmar estoques físicos e logística. Site público só mostra produto real após sorteio; meta fica interna.

## Verificação final antes da publicação

Build `next build --webpack` terminou com exit0 (TypeScript e109 páginas). Houve avisos de fonte/workspace e falhas de consulta de integrações MercadoLivre durante geração; essas páginas não fazem parte desta mudança e o build concluiu. Testes UI/módulo e PostgreSQL17 isolado passaram; re-revisão independente sem bloqueadores após correções. Checkout não soma histórico; cron/painel fazem reconciliação. Cron usa SET statement_timeout10s e lock_timeout3s na conexão antes da chamada.

Homologação REAL em transação com ROLLBACK executada com as quatro migrações:11regras,4allocações (2porloja),saldo0,active=false,stock_confirmed=false e job de1minuto configurado com limites. Consulta posterior confirmou rollback (tabela nova ausente e0jobs persistidos). Nova revisão sem soma no checkout foi novamente homologada com rollback, comando de cron conferido. Nenhuma fixture financeira foi levada à empresa.

Branch nova codex/halloween-auto-promocoes-20261024 criada na worktree existente e atualizada por fast-forward à main remota c55a278, preservando os5 arquivos financeiros novos do dono. Sem force-push. Arquivos de proposta visual e notas antigas fora do escopo permaneceram locais.
