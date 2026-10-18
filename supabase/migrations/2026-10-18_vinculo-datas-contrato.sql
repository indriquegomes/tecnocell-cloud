-- Vínculo: datas de fim (demissão/encerramento) e contrato (MEI).
--   CLT     → data_admissao (já existe) + data_demissao
--   Estágio → reusa data_admissao (início) + data_demissao (fim)
--   MEI     → data_contrato_inicio + data_contrato_fim (contrato de prestador)
alter table public.perfis
  add column if not exists data_demissao date,
  add column if not exists data_contrato_inicio date,
  add column if not exists data_contrato_fim date;
