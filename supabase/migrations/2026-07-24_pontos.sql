-- Ponto do dia (relógio de ponto das atendentes). Cada linha = um turno:
-- entrada quando aperta "Iniciar", saida quando aperta "Parar". Turno aberto = saida null.
create table if not exists pontos (
  id text primary key,
  perfil_id text not null,
  nome text,
  entrada timestamptz not null default now(),
  saida timestamptz
);
-- quem está em operação AGORA (saida null) e o total do dia por pessoa
create index if not exists idx_pontos_abertos on pontos (saida);
create index if not exists idx_pontos_perfil_entrada on pontos (perfil_id, entrada);
