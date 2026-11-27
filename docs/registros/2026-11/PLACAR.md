# PLACAR da rodada — novembro/2026

> **Para que serve:** ser a ÚNICA fonte de "o que já foi resolvido". Antes de uma análise
> ou de reportar pendência, ler esta tabela. Item com situação `fechado` não entra em lista de
> pendência; se ele voltar a aparecer nos dados, o script `scripts/conferir-placar.mjs` chama de
> **RECAÍDA** (com data) — não de furo novo.
>
> **Como é conferido:** cada `id` da tabela tem uma checagem no script (consulta no banco). O script
> lê esta tabela, roda as checagens e imprime só o que está `aberto` ou em `recaída`.
> Item sem checagem no script aparece como `SEM CHECAGEM` (não é pendência: é item só documental).
>
> **Atualizado:** 27/11/2026.

| id | item | tipo | situação | prova | observação |
|---|---|---|---|---|---|
| `porteiro-categoria` | Categoria do lançamento em lista fechada + trigger no banco recusando categoria inventada | fechado | fechado | `e4a09dd`, `2026-11-25-categorias-financeiro.sql` | 45 categorias; inventada barrada no teste |
| `porteiro-origem` | Pagamento pago exige forma do cadastro e conta/gaveta; "Outros" desativada | fechado | fechado | `e4a09dd` + `lib/validacao-lancamento.ts` | 10 testes + e2e |
| `permissao-lancar` | Criar/editar/apagar lançamento manual exige permissão própria | fechado | fechado | `b7310c9` + `scripts/liberar-permissao-lancar.mjs` | 11 perfis/cargos |
| `devolucao-fora-do-app` | Devolução com dinheiro devolvido por fora (WhatsApp) nasce PAGA | fechado | fechado | `4a6eb59` + `e2e/devolucao-fora-do-app.spec.ts` | já há uso registrado |
| `cancelar-vale-sem-dinheiro` | "Só cancelar (não devo nada)" no cancelamento de vale | fechado | fechado | `962080f` + `e2e/vale-cancelar-sem-dinheiro.spec.ts` | cancela crédito sem abrir conta |
| `estornos-pendentes` | Conta a pagar de "Estorno de crédito" não fica pendente | fechado | fechado | `4a6eb59` + conserto dos 4 de 25/11 | se voltar a aparecer pendente, é recaída |
| `estornos-cruzamento` | Estornos PIX cruzados com extrato + prints (valor + data + nome) | fechado | fechado | `docs/registros/2026-11/estornos-prints-cruzamento.md` | provas gravadas em `pix_saidas` |
| `devolucoes-fecham-centavo` | Devoluções do mês fecham: peça devolvida = abatido de fiado + reembolso | fechado | fechado | identidade do doc de 26/11 (R$ 0,00 de diferença) | — |
| `contas-organizadas` | Contas do mês claras: 6 ativas (2 caixa, 2 dinheiro vivo, caixinha, PagBank) e 6 arquivadas | fechado | fechado | `8bb6f6a` + `scripts/arrumar-contas.mjs` | arquivadas preservam histórico |
| `conta-unica-pix` | PIX das duas lojas na MESMA conta (não existe conta bancária por loja) | fechado | fechado | `1086ecd` + `docs/mapa/contas-e-pix.md` | regra do dono de 26/10 |
| `fone-vitao` | `FONE QUE VITÃO PEGOU NA LOJA` deixou de ser despesa e virou A Receber | fechado | fechado | `4a6c401` + `scripts/consertar-fone-vitao.mjs` | R$ 49,00 |
| `regra-teste` | Peça que sai para teste e volta: decisão do dono (devolução normal, motivo registrado) | decisao | decidido | definição do dono em 27/11 | não é furo; não entra em pendência |
| `linhas-sem-forma` | Pagamentos de dinheiro (folha/mercadoria) sem forma de pagamento | aberto | aberto | — | falta a forma (PIX ou dinheiro) para fechar |
| `saldo-inicial-pagbank` | Saldo inicial da conta PagBank igual ao extrato | aberto | aberto | `contas.saldo_inicial` = 0 | por isso a conta aparece negativa |
| `extrato-fornecedor` | Dívida do fornecedor conferida contra o extrato do fornecedor | aberto | aberto | — | H2O/ADL/INOVA de novembro |
| `contas-particulares` | Contas particulares do mês lançadas na aba Particular | aberto | aberto | — | dono lança |
| `fechamento-novembro` | Fechar novembro + contagem de estoque | aberto | aberto | — | ação do dono em 30/11 |
