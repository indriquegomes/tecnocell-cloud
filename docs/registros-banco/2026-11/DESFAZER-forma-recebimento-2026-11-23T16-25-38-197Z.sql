UPDATE lancamentos SET forma_pagamento = 'PIX', historico_pagamentos = '[{"data":"2026-11-23T15:39:37.06191+00:00","forma":"PIX","valor":100}]'::jsonb, updated_at = now() WHERE id = '72681555-c939-4172-bf8f-fac7f2ec2e0b';
UPDATE movimentos_caixa SET forma_pagamento = 'PIX', lancamento_id = NULL, origem = NULL WHERE id = 'e932bf78-6d26-455b-a04c-6998932671a5';
