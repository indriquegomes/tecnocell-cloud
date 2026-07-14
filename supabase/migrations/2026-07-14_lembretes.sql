-- ============================================================
-- LEMBRETES — rotinas da equipe que o sistema cobra sozinho.
--
-- Pedido do Vitor: "notificação para Duda conferir caixa · notificação para Duda sair ·
-- notificação para Mari limpar loja". NÃO é agenda: é uma rotina que se repete nos
-- mesmos dias e no mesmo horário, e que a pessoa precisa MARCAR COMO FEITA.
--
-- O "feito" é o que separa isto de um alarme: sem ele, ninguém sabe se a loja foi
-- limpa ou se o caixa foi conferido. Com ele, a Isa abre e vê quem fez e a que horas.
-- ============================================================

create table if not exists lembretes (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null,
  descricao   text,

  -- Para QUEM. Os três casos:
  --   perfil_id preenchido -> uma pessoa    (Duda confere o caixa)
  --   cargo_id  preenchido -> todo um cargo (toda Vendedora)
  --   ambos nulos          -> a loja inteira
  perfil_id   uuid references perfis(id) on delete cascade,
  cargo_id    uuid references cargos(id) on delete cascade,

  hora        time not null,                              -- '18:30'
  dias        smallint[] not null default '{1,2,3,4,5,6}', -- 0=dom … 6=sáb
  ativo       boolean not null default true,

  criado_por  uuid references perfis(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Um lembrete só pode ser marcado como feito UMA vez por dia. O unique é a trava:
-- dois cliques (ou dois PCs) não geram dois registros.
create table if not exists lembretes_feitos (
  id          uuid primary key default gen_random_uuid(),
  lembrete_id uuid not null references lembretes(id) on delete cascade,
  data        date not null,
  perfil_id   uuid references perfis(id),
  feito_em    timestamptz default now(),
  unique (lembrete_id, data)
);

create index if not exists idx_lembretes_ativo  on lembretes (ativo);
create index if not exists idx_feitos_data      on lembretes_feitos (data);

-- Marca como feito de forma idempotente: se já estiver marcado hoje, devolve quem
-- marcou em vez de estourar erro de chave duplicada.
create or replace function marcar_lembrete_feito(
  p_lembrete_id uuid,
  p_perfil_id   uuid,
  p_data        date
)
returns jsonb
language plpgsql
security definer
as $function$
declare
  v_ja record;
begin
  select f.perfil_id, f.feito_em into v_ja
  from lembretes_feitos f
  where f.lembrete_id = p_lembrete_id and f.data = p_data;

  if found then
    return jsonb_build_object('ja_feito', true, 'perfil_id', v_ja.perfil_id, 'feito_em', v_ja.feito_em);
  end if;

  insert into lembretes_feitos (lembrete_id, data, perfil_id)
  values (p_lembrete_id, p_data, p_perfil_id)
  on conflict (lembrete_id, data) do nothing;

  return jsonb_build_object('ja_feito', false);
end;
$function$;
