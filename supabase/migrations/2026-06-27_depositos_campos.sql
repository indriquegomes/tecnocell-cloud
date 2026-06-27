-- Campos extras para módulo Depósitos
alter table depositos
  add column if not exists descricao  text,
  add column if not exists ativo      boolean default true,
  add column if not exists responsavel text,
  add column if not exists telefone   text,
  add column if not exists email      text,
  add column if not exists cep        text,
  add column if not exists cidade     text,
  add column if not exists uf         text;
