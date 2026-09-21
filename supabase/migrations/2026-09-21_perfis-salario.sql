-- Salário do funcionário no cadastro (RH). O dono pediu que a IA do chat
-- respondesse salário da equipe — mas não existia campo de salário em lugar
-- nenhum. Adiciona a coluna; o form e a IA leem daqui.
alter table public.perfis
  add column if not exists salario numeric(12,2) default 0;
