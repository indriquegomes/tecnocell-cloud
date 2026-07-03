-- Restrição de horário/dias de acesso por usuário (paridade SIGE)
-- hora_inicio/hora_fim: janela permitida (ambos preenchidos = ativa). Formato 'HH:MM'.
-- bloqueia_sabado/domingo/feriado: dias em que a pessoa NÃO pode acessar.
-- Master (dono) ignora tudo.

alter table perfis
  add column if not exists acesso_hora_inicio       text,
  add column if not exists acesso_hora_fim          text,
  add column if not exists acesso_bloqueia_sabado   boolean default false,
  add column if not exists acesso_bloqueia_domingo  boolean default false,
  add column if not exists acesso_bloqueia_feriado  boolean default false,
  add column if not exists meta_venda_mensal        numeric default 0;
