-- 23/09/2026: entregas do motoboy no PDV.
-- 1) rota + horário da entrega (centro/bairro/itaipava).
-- 2) entregue_em/entregue_por (quando o motoboy marcou entregue).
alter table vendas add column if not exists rota_entrega text;
alter table vendas add column if not exists horario_entrega text;
alter table vendas add column if not exists entregue_em timestamptz;
alter table vendas add column if not exists entregue_por text;
