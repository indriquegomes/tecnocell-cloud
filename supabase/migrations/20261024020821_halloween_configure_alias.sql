-- Evita conflito entre a variável composta p e o alias da soma de chances.
-- Mantém corpo, permissões, validações e cálculos da função existente.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('halloween_private.configure(text,jsonb,boolean,boolean)'::regprocedure) into definition;
  if position('sum(p.weight)from halloween_private.products p where campaign_id=c.id' in definition) > 0 then
    execute replace(definition,
      'sum(p.weight)from halloween_private.products p where campaign_id=c.id',
      'sum(prize.weight)from halloween_private.products prize where prize.campaign_id=c.id');
  elsif position('sum(prize.weight)from halloween_private.products prize where prize.campaign_id=c.id' in definition) = 0 then
    raise exception 'Definição de configure inesperada; revise antes de aplicar.';
  end if;
end
$migration$;
