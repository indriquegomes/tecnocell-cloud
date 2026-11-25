-- 25/11/2026 — linha PAGA sempre tem `valor_pago`.
--
-- Vários caminhos marcam a linha como 'pago' sem gravar valor_pago: o reembolso de
-- devolução (RPC `registrar_devolucao`), OS e encomenda. Quem soma "já pago" lia
-- `valor_pago = 0` e o valor saía da conta — a devolução de R$ 10,00 do teste de
-- 25/11 apareceu como paga e somou R$ 0,00.
--
-- Em vez de consertar um caminho por vez, o banco garante a invariante: se a linha
-- nasce (ou passa a ser) paga com valor > 0 e valor_pago vazio/zero, valor_pago
-- recebe o valor. Baixa parcial continua mandando (valor_pago > 0 não é tocado) e
-- "desfazer" (status volta a pendente) também não.
--
-- A tela também foi corrigida (`pagoLinha` do Financeiro usa `|| valor`), então as
-- linhas antigas já aparecem certas sem backfill em massa.

create or replace function public.lancamento_pago_tem_valor()
returns trigger
language plpgsql
as $function$
begin
  if new.status = 'pago'
     and coalesce(new.valor_pago, 0) = 0
     and coalesce(new.valor, 0) <> 0 then
    new.valor_pago := new.valor;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_lancamento_pago_tem_valor on public.lancamentos;

create trigger trg_lancamento_pago_tem_valor
  before insert or update of status, valor, valor_pago on public.lancamentos
  for each row execute function public.lancamento_pago_tem_valor();
