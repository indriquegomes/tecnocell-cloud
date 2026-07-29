-- ============================================================
-- Atividade das máquinas — mapa do dia a dia das meninas.
--
-- Um agente leve roda em cada PC (bc1, bc2, note estoque) e grava a JANELA ATIVA
-- quando ela muda: app + título + horário. Sem vídeo, sem teclado. Vira a linha do
-- tempo do dia (qual app, quando) — pra MAPEAR os processos, não pra vigiar.
--
-- Segurança: RLS liga; a chave anon (pública) só pode INSERIR aqui, nunca ler. Assim
-- o agente na máquina da loja não carrega chave poderosa.
-- ============================================================

create table if not exists atividade_maquina (
  id uuid default gen_random_uuid() primary key,
  maquina text,
  app text,            -- WhatsApp | Chrome | SIGE | ... (simplificado)
  titulo text,         -- título completo da janela (pode simplificar/limpar depois)
  momento timestamptz default now()
);

create index if not exists idx_atividade_momento on atividade_maquina (momento);
create index if not exists idx_atividade_maquina on atividade_maquina (maquina, momento);

alter table atividade_maquina enable row level security;

-- anon só INSERE (o agente). Nada de SELECT/UPDATE/DELETE pela chave pública.
drop policy if exists "anon insere atividade" on atividade_maquina;
create policy "anon insere atividade" on atividade_maquina
  for insert to anon with check (true);
