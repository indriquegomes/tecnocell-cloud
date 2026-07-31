-- Promoção restrita a tabelas de preço (Isa: aplicar promoção só em ATACADO1/2 etc.).
-- SEM linha aqui = promoção vale em TODAS as tabelas (compatível com as atuais).
create table if not exists promocao_tabelas (
  promocao_id uuid not null references promocoes(id) on delete cascade,
  tabela_id   uuid not null references tabelas_preco(id) on delete cascade,
  primary key (promocao_id, tabela_id)
);

create index if not exists idx_promocao_tabelas_promocao on promocao_tabelas(promocao_id);
