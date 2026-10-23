# Halloween — regras corrigidas em23/10/2026

Esta especificação substitui a interpretação anterior de onze produtos grátis.

| Modelo | Benefício | Chance base |
|---|---|---|
| Kapbom KA-960 |15% de desconto|12,69%|
| Kapbom KA-980 Gatinho |20% de desconto|12,69%|
| Kapbom KA-8005 |20% de desconto|12,69%|
| Basike S10 Ultra+ |15% de desconto|5,08%|
| Kapbom KA-9975 |20% de desconto|5,08%|
| Repetidor KA-X338 G |15% de desconto|12,69%|
| Kapbom KA-P9 B |18% de desconto|12,69%|
| UniTV V12 |15% de desconto|2,54%|
| Basike MD-CAR271A |18% de desconto|12,69%|
| Basike TWS BA-FON6694 |18% de desconto|5,08%|
| Copo WU-613 |10% de desconto|5,08%|
| Mechanic iCharge8Pro |Grátis, uma unidade|0,50%|
| Sunshine SS-905D |Grátis, uma unidade|0,50%|

Chances separadas dos descontos. Categorias originais mais provável/moderada/baixa repartem99%; raros preservam0,5% cada enquanto disponíveis. Indisponíveis são excluídos e os comuns redistribuem o restante. Sem comuns elegíveis, não se consome o giro nem se aumenta a chance rara.

Cupons comuns não têm limite de emissão ou unidades do modelo indicado na compra de resgate. Cada cupom é usado uma vez, sem acumular outros vales ou promoções. Os dois prêmios grátis têm estoque finito e precisam de quantidade física confirmada antes da ativação.

## Participação e resgate

- Compras pagas de pelo menosR$200, de26/10/2026 00:00 até01/11/2026 00:00 exclusivo, em Brasília. R$400 também libera um giro por compra.
- Compra e quitação integral devem ocorrer no período da campanha. Sincronização ou envio tardio não renovam as48h. Uma quitação em31/10 pode gerar giro válido em novembro; o pagamento em novembro não participa.
- Compras concluídas mas com dívida pendente no F9 não liberam giro. Quitação é consultada nos registros existentes, sem alterações financeiras.
- Serviços vendidos no PDV entram como venda. OS recebida separadamente entra por conferência somente leitura do recebimento existente. OS exige cliente identificado, recebido_em, status entregue e um lançamento pago correspondente por número, titular, valor, horário e loja. Correspondência ausente ou ambígua não emite automaticamente; a equipe poderá conferir recebimentos pagos existentes e liberar manualmente, com operador, justificativa e horário comprovado. Não se cria lançamento financeiro por esta área. A abertura da OS também deve ocorrer entre26 e31/10/2026.
- Giro dura48h desde a quitação integral comprovada; vale48h desde sorteio. Encerramento do período não corta validade já emitida. Retirada na mesma loja; prêmios grátis podem ser retirados no mesmo dia, sem outra compra.
- Equipe envia link manualmente. Cada consulta/resgate exige a sessão Cloud e autorização já existentes. Todos os funcionários autorizados podem operar, conforme decisão do dono.

## Erro e produto indisponível

- Falha antes de commit: nenhum vale/estoque é consumido.
- Resposta perdida depois de commit: repetir recupera o mesmo vale, sem prêmio extra.
- Funcionário confirma indisponibilidade, informa motivo e cancela um vale ainda válido e não utilizado. O sistema cria exatamente um giro substituto com novas48h; cupom antigo fica inválido e permanece no histórico. Repetir a confirmação retorna o mesmo giro.
- O mesmo link original resolve o giro substituto. O produto indisponível fica excluído dos novos sorteios daquela sequência, para não entregar novamente o que não pode ser retirado. Demais clientes não perdem a disponibilidade do produto em outras lojas.
- Vale resgatado, vencido ou compra inelegível não permite devolução automática de giro. Casos fora disso exigem revisão operacional.

## Limites e isolamento

Resgatar valida o vale; desconto no produto correto, quantidade, não acumulação e baixa financeira continuam sendo conferidos pela equipe no PDV existente. Nenhuma tela, ação ou função financeira foi alterada. O estoque da promoção é separado do ERP; disponibilidade física por loja é conferida no balcão.

Migração apenas da promoção:20261023180000_halloween_cupons_e_reemissao.sql. Antes de aplicar: conferir schema real, manter campanha pausada, testar com rollback e validar compatibilidade com o painel publicado. Aplicação e publicação Vercel devem ser anunciadas ao dono antes de executar. Não fazer push direto na main enquanto o checkout do outro computador estiver em sincronização/merge.

Testes locais:

    node e2e/halloween-coupons-pglite.cjs
    node e2e/halloween-public-flow.cjs

O arquivo halloween-sales-local-check.sql cria fixtures financeiras SOMENTE no PGlite local e nunca deve ser executado na produção. O teste local não prova concorrência com conexões PostgreSQL simultâneas, checkout financeiro real ou renderização em aparelhos físicos.

Migração incremental desta etapa:20261023220000_halloween_quitacao_os_manual.sql. Recebimentos vinculados são exclusivos por origem na campanha; reemissões herdam a comprovação. Sem hora comprovada, a emissão aguarda conferência do comprovante com registro de dia compatível, motivo e operador. Cancelamento ou invalidação financeira bloqueiam giro e resgate.
