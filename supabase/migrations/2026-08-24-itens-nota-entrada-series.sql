-- Nota de entrada nunca teve noção de IMEI: receber_nota_entrada só somava
-- estoque.quantidade, nunca gerava numeros_serie. O PDV depois recusava a
-- venda de produto serializado ("IMEI indisponível") mesmo com quantidade
-- disponível no estoque. Guarda os IMEIs digitados por item da nota; o RPC
-- (migration seguinte) usa isso pra criar os numeros_serie de verdade no
-- recebimento.
alter table itens_nota_entrada add column if not exists series jsonb not null default '[]'::jsonb;
