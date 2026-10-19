-- Impede falta/dobra duplicada em CORRIDA (2 cargas da tela RH ao mesmo
-- tempo, ou 2 batidas de saída simultâneas em feriado). O check-and-insert do
-- código não é atômico; esta trava única faz a 2ª gravação falhar com 23505 e o
-- código ignora esse erro específico.
create unique index if not exists idx_banco_horas_falta_dobra_unica
  on banco_horas(usuario_id, data)
  where motivo in ('falta', 'abono', 'dobra');
