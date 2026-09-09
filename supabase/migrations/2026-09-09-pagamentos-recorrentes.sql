-- Pagamentos recorrentes: lembrete com tipo 'pagamento' + valor.
-- Funcionários pagos por PIX todo sábado (dias {6}).
alter table lembretes add column if not exists tipo text not null default 'rotina';
alter table lembretes add column if not exists valor numeric;

insert into lembretes (titulo, descricao, hora, dias, ativo, tipo, valor) values
  ('Pagamento: MARIA EDUARDA KAPPLER DA SILVA', 'PIX', '09:00', '{6}', true, 'pagamento', 623.08),
  ('Pagamento: ISAAC BENTO MORELLI', 'PIX', '09:00', '{6}', true, 'pagamento', 600.00),
  ('Pagamento: MARIANA VILA REAL CASTELLI', 'PIX', '09:00', '{6}', true, 'pagamento', 611.54),
  ('Pagamento: BRUNNA FURTADO GONÇALVES', 'PIX', '09:00', '{6}', true, 'pagamento', 656.00),
  ('Pagamento: Nikollas Bernardo Leocadio', 'PIX', '09:00', '{6}', true, 'pagamento', 720.00),
  ('Pagamento: ERICK ALVES DE MATTOS', 'PIX', '09:00', '{6}', true, 'pagamento', 950.00);
