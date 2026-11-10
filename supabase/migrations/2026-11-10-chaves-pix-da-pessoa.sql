-- Chaves Pix de uma pessoa (fornecedor ou cliente) — uma linha por chave.
--
-- Por que existe: `pessoas.chave_pix` guarda UMA chave, mas o mesmo fornecedor
-- recebe por mais de uma. A ADL, por exemplo, recebe por duas: celular
-- 11959507410 (ARMACAO LONGITUDE, Bradesco) e celular 11985205334 (MAIS BARATO
-- IMPORTAÇÃO E EXPORTAÇÃO, Banco SAQ). Com uma chave só, o bloco "PIX do dia"
-- do fechamento de caixa não reconhece o fornecedor e o comprovante fica
-- "não identificado" — e a dívida não é abatida.
--
-- `pessoas.chave_pix` continua valendo como chave principal (é o que o cadastro
-- da pessoa mostra). Esta tabela é o conjunto completo, usado no casamento do
-- comprovante com o cadastro: por documento (só dígitos) ou pelo nome do
-- favorecido que aparece no comprovante.

create table if not exists public.pessoa_chaves_pix (
  id uuid primary key default gen_random_uuid(),
  pessoa_id text not null references public.pessoas(id) on delete cascade,
  -- chave como o banco mostra: celular/e-mail com máscara ou documento
  chave text not null,
  -- 'Celular' | 'CNPJ' | 'CPF' | 'E-mail' | 'Aleatória' — texto livre, igual ao cadastro
  tipo text,
  -- nome que aparece no comprovante ("MAIS BARATO IMPORTAÇÃO E EXPORTAÇÃO LTDA")
  favorecido text,
  -- banco do recebedor ("Bradesco", "Banco SAQ")
  banco text,
  ativo boolean not null default true,
  created_at timestamp with time zone not null default now()
);
