-- ============================================================
-- 🔴 A tabela ordens_servico tinha um check de status que só aceitava
-- 'aberta','em_andamento','entregue','cancelada' — mas o CÓDIGO usa outro
-- conjunto (aguardando/em_reparo/aguardando_peca/pronto/entregue/cancelado) +
-- os do fluxo da Isa (orcamento/finalizada/nao_finalizada). Resultado: criar OS
-- SEMPRE falhava (status inválido) → 0 OS no banco. Também as colunas do código
-- (aparelho/imei/problema) não batiam com as reais (equipamento/serial_imei/
-- defeito_relatado) — isso foi corrigido no código.
--
-- Esta migration abre o check pra TODOS os status usados (mantém os antigos
-- 'aberta'/'em_andamento'/'cancelada' pra não quebrar registro existente).
-- Idempotente.
-- ============================================================
alter table ordens_servico drop constraint if exists ordens_servico_status_check;
alter table ordens_servico add constraint ordens_servico_status_check
  check (status in (
    'aberta', 'em_andamento', 'cancelada',
    'aguardando', 'em_reparo', 'aguardando_peca', 'pronto', 'entregue', 'cancelado',
    'orcamento', 'finalizada', 'nao_finalizada'
  ));
