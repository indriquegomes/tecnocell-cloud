-- Cadastro de cliente: FOTO de comprovação (técnico/lojista) — dado pessoal.
-- Guardamos só o CAMINHO no bucket (não URL pública); a exibição usa URL assinada.
alter table pessoas add column if not exists foto_url text;

-- Bucket PRIVADO pra fotos de cadastro. Privado de propósito: é RG / rosto de pessoa,
-- não pode ficar acessível por URL solta como as fotos de produto.
insert into storage.buckets (id, name, public)
values ('clientes', 'clientes', false)
on conflict (id) do nothing;

-- Sem policies anon: todo upload/leitura passa pelo service role (server actions),
-- que ignora RLS. Bucket privado + service role = ninguém de fora acessa a foto.
