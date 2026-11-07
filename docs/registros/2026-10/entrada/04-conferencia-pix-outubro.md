# Peça 4 — Conferência PIX enviados, outubro/2026

- Origem: relatório passado pelo dono no chat (25/10) + verificação independente no banco (`comprovantes_pix`).
- Minha reprodução no banco com a mesma regra (1 comprovante por ID E2E; fora apagado, duplicado, não-comprovante e sem destinatário): **1.904 comprovantes · R$ 258.996,55** — igual ao relatório do dono, no centavo.

## Total do mês por destinatário

| Fantasia | Nome no comprovante | Doc / chave | Qtd | Total |
|---|---|---|---|---|
| H2O | STOR ONE LTDA | 67.262.680/0001-92 | 965 | R$ 121.640,24 |
| Tecnocell Petrópolis | 38.216.415 JOAO VITOR MAXIMIANO FRANCA | 38.216.415/0001-70 | 568 | R$ 74.338,29 |
| ADL | ARMAÇÃO LONGITUDE COMERCIO LTDA | 11959507410 | 191 | R$ 26.919,15 |
| INOVA | ATRATIVA ACESSÓRIOS PARA CEL. EIRELI | atrativaacessorioss@gmail.com | 70 | R$ 15.145,40 |
| ZL | FERNANDES DA SILVA REPRES. SJC / PLANORH / FERREIRA E FERREIRA | 17.966.582/0001-68 | 68 | R$ 13.904,00 |
| Isabela Ponciano | ISABELA PONCIANO CÂMARA | 24993117516 | 30 | R$ 5.872,47 |
| (sem cadastro) | IG FRANÇA COMÉRCIO E SERVIÇO LTDA | — | 6 | R$ 572,00 |
| (sem cadastro) | JOÃO VICTOR DO NASCIMENTO SALGUEIRO | — | 1 | R$ 350,00 |
| PLANETA | PLAY CELL CELULARES | planeta272026@outlook.com | 5 | R$ 255,00 |
| **Total** | | | **1.904** | **R$ 258.996,55** |

Por grupo do Telegram: `-5388974048` 1.070 = R$ 139.389,13 · `-5518480222` 834 = R$ 119.607,42.

Fora do total (conferido): 18 Pix lançados 2× = R$ 2.823,70 · 25 apagados do grupo = R$ 1.756,50 · 2 sem destinatário.

## Leitura do total

| Bloco | Valor | % | O que é |
|---|---|---|---|
| Fornecedores (H2O, ADL, ZL, INOVA, PLANETA) | **R$ 177.863,79** | 68,7% | compra de mercadoria |
| CNPJ próprio (João Vitor / Tecnocell Pet) | **R$ 74.338,29** | 28,7% | transferência para o CNPJ da empresa — **não é fornecedor** |
| Isabela Ponciano (cliente com chave gravada) | R$ 5.872,47 | 2,3% | a classificar (cliente/devolução/salário?) |
| Sem cadastro (IG França, J.V. Salgueiro) | R$ 922,00 | 0,4% | cadastro a criar |

## Cruzamento PIX × papel de fornecedores (outubro)

| Fornecedor | Papel "pago" | PIX comprovantes | Diferença |
|---|---|---|---|
| ADL | R$ 26.857,15 | R$ 26.919,15 | **+R$ 62,00** |
| H2O | R$ 115.482,94 | R$ 121.640,24 | **+R$ 6.157,30** |
| ZL | R$ 13.621,00 | R$ 13.904,00 | **+R$ 283,00** |
| INOVA | R$ 15.106,40 | R$ 15.145,40 | **+R$ 39,00** |
| PLANETA | R$ 255,00 | R$ 255,00 | R$ 0,00 |
| **Total** | **R$ 171.322,49** | **R$ 177.863,79** | **+R$ 6.541,30** |

ADL, ZL e INOVA batem em centavos de diferença por dia (alguns dias trocam de valor e se compensam). **O único desvio real é H2O**, e ele vem quase todo de um dia:

- **01/10 — R$ 6.600,30 em PIX para H2O que não existe no papel.** O papel começa os pagamentos de H2O em 02/10.
- O resto dos dias de H2O tem idas e voltas pequenas (03/10 −73,50 · 05/10 −257 · 06/10 +766 · 08/10 −714 · 20/10 +782 · 21/10 −535 · 22/10 +662 · 26/10 −1.023 · 27/10 +219,50 · 28/10 −133,50) que somam −R$ 443,00.

## Efeito na conta dos fornecedores

Pago em outubro = **R$ 177.863,79 (PIX)** + **R$ 25.700,00 (espécie, nomes pendentes)** = **R$ 203.563,79**.

```
Cenário A — os R$ 25.700 em espécie foram para os 5 fornecedores:
  comprado (papel) 170.943,00 − pago 203.563,79 = −32.620,79
  dívida em 30/09 implícita = 18.770,10 + 32.620,79 = R$ 51.390,89

Cenário B — os R$ 25.700 foram para outros fornecedores:
  comprado 170.943,00 − pago PIX 177.863,79 = −6.920,79
  dívida em 30/09 implícita = 18.770,10 + 6.920,79 = R$ 25.690,89
```

Os dois cenários são plausíveis; só o dono sabe quais fornecedores recebem em espécie.

## Pendências desta peça

- [ ] 01/10: o PIX de **R$ 6.600,30 para H2O** — foi pagamento de dívida de setembro? (não está no papel de outubro)
- [ ] Nomes dos fornecedores que recebem em **dinheiro vivo** (R$ 25.700: Pet 9.600 em 13/10 + 6.200 em 28/10 · Tere 5.900 em 13/10 + 4.000 em 28/10)
- [ ] Classificar **Isabela Ponciano** R$ 5.872,47 (30 comprovantes — 27/10 sozinho tem R$ 3.796,79)
- [ ] Criar cadastro: **IG FRANÇA COMÉRCIO E SERVIÇO** (R$ 572) e **JOÃO VICTOR DO NASCIMENTO SALGUEIRO** (R$ 350)
- [ ] R$ 74.338,29 para o CNPJ próprio entram no fechamento? (é dinheiro que sai da conta da loja e vai para a empresa — provável folha/pagamento de funcionários)
