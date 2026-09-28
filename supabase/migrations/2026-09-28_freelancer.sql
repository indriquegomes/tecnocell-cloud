-- Freelancer: pessoa que TB presta serviço por hora (além do vínculo fixo).
-- freelancer = checkbox; freelancer_valor_hora = quanto ganha por hora.
-- pontos.pago_em = quando o admin pagou (zerou o banco de horas). NULL = ainda não pago.

alter table public.perfis
  add column if not exists freelancer boolean default false,
  add column if not exists freelancer_valor_hora numeric(12,2);

alter table public.pontos
  add column if not exists pago_em timestamptz;
