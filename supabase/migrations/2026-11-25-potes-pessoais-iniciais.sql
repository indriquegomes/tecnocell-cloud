-- Potes pessoais iniciais (aba Particular → Meus potinhos).
--
-- O painel divertido aprovado mostra os potinhos direto, sem formulário de
-- criação na tela; por isso os potes pessoais nascem aqui, com objetivo
-- definido e valor guardado em zero (dinheiro real é o dono quem guarda).
-- Só insere quando ainda não existe nenhum pote pessoal, para não duplicar.

insert into public.metas_poupanca (nome, cor, atual, objetivo, escopo)
select v.nome, v.cor, 0, v.objetivo, 'pessoal'
from (values
  ('Meta do mês',    '#1B6CA8', 55000.00),
  ('Reserva',        '#10b981', 20000.00),
  ('Equipamentos',   '#f59e0b', 10000.00)
) as v(nome, cor, objetivo)
where not exists (select 1 from public.metas_poupanca where escopo = 'pessoal');
