-- 25/11/2026 — o banco recusa categoria de lançamento que não existe.
--
-- O formulário do Financeiro aceitava qualquer palavra como categoria (a lista só
-- sugeria) — em set–nov/2026 isso produziu 47 grafias para ~20 coisas: 'Mercadoria'
-- (292) × 'Fornecedor / Mercadoria' (29) × 'fornecedor/mercadoria' (15) ×
-- 'fonecedor'; 'motoboy' × 'Motoboy'; 'despesas loja'; 'Estorno' × 'Estorno de
-- crédito'. Foi por aí que `FONE QUE VITÃO PEGOU NA LOJA` (R$ 49,00) virou despesa
-- paga na conta Teresópolis por uma peça que saiu da loja.
--
-- A partir daqui a lista oficial vive também no banco (`categorias_financeiro`) e um
-- trigger recusa categoria desconhecida em INSERT/UPDATE — pega tela, script, import
-- e SQL colado à mão. Categoria NULA continua permitida: as devoluções criadas pelo
-- RPC nascem sem categoria e a régua de "não pode nascer sem categoria" é da tela
-- (lib/validacao-lancamento.ts).
--
-- ORDEM IMPORTA: `nome_norm` é preenchido pelo trigger, então o trigger nasce ANTES
-- da carga (senão o insert da lista quebra no NOT NULL).

create table if not exists public.categorias_financeiro (
  nome      text primary key,
  nome_norm text unique,
  setor     text,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

create or replace function public.categorias_financeiro_norm()
returns trigger
language plpgsql
as $function$
begin
  new.nome_norm := lower(btrim(regexp_replace(new.nome, '\s*/\s*', '/', 'g')));
  return new;
end;
$function$;

drop trigger if exists trg_categorias_financeiro_norm on public.categorias_financeiro;
create trigger trg_categorias_financeiro_norm
  before insert or update of nome on public.categorias_financeiro
  for each row execute function public.categorias_financeiro_norm();

-- Lista oficial: a mesma de `lib/financeiro-setores.ts` + as categorias que só o
-- código escreve + as grafias antigas da base (aceitas para não perder histórico).
insert into public.categorias_financeiro (nome, setor)
select v.nome, v.setor
from (values
  -- 👥 Funcionários
  ('Salários', 'funcionarios'),
  ('Bônus', 'funcionarios'),
  ('Freelancer', 'funcionarios'),
  ('Vale transporte', 'funcionarios'),
  ('Comissão', 'funcionarios'),
  -- 🏭 Fornecedores
  ('Mercadoria', 'fornecedores'),
  -- 🏠 Estrutura
  ('Aluguel', 'estrutura'),
  ('Energia/Luz', 'estrutura'),
  ('Contabilidade', 'estrutura'),
  ('Impostos', 'estrutura'),
  ('Jurídico', 'estrutura'),
  ('Tarifas bancárias', 'estrutura'),
  -- 🛠️ Operação
  ('Frete / Entrega', 'operacao'),
  ('Combustível', 'operacao'),
  ('Alimentação', 'operacao'),
  ('Manutenção', 'operacao'),
  ('Limpeza', 'operacao'),
  ('Transporte', 'operacao'),
  ('Perda', 'operacao'),
  ('Perda de troca', 'operacao'),
  ('Uso interno', 'operacao'),
  ('Serviços', 'operacao'),
  ('Gastos em São Paulo', 'operacao'),
  ('Saúde', 'operacao'),
  ('Confraternização', 'operacao'),
  ('Outras despesas', 'operacao'),
  ('despesas loja', 'operacao'),
  ('motoboy', 'operacao'),
  -- 🧾 Vendas e entregas
  ('Combinado na entrega', 'vendas'),
  ('Fiado (a receber)', 'vendas'),
  ('Vale crédito usado', 'vendas'),
  ('Estorno', 'vendas'),
  ('Devolução ao cliente', 'vendas'),
  ('Vendas', 'vendas'),
  ('Desconto concedido', 'vendas'),
  ('Perda com fiado', 'vendas'),
  -- 👤 Sócio e dívidas
  ('Pró-labore', 'socio'),
  ('Retirada do sócio', 'socio'),
  ('Dívida parcelada', 'socio'),
  -- 📄 Particular do sócio
  ('Particular', 'particular'),
  -- escritas só pelo código/RPC (não aparecem no formulário)
  ('Comissão Marketplace', 'integracao'),
  ('Sangria / Retirada', 'caixa'),
  ('Estorno de crédito', 'socio'),
  -- grafias antigas que existem na base (aceitas, não oferecidas)
  ('Vale Transporte', 'funcionarios'),
  ('Motoboy', 'operacao'),
  ('Fornecedor / Mercadoria', 'fornecedores'),
  ('fornecedor/mercadoria', 'fornecedores'),
  ('fonecedor', 'fornecedores')
) as v(nome, setor)
on conflict (nome) do nothing;

-- Rede de segurança: se alguma linha entrou antes do trigger, preenche agora.
update public.categorias_financeiro
   set nome_norm = lower(btrim(regexp_replace(nome, '\s*/\s*', '/', 'g')))
 where nome_norm is null;

alter table public.categorias_financeiro alter column nome_norm set not null;

-- O PORTEIRO DO BANCO: categoria desconhecida não entra em `lancamentos`.
create or replace function public.valida_categoria_lancamento()
returns trigger
language plpgsql
as $function$
begin
  if new.categoria is not null and btrim(new.categoria) <> '' then
    if not exists (
      select 1 from public.categorias_financeiro c
       where c.nome_norm = lower(btrim(regexp_replace(new.categoria, '\s*/\s*', '/', 'g')))
    ) then
      raise exception 'Categoria "%" não existe no financeiro. Escolha uma da lista (Financeiro → Categoria).', new.categoria;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_valida_categoria_lancamento on public.lancamentos;

create trigger trg_valida_categoria_lancamento
  before insert or update of categoria on public.lancamentos
  for each row execute function public.valida_categoria_lancamento();
