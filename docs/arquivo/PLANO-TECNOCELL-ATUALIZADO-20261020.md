---
tags: [tecnocell, planejamento, aplicativo, cloud, pdv]
atualizado: 2026-10-20
status: correcao-do-pdv-pendente
---

# Tecnocell — plano atualizado em 20/10/2026

> Nota preparada no D: para importar no Obsidian. O cofre configurado fica em E:\obsidian\200256; não foi acessado nem atualizado porque o titular proibiu usar E: após falhas CRC/Full Repair Needed. Esta nota atualiza o estado, sem apagar o histórico anterior.

## Decisão vigente do titular

O pedido do App deve entrar no **PDV normal que já existe no Tecnocell Cloud**. Não criar tela separada de pagamento, caixa ou impressão. Carregar cliente e itens no `PDVClient`, selecionar a forma de pagamento no fluxo normal, concluir a venda e imprimir o cupom existente. Manter referência do pedido e origem Aplicativo no histórico.

**Rejeitado:** `PedidoAppPDVClient`, que substitui a interface normal quando a URL contém `pedidoApp`. Essa implementação já foi publicada e ainda não foi corrigida. Não apresentar a publicação como aceite do titular.

## Estado comprovado

- [x] Backend único TECNOCELL.CLAUD (`rbjwbfekkhebaschiqda`), acessado pelo Chrome externo do perfil TECNOCELL.
- [x] Cliente vinculado a pessoa do Cloud por `cadastros_clientes.pessoa_id`; fluxo de cadastro/aprovação existente.
- [x] Cadastro/confirmação, recuperação web e login com senha alterada registrados como concluídos no histórico anterior.
- [x] Pedido recebido/confirmado/cancelado e isolamento entre contas registrados no histórico anterior. Não confundir com teste financeiro do novo PDV.
- [x] Menu Aplicativo com Autorizar clientes e Pedidos do App.
- [x] Migração `20261019_pedido_app_pdv_atomico.sql` aplicada manualmente em produção, com autorização e pós-verificação.
- [x] Vínculo venda/pedido, funções e gatilhos instalados; execução direta da nova finalização bloqueada para authenticated.
- [x] 32 testes locais, TypeScript local/GitHub e build aprovados na versão candidata.
- [x] PR #6 integrado ao main (`ea25049`), deploy de produção Ready, flag PDV ligada.
- [x] Cloud real mostra o pedido, cliente, itens, valores e encaminhamento para a unidade correta.
- [ ] Corrigir a interface publicada para usar o PDV normal.
- [ ] Homologar venda financeira real pelo PDV normal. Não houve venda concluída nesta rodada.

## Prioridade 1 — corrigir o encaixe no PDV existente

- [ ] Partir do main publicado, preservar documentos e alterações locais no D:.
- [ ] Inspecionar fluxo real do `PDVClient`: estado do carrinho, cliente, depósito, pagamentos, conclusão, F9, cupom e rastreio/link.
- [ ] Remover o desvio para `PedidoAppPDVClient` e o cupom paralelo.
- [ ] Importar o pedido para o PDV normal, preservando cliente, itens, quantidades e preços contratados.
- [ ] Impedir mistura/perda de carrinho e alterações que desfigurem o pedido; manter vendas comuns com comportamento normal.
- [ ] Reusar a transação específica para pedido do App na conclusão, sem fallback silencioso para uma venda sem vínculo.
- [ ] Aceite somente após conclusão bem-sucedida. Repetições retornam a mesma venda por pedido/unidade.
- [ ] Imprimir pelo cupom existente, com referências e identificação da origem Aplicativo; reimpressão não finaliza novamente.
- [ ] Rodar regressão, TypeScript e build; publicar a correção dentro da autorização já dada e conferir a tela.

## Prioridade 2 — ciclo financeiro controlado

- [x] Pedido identificado e autorizado pelo titular: `183f3200-819d-46f4-ae02-a5eaa64bd2d5`, Petrópolis, 3 itens, R$ 135,00.
- [x] Apenas encaminhado; banco conferido: status pendente, pagamento pendente, confirmado_em NULL, venda_id NULL.
- [x] Estoque suficiente constatado em PETRÓPOLIS LOJA antes do teste. PETRÓPOLIS ESTOQUE estava zerado para os itens.
- [ ] Revalidar saldos e vínculo antes do teste, porque podem mudar.
- [ ] Definir forma de pagamento e abertura do caixa com o titular. Não havia caixa aberto na última leitura; nenhuma forma foi selecionada.
- [ ] Concluir após corrigir o PDV e conferir uma única venda, caixa vinculado, pagamentos/lançamentos e baixa correta.
- [ ] Comprovar repetição segura e reimpressão sem duplicidade.
- [ ] Se fiado: comprovar lançamento no F9, recebimento e atualização no App. Pagamento pendente no pedido sozinho não prova dívida no F9.
- [ ] Cancelar a venda pelo procedimento do PDV e conferir reversão de estoque/financeiro e situação do App.
- [ ] Impressão física de 80 mm continua adiada pelo titular; não afirmar impressão física realizada.

## Prioridade 3 — histórico e evidências

- [ ] Reconciliar a migração manual com o histórico remoto antes de qualquer db push. A versão 20261019 não estava registrada na última consulta; não reaplicar SQL nem marcar outras versões sem conferir.
- [ ] Atualizar este plano e o relatório com evidências reais após a correção e testes.
- [ ] Importar as notas no Obsidian quando houver cópia autorizada do cofre em disco saudável. Sincronização atual pendente.

## Pendências separadas

- [ ] Investigar identidade Auth compartilhada entre usuário joao e conta do titular no App. Não separar/fundir contas nem mudar senha automaticamente.
- [ ] Revisão final Android: sessão/Google, navegação, recuperação iniciada no APK se ainda não comprovada, GPS/voz quando aplicáveis.
- [ ] Google Play: novo cadastro a preparar; titular ainda precisa conferir CNPJ/tipo de conta. Sem submissão ou pagamento nesta etapa.
- [ ] Rotação da chave administrativa anteriormente exposta: adiada pelo titular, risco pendente. Nunca copiar segredo para nota/prompt.
- [ ] Domínio/SMTP, entrega/rastreamento, aviso de aprovação uma vez e Pix automático continuam em trilhas próprias.

## Limites da validação

Os testes SQL isolados usam PGlite e finalizador fictício. Os testes da ficha antiga não comprovam o cupom paralelo. A revisão Claude do GitHub falhou na execução do serviço e não concluiu análise. O deploy Ready não prova homologação financeira. Nenhum APK novo foi gerado nesta rodada.

## Referências

- [[relatorio-situacao-app-cloud-pagamento-20261020]]
- [[CONTINUAR-TECNOCELL-20261020]]
- [[pedido-app-pdv-validacao-1910]]
- PR: https://github.com/indriquegomes/tecnocell-cloud/pull/6
- Cloud: https://tecnocell-cloud.vercel.app
