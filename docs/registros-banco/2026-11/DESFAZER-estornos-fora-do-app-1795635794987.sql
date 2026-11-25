-- Desfaz o conserto de 2026-11-25T19:43:14.985Z
-- Backup completo: estornos-fora-do-app-1795635794987.json

update public.lancamentos set status = 'pendente', valor_pago = 0, data_pagamento = null, forma_pagamento = null, updated_at = now() where id = '4b891c2a-0c8d-4a5e-b8d3-d7b094c056c0';
update public.lancamentos set status = 'pendente', valor_pago = 0, data_pagamento = null, forma_pagamento = null, updated_at = now() where id = '5bb8e6d0-1ad3-499b-ba3a-092cbaf0d6ec';
update public.lancamentos set status = 'pendente', valor_pago = 0, data_pagamento = null, forma_pagamento = null, updated_at = now() where id = '0c005c52-8020-4251-a77c-8a803b883632';
update public.lancamentos set status = 'pendente', valor_pago = 0, data_pagamento = null, forma_pagamento = null, updated_at = now() where id = '69e00b10-9b11-4948-918f-3598a03c90cb';
