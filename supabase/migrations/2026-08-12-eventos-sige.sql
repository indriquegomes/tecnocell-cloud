-- O que acontece na tela do SIGE, capturado na máquina de quem está usando.
--
-- Duas naturezas de evento no mesmo lugar, de propósito:
--   'clique'  → o que a pessoa fez (botão, campo, tela)
--   'api'     → o que o SIGE fez por baixo (rota, corpo do pedido, resposta)
-- Juntos eles contam a história inteira: "clicou em Finalizar" + "o SIGE mandou
-- ESTE json pra ESTA rota". O segundo é o que dá pra replicar aqui.

create table if not exists eventos_sige (
  id uuid default gen_random_uuid() not null,
  maquina text,                 -- de qual PC veio (a loja tem vários)
  usuario_sige text,            -- quem estava logado no SIGE
  tipo text not null,           -- 'clique' | 'api' | 'rota'
  rota text,                    -- tela do SIGE ou endpoint chamado
  metodo text,                  -- GET/POST, quando for api
  alvo text,                    -- texto do botão/campo clicado
  payload jsonb,                -- corpo enviado (sem credencial)
  resposta jsonb,               -- resposta do SIGE (recortada)
  status int,                   -- HTTP, quando for api
  ocorreu_em timestamptz not null,
  created_at timestamptz default now() not null,
  primary key (id)
);

-- As três leituras reais: linha do tempo, "o que rolou nesta tela", e busca no corpo.
create index if not exists idx_ev_sige_tempo   on eventos_sige (ocorreu_em desc);
create index if not exists idx_ev_sige_rota    on eventos_sige (rota, ocorreu_em desc);
create index if not exists idx_ev_sige_payload on eventos_sige using gin (payload);

alter table eventos_sige enable row level security;

-- A extensão grava com a chave anon; por isso insert liberado e leitura só logada.
-- Sem policy de update/delete: evento é registro histórico, não se edita.
drop policy if exists ev_sige_insert on eventos_sige;
create policy ev_sige_insert on eventos_sige for insert with check (true);

drop policy if exists ev_sige_leitura on eventos_sige;
create policy ev_sige_leitura on eventos_sige for select
  using (auth.role() = 'authenticated');
