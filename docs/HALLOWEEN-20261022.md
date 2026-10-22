# Promoção Halloween dentro do Tecnocell Cloud

## Funcionamento

A equipe usa `/painel/promocao-halloween` com a sessão normal do Cloud. A roleta pública é apenas a experiência do cliente. O painel não envia WhatsApp automaticamente: a equipe copia e envia o link.

- Uma venda concluída na loja, identificada por `vendas.id`, com cliente em `pessoa_id` e total de pelo menos R$ 200, libera exatamente um giro. Uma compra de R$ 400 continua liberando somente um.
- A rotina `halloween_private.sync_sales()` roda a cada minuto, independentemente de o painel estar aberto. Lê as vendas e grava somente objetos da promoção. Não modifica o fechamento de venda, caixa, pagamento ou estoque financeiro.
- A primeira ativação abre uma janela de elegibilidade. Compras anteriores ou feitas durante uma pausa não geram direitos retroativos. Vendas internas e pedidos do Mercado Livre ficam fora.
- Vendas sem cliente aparecem como pendência. Identificá-las dentro das 48 horas originais permite a captura. A rotina não usa um cursor que perderia essas vendas.
- O giro vence 48 horas após a compra concluída. O vale vence 48 horas após o sorteio. A rotina não estende prazos ao emitir com atraso.
- O painel agrupa por ID de cliente, preserva compras separadas e permite consultar giros, link, oferta, código, validade e resgate. Não une pessoas distintas apenas pelo nome.
- Cancelamento ou perda da elegibilidade bloqueia giro e vale. Reservas não resgatadas são devolvidas uma única vez. Cancelamento após resgate preserva o registro e gera alerta para conferência.
- A campanha real permanece pausada, com estoque zero, até as quantidades finais serem confirmadas. Quantidades provisórias existem apenas na homologação.

## Implementação e acesso

Os objetos ficam em `halloween_private`, com RLS e sem leitura direta pelos clientes. As RPCs administrativas exigem funcionário autorizado, perfil ativo e sessão válida do Auth. A lista autorizada mantém os 16 funcionários atuais aprovados pelo dono; nenhuma permissão financeira foi criada.

O arquivo `supabase/migrations/2026-10-22-halloween-automatic-sales.sql` é incremental e depende da instalação inicial já existente da campanha. Foi aplicado ao banco compartilhado antes da publicação da interface. O agendamento está em `supabase/halloween-schedule.sql`; não roda automaticamente durante um build Next.

O token exclusivo é derivado de HMAC com segredo privado. O banco guarda apenas seu hash. O cliente recebe o token no fragmento do link público; ele não vai para logs HTTP da Vercel. Recuperar o link não emite outro giro.

## Verificação feita

- PostgreSQL real, transações com rollback: emissão mínima, idempotência, 48 horas, giro único, estoque, resgate único e permissões.
- `e2e/halloween-automatic-check.sql`: captura automática, R$ 400 = um giro, cliente obrigatório, bloqueio retroativo e de campanha pausada, agrupamento por cliente, recuperação do token, cancelamento antes/depois do giro, expiração seguida de cancelamento sem dupla devolução e cancelamento após resgate sem devolver estoque.
- Três execuções consecutivas do cron observadas como `succeeded`, sem erro de conciliação.
- Tipos do novo componente verificados no checkout seguro. O build local em E: compilou código e TypeScript, mas parou ao coletar páginas por erro de leitura `EIO`; o Windows confirmou setores defeituosos no disco físico correspondente a E:. A publicação deve depender do build remoto da Vercel.
- Prévia local com componente React real e dados/API fictícios: histórico, link apontando ao domínio público, cópia, consulta, resgate e bloqueio de atualização enquanto há edição de estoque. Essa prévia não comprova login real.

## Conferência final pela equipe, sem vendas reais

1. Entre normalmente no Cloud e abra **Promoção Halloween**. Não deve haver um segundo login.
2. Selecione **Homologação — sem valor real**. Gere um giro de teste com referência `__QA__HALLOWEEN`, nome fictício e valor R$ 200. Não abra caixa nem crie venda financeira para isso.
3. Abra o histórico e copie o link. Confira que começa no domínio público da roleta, nunca no Cloud.
4. Abra esse link em outro navegador/celular, gire e anote o vale de teste. Reabrir o link deve recuperar a mesma oferta e código.
5. No Cloud, consulte o código e confirme o resgate de teste. O histórico deve mostrar a data e impedir um segundo resgate.
6. Volte à campanha real e mantenha-a pausada. A ativação depende das quantidades finais e da definição do período da promoção.

Não foi criada venda, dívida, pagamento ou movimentação financeira real para validar esta promoção. O cofre Obsidian indicado no AGENTS.md não está disponível neste computador; não foi sincronizado.
