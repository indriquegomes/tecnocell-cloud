-- Lista unificada de pedidos + vendas do PDV pra tela de Pedidos.
-- Resolve cliente/loja/forma no SQL pra paginar e buscar no SERVIDOR
-- (antes a tela embutia 48k vendas no HTML via fetchAll - page.tsx antigo).
create or replace view pedidos_vendas as
select
  p.id,
  p.numero::bigint as numero,
  p.numero::text as numero_text,
  case when p.tipo = 'orcamento' then 'orcamento' else 'pedido' end as tipo,
  p.status,
  p.total::numeric as total,
  p.created_at,
  pe.nome as cliente,
  pe.nome_norm as cliente_norm,
  dlo.nome as loja,
  fp.nome as forma
from pedidos p
left join pessoas pe on pe.id = p.pessoa_id
left join depositos d on d.id = p.deposito_id
left join lojas dlo on dlo.id = d.loja_id
left join formas_pagamento fp on fp.id = p.forma_pagamento_id
union all
select
  v.id,
  v.numero::bigint as numero,
  v.numero::text as numero_text,
  'venda' as tipo,
  v.status,
  v.total::numeric as total,
  v.created_at,
  pe.nome as cliente,
  pe.nome_norm as cliente_norm,
  coalesce(cxlo.nome, dlo.nome) as loja,
  fp.nome as forma
from vendas v
left join pessoas pe on pe.id = v.pessoa_id
left join caixas cx on cx.id = v.caixa_id
left join lojas cxlo on cxlo.id = cx.loja_id
left join depositos d on d.id = v.deposito_id
left join lojas dlo on dlo.id = d.loja_id
left join formas_pagamento fp on fp.id = v.forma_pagamento_id;
