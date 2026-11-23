-- DESCONTO 2ª PEÇA (garantia) — 23/11/2026
--
-- Motivo: a loja dá desconto na segunda peça quando o cliente quebra a tela comprada
-- dentro da garantia (3 meses). O controle era um carimbo na peça, que se perdeu.
-- Esta tabela é o carimbo de verdade: guarda quem usou, em que peça, quanto e quando.
--
-- Regras (decisão do dono, 23/11/2026):
--   - peça TOP 20 nunca entra (a trava vive no código, conferida no servidor);
--   - cliente que já usou → libera só com a senha do gerente;
--   - desconto acima de 40% → também precisa da senha do gerente.
--
-- Aplicar no SQL Editor (migration não roda sozinha). O código do PDV lê esta tabela;
-- deploy só depois do SQL.

create table if not exists beneficios_segunda_peca (
  id uuid primary key default gen_random_uuid(),
  pessoa_id text not null,              -- pessoas.id é TEXT (IDS do SIGE)
  produto_id uuid,                      -- peça vendida como segunda peça
  venda_id uuid,                        -- venda em que o desconto foi aplicado
  loja_id uuid,
  percentual numeric(5,2) not null default 0,
  valor numeric(14,2) not null default 0,
  criado_por uuid,
  created_at timestamptz not null default now()
);

create index if not exists beneficios_segunda_peca_pessoa
  on beneficios_segunda_peca (pessoa_id, created_at desc);
