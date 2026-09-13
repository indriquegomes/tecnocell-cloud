-- Fiado controlado por pessoa + "combinou pagar na entrega".
--   - pessoas.permite_fiado: só quem tem TRUE pode comprar fiado (o PDV bloqueia os outros).
--   - "Combinou pagar na entrega": o fiado fica marcado com categoria 'Combinado na entrega'
--     (o código atualiza o lançamento após a venda — não precisa mexer no RPC finalizar_venda).

alter table pessoas add column if not exists permite_fiado boolean not null default false;
