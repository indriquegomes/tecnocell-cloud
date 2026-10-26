-- Permite 'motoboy' como cargo no perfil.
--
-- O perfil tinha duas fontes de função: o texto perfis.cargo e a FK cargo_id -> cargos.
-- O texto tinha lista fechada sem 'motoboy', então os cinco entregadores ficavam com
-- texto 'vendedor' e FK MOTOBOY — a permissão era de motoboy, o rótulo dizia vendedor.
-- Aqui só se ACRESCENTA um valor permitido na lista. Nenhum perfil é alterado.

alter table public.perfis drop constraint if exists perfis_cargo_check;

alter table public.perfis add constraint perfis_cargo_check
  check (cargo = any (array['dono','vendedor','gerente','estagiária','estoquista','freelancer','motoboy']::text[]));
