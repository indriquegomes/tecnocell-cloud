# Relatório atual — integração App no PDV oficial

**Rodada atual — somente local:** diagnóstico e correção de conciliação Pix preparados; 267/267 testes, TypeScript e build aprovados. Ver [CONCILIACAO-PIX-20261020.md](CONCILIACAO-PIX-20261020.md). Migration nova não aplicada e código não publicado. Produção continua na versão homologada anteriormente. Nenhuma nova venda ou automação nesta rodada.

## Publicação e homologação real em Pix — 20/10/2026

Esta seção substitui os estados anteriores de código não publicado e teste financeiro pendente.

- Autorização do titular nesta rodada: commit/push/deploy; Pix R$ 135,00; preservar fiado desabilitado; caixa existente ou abertura zero se fechado; reversão integral na mesma espécie.
- Commit da implementação: `5425257`. Merge sem alteração de conteúdo: `26b789cb9babb34b1ad453e420de0f6c803ef747`. Push normal para branch de trabalho e main, sem force/reset. Documentos locais preservados. Capturas e logs permanecem locais, sem envio de dados pessoais ao Git.
- Vercel produção **Ready**, deploy `BNPyjK68cGSMUjiwGQJw5Gjwn5CV`, alias `https://tecnocell-cloud.vercel.app`, commit `26b789c`. Navegador autenticado confirmou PDV — Frente de Caixa, banner do pedido, três itens/preços originais e controles comerciais travados. Tela paralela removida em produção.
- Caixa Petrópolis já aberto: `7ef11167-655b-4dd5-b265-ab9110165bb3`, abertura R$ 200,00. Nenhum novo caixa aberto ou caixa fechado.
- Venda real de homologação **#8414**, ID `aa4482d0-f479-4507-b5c6-cc45165d6271`, 20/10/2026 09:16:47 BRT; três itens, Pix pago R$ 135,00; depósito PETRÓPOLIS LOJA. Pedido passou a confirmado/pago. Venda vinculada ao caixa correto.
- Estoque PS4/PS5/Xbox: antes **3/1/2**, depois da venda **2/0/1**, após devolução **3/1/2**. PETRÓPOLIS ESTOQUE permaneceu **0/0/0** em todas as leituras.
- Reabertura do pedido ofereceu somente consulta/reimpressão, sem hidratar outro carrinho. Segunda via #8414 gerada com Pix, total original, origem Aplicativo, ID do pedido e link autenticado do Cloud. Após devolução, nova reabertura continuou bloqueando segunda venda; uma única venda vinculada comprovada no banco. Não foi disparado outro finalizador para forçar concorrência real.
- Devolução integral pelo formulário normal: `84ff07bb-f0f9-422f-94a5-522cf0f9f4e1`, 09:20:41 BRT, três itens OK/Venda, Pix R$ 135,00, motivo explícito de homologação autorizada. Sem estorno manual extra e sem cancelamento simples adicional.
- Estado final: pedido **cancelado/pagamento pendente**, vínculo da venda preservado. A venda permanece historicamente concluída com devolução integral; não foi apagada nem cancelada depois da devolução para evitar estorno duplicado.
- Financeiro: receber pago R$ 135,00 (`1de7acdb-7f03-4fa7-945d-1176fc28ee3e`) e pagar pago Pix R$ 135,00 (`0586d31b-26bc-4c78-b644-cc9f8e3244a5`), mesma loja, líquido **R$ 0,00**.

### Limites e pendências encontrados no ensaio

- Ambos os lançamentos estão com **conta_id=NULL**; o receber também está com forma_pagamento=NULL, embora pagamentos_venda registre Pix corretamente. O reembolso simples do fluxo atual não pediu conta. A compensação nominal no financeiro foi provada; conciliação por conta bancária não foi comprovada. Não editar lançamentos à mão nem inventar transferência/comprovante.
- Operação do PDV ainda inclui #8414 no **total bruto de vendas** e mantém aviso de **Pix sem comprovante** após a devolução integral. Gaveta exibida R$ 200,00; Pix não altera dinheiro físico. Revisar o tratamento existente de devoluções Pix nessa tela/fechamento antes de declarar conciliação completa do caixa. Não ocultar o aviso nem anexar comprovante fictício.
- A impressão automática abriu diálogo e bloqueou a leitura da primeira aba; a venda foi conferida por captura e por consulta independente, sem reenviar. Segunda via teve conteúdo inspecionado na aba Comprovante #8414. Impressão física continua não validada.
- Nenhum acesso ao banco bancário/transferência Pix externa foi feito. O ensaio registra recebimento/reembolso no ERP, conforme autorizado; não comprova trânsito real entre bancos.
- F9 real não executado: cliente continua sem fiado. Cobertura F9 é local com SQL real no PGlite. Android visual e concorrência real entre conexões não foram homologados.
- Os 252 testes, TypeScript e build aprovados precederam a publicação; o merge de main não alterou conteúdo do código testado. Nesta rodada de publicação não houve novo ajuste de implementação.

Provas locais: `pdv-deploy-ready-20261020.png`, `pdv-oficial-producao-20261020.png`, `pdv-venda-8414-20261020.png`, `pdv-bloqueio-segunda-venda-20261020.png`, `pdv-cupom-segunda-via-8414-20261020.txt`, `pdv-antes-venda-20261020.txt`, `pdv-apos-venda-20261020.txt`, `pdv-apos-devolucao-20261020.txt`, `pdv-financeiro-final-20261020.txt`, `pdv-caixa-pos-devolucao-20261020.png` e `pdv-homologacao-resultado-20261020.png`.

Atualizado em 20/10/2026, após nova execução dos testes e acesso autenticado ao Cloud.

## Implementação pronta no código local

- Rota sempre usa PDVClient; componente paralelo excluído.
- Pedido hidrata cliente, itens, preços originais, estoque e séries/IMEIs do depósito.
- Rascunho por sessão/operador, confirmação antes de substituir carrinho e limpeza total ao desvincular.
- Vínculo bloqueia alterações comerciais; mantém seleção de IMEIs e pagamento nativo.
- Finalização vinculada passa exclusivamente por finalizar_pedido_app_pdv, com revalidação do servidor e sem fallback genérico.
- Cupom normal e reimpressão identificam o pedido; venda existente não cria outra venda.
- Migration incremental sincroniza devolução integral após itens gravados, preserva parcial e não duplica estornos.

## Banco de produção

Projeto TECNOCELL.CLAUD, rbjwbfekkhebaschiqda. Versão 20261019 reconciliada pelo SQL Editor, sem reaplicar SQL. Incremental 20261020040612 aplicada e registrada na mesma transação. Conferência anterior comprovou quatro funções com hashes corretos, permissões protegidas e três gatilhos diferidos habilitados. Consulta atual confirmou as duas versões registradas. Nenhum db push geral.

## Testes repetidos nesta rodada

- Suíte completa: 252 testes, 252 aprovados, zero falhas/cancelados/ignorados. Inclui navegador com componente real e rede fictícia, testes das actions e SQL real dos finalizadores no PGlite.
- TypeScript: npx tsc --noEmit, saída 0.
- Build desta rodada: npm run build, saída 0; compilação, checagem de tipos e geração de páginas concluídas.
- git diff --check: saída 0 (somente aviso de conversão LF/CRLF).
- Logs locais: testes-pdv-20261020.log, typescript-pdv-20261020.log e build-pdv-20261020.log.

## Teste real iniciado: preflight e navegador

Login do funcionário confirmado no perfil TECNOCELL. Ao abrir o pedido autorizado no alias público, a página ainda renderiza a tela paralela rejeitada: título Atender no PDV, formulário próprio de pagamento e botão Concluir e imprimir. Não foi pressionado. A correção local ainda não foi publicada; arquivos permanecem sem commit/push/deploy.

Consulta SOMENTE LEITURA do pedido 183f3200-819d-46f4-ae02-a5eaa64bd2d5 comprovou:

- status pendente; status_pagamento pendente; três itens; zero vendas vinculadas;
- cliente ativo, cadastro comercial aprovado, nao_vender=false;
- permite_fiado=false: o ciclo fiado/F9 escolhido pelo titular não está habilitado para esse cliente. Não foi alterada sua autorização comercial.

Nenhum caixa foi aberto, venda concluída, estoque baixado, recebimento ou reembolso realizado nesta rodada. Não há prova de ciclo financeiro real concluído nem de atualização visual do Android.

## Pendências concretas

1. Publicar a implementação corrigida e conferir que o alias público abre o PDV oficial com banner do pedido.
2. Definir com o titular um meio de pagamento permitido. O teste fiado/F9 requer cliente legitimamente autorizado; não habilitar fiado apenas para contornar a trava.
3. Operador informar saldo real de abertura, se necessário, e formas reais de recebimento e reembolso.
4. Executar roteiro de venda única, estoque PETRÓPOLIS LOJA, caixa/financeiro, reimpressão, bloqueio de duplicidade e devolução. Após F9 quitado, usar Devolução, preservando bloqueio do cancelamento simples.

Provas: [tela publicada ainda antiga](pdv-producao-antiga-20261020.png), [preflight atual do pedido](pdv-pedido-preflight-20261020.png), [verificação da migration](pdv-banco-verificado-20261020.png).

Checkout preservado: D:\projetos\tecnocell-pdv-safe-1910. E: e Obsidian não acessados.
