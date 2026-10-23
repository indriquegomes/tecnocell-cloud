# Plano e registro — correção de cupons Halloween

Plano autorizado na conversa em23/10. Trabalhar no checkout seguro existente, preservando HEAD/índice e arquivos de terceiros. Publicação Cloud em branch separada baseada na main atual555cbae; nenhum push direto na main. O problema informado é divergência Git/merge em outro computador, não lentidão comprovada do Cloud.

## Especificação confirmada

- Itens1–11: descontos originais15/20/20/15/20/15/18/15/18/18/10%, sem limite de emissão/unidades do mesmo modelo na compra de resgate. Cupom de uso único, sem acumular.
- iCharge8Pro e Sunshine: grátis; chance0,5% cada enquanto disponíveis. Estoque físico finito, não inventar quantidades reais.
- Reembolso por indisponibilidade: equipe cancela vale não resgatado; exatamente um giro novo, novas48h. Cupom antigo fica inválido, histórico preservado. Repetição retorna o mesmo giro. Mesmo link original continua funcionando.
- Falha antes de commit preserva giro; resposta perdida após commit recupera mesmo resultado.
- Emissão26–31/10; bilhetes e vales conservam suas48h após encerramento. Duas lojas, resgate na mesma da compra. Venda paga; F9pendente não qualifica. Sem writes em vendas, pagamentos, caixa ou estoque ERP.

## Etapas

1. Conferir base remota, schema e consulta financeira somente leitura. Baseline de teste PostgreSQL local/PGlite.
2. Escrever teste de descontos/ilimitado e devolução; observar falha antes de implementar.
3. Migração isolada da promoção: benefício, disponibilidade, reemissão atômica, período, loja e elegibilidade paga. Busca paginada no servidor.
4. Painel e site: novos textos, devolver giro com confirmação, loja de resgate e atualização explícita. Preservar arte/som.
5. Testes de regressão, TypeScript, revisão independente e Preview Cloud. Apresentar resultado e impacto antes de publicar Cloud.

## Rulings

- Usar checkout D: existente; não criar worktree novo no disco E: com restrição de CRC. Publicação por índice Git separado, como nas entregas anteriores, preserva trabalho do dono.
- Preservar categorias de chance originais: seis mais prováveis, quatro moderadas e UniTV baixa; redistribuir99% entre elas. Percentuais de desconto não são pesos de chance. Raros0,5%fixos.
- Compra paga será verificada pelos recebimentos existentes, somente leitura. A emissão não modifica o fechamento financeiro nem interfere no merge pendente do outro computador.
- Datas interpretadas em Brasília:26/10 00:00 até01/11 00:00 exclusivo, sem antecipar ativação. Validade de giros existentes não é cortada no encerramento.

## Progresso

- Inspeção inicial: branch local codex/app-pdv-1910; alterações anteriores preservadas. main remota avançou para555cbae. Caminho C:/Users/usuario/tecnocell-cloud não existe neste computador; não é possível concluir o merge daquele checkout daqui.
- Conector Supabase disponível pertence a outra conta/projeto; não usá-lo para a empresa. Navegador da empresa ainda não respondeu; seguir testes locais enquanto reconecta.

## Retomada após reconexão em 23/10

- Chrome TECNOCELL reconectado. Conferência somente leitura no Supabase da empresa: campanha real pausada, estoque não confirmado, zero giros; migração nova ainda ausente. Colunas reais de vendas, pagamentos, lançamentos, OS, lojas, depósitos e pessoas compatíveis com os tipos utilizados.
- Revisão independente identificou e corrigiu lote de 200 candidatos inelegíveis, créditos consumidos, taxas e F9 quitado no lançamento, apresentação de snapshots antigos e dependência ausente do teste público.
- Regressões reproduzidas antes da correção. Testes PGlite incluem 200 vendas sem pagamento, 200 OS sem recibo, crédito com cartão/taxa, crédito com F9 quitado e proteção contra dupla contagem. Teste VM cobre comprovante de preço histórico. TypeScript completo passou.
- Nenhum push, deploy ou aplicação da migração nesta retomada. Avisar o usuário antes do envio ao Vercel. A validação PostgreSQL real em transação revertida e a publicação coordenada permanecem etapas seguintes.
