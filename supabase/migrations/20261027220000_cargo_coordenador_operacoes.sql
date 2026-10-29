-- ============================================================================
-- Cargo COORDENADOR de Operações Gerais (27/10/2026, autorizado pelo dono)
--
-- O João Vítor aparecia como "vendedor" no texto, "dev tester" na permissão e
-- "diária" no pagamento. A função real dele é COORDENADOR DE OPERAÇÕES GERAIS,
-- com salário fixo de R$ 2.150 e extras eventuais (por hora ou por tarefa).
--
-- 1) O campo perfis.cargo é uma lista fechada (check) — 'coordenador' entra nela.
-- 2) Cargo novo "Coordenador de Operações" nasce com AS MESMAS permissões que ele
--    já tem hoje (copiadas do cargo "dev tester"), para nada mudar de acesso.
-- 3) A ficha dele passa a usar esse cargo, salário fixo e as duas lojas (o
--    pagamento sai sempre por Petrópolis).
-- Idempotente: pode rodar duas vezes.
-- ============================================================================

alter table perfis drop constraint if exists perfis_cargo_check;
alter table perfis add constraint perfis_cargo_check check (
  cargo = any (array['dono','vendedor','gerente','estagiária','estoquista','freelancer','motoboy','coordenador'])
);

insert into cargos (id, nome, permissoes)
values ('c0de0001-0000-4000-8000-000000000001', 'Coordenador de Operações',
  '{pdv,vendas,devolucoes,os,pedidos,clientes,produtos,estoque,compras,financeiro,relatorios,usuarios,venda_desconto,produto_custo,crediario_receber,credito_limite}')
on conflict (id) do update set nome = excluded.nome, permissoes = excluded.permissoes;

update perfis set
  cargo = 'coordenador',
  cargo_id = 'c0de0001-0000-4000-8000-000000000001',
  salario = 2150.00,
  motoboy_valor_fixo = 0,
  motoboy_tipo = null,
  mei_valor_servico = 0,
  pdv_loja_id = 'e41aa9ea-820d-44d2-a04a-2e4efc8b0946'::uuid,
  lojas_permitidas = array['e41aa9ea-820d-44d2-a04a-2e4efc8b0946','81791d01-dc4a-485c-bbb8-f2b4cda6731c']::uuid[],
  updated_at = now()
where nome = 'João Vítor Maximiano França';
