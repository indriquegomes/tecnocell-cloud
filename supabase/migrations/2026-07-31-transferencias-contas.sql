-- Transferências entre contas (mover dinheiro de uma conta/caixa pra outra)
-- Registro simples: saiu da origem, entrou no destino. Não altera saldo (contas
-- não guardam saldo hoje) — é o histórico de transferências, como o SIGE.

create table if not exists transferencias (
  id uuid primary key default gen_random_uuid(),
  conta_origem_id uuid not null references contas(id),
  conta_destino_id uuid not null references contas(id),
  valor numeric not null,
  data date not null default current_date,
  observacao text,
  created_at timestamptz not null default now()
);
