-- Retrato das vendas do SIGE, empurrado pelo robô a cada ciclo.
--
-- A aba de conferência precisa mostrar SIGE de um lado e o que espelhamos do outro.
-- Mas o app na Vercel não tem o token do SIGE (ele vive no script do robô). Então o
-- robô, que já lê o SIGE de qualquer forma, grava aqui o retrato — e a aba compara
-- dois lados que agora estão os dois no Supabase.

create table if not exists sige_conferencia (
  sige_cod bigint not null,          -- código da venda no SIGE (a chave que casa com a nossa observação)
  cliente text,
  forma text,
  empresa text,                      -- PETRÓPOLIS / TERESÓPOLIS
  faturado boolean default true,
  total numeric(12,2) default 0,
  itens int default 0,
  data_sige text,                    -- "20/07/2026 - 12:02" como vem do SIGE
  atualizado_em timestamptz default now() not null,
  primary key (sige_cod)
);

create index if not exists idx_sige_conf_atualizado on sige_conferencia (atualizado_em desc);

alter table sige_conferencia enable row level security;

drop policy if exists sige_conf_leitura on sige_conferencia;
create policy sige_conf_leitura on sige_conferencia for select
  using (auth.role() = 'authenticated');
