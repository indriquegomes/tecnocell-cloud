-- Fase 2: tipo de vínculo (MEI/CLT) + campos pro financeiro calcular.
-- vinculo: null | 'mei' | 'clt'.
-- MEI: valor do serviço + dia padrão de pagamento + funções.
-- CLT: salário (coluna salario já existe) + vale transporte fixo.

alter table public.perfis
  add column if not exists vinculo text,
  add column if not exists mei_valor_servico numeric(12,2),
  add column if not exists mei_dia_pagamento text,
  add column if not exists mei_funcoes text,
  add column if not exists clt_vale_transporte numeric(12,2);
