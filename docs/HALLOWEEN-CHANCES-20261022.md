# Regras corrigidas — chances de ganhar

Os percentuais originais eram chances, não descontos. Os itens1–11 são produtos grátis (armazenados como benefício100% para compatibilidade); iCharge8Pro e Sunshine são condições de compra por R$180 e R$135. Resultados antigos mantêm seu snapshot e não são reinterpretados.

Cada raro tem0,5% absoluto enquanto disponível. Apenas o restante da probabilidade é redistribuído proporcionalmente aos comuns em estoque. Se um raro esgota, sua parcela volta ao grupo comum; o outro continua0,5%. Se só restarem raros, não há giro nem consumo do ticket até repor os comuns. Raros podem sair em qualquer giro; não há ordem predeterminada.

Chances base (100% no total):

| ID | Item | Chance |
|---|---|---|
|1|KA-960|8,07%|
|2|KA-980 Gatinho|10,76%|
|3|KA-8005|10,76%|
|4|S10 Ultra+|8,07%|
|5|KA-9975|10,76%|
|6|KA-X338|8,07%|
|7|KA-P9|9,69%|
|8|UniTV V12|8,07%|
|9|MD-CAR271A|9,69%|
|10|BA-FON6694|9,68%|
|11|WU-613|5,38%|
|12|iCharge8Pro por R$180|0,50%|
|13|Sunshine por R$135|0,50%|

Base comum normalizada dos184 pontos para99%; arredondamento a0,01 ponto percentual com distribuição dos resíduos. Chances atuais vêm do mesmo pool usado pelo sorteio no servidor; o cliente não decide o resultado. O painel edita percentuais com duas casas e exige soma100%; raros fixos.

Migração: supabase/migrations/2026-10-22-halloween-prize-probabilities.sql. Testes com rollback: e2e/halloween-probability-check.sql. Campanha real permanece pausada, sem estoque confirmado. Não houve alteração de vendas, caixa, pagamento ou estoque ERP.

Correções ligadas ao fluxo: navegação interna preserva fragmento do token; texto48h alinhado à compra. Paginação acima500 clientes continua pendente do relatório anterior.
