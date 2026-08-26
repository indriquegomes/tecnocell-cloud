-- Achado em teste de erros: estornar_nota_entrada devolvia a QUANTIDADE ao
-- estoque agregado, mas nunca desfazia os numeros_serie (IMEIs) criados por
-- receber_nota_entrada (feature de série na nota, adicionada 24/08 — esta RPC
-- é mais antiga, de 25/07, e nunca foi atualizada pra saber da tabela nova).
-- Confirmado ao vivo: estornar uma nota de 2 aparelhos com IMEI zera o
-- estoque agregado (0), mas os 2 IMEIs continuam em numeros_serie com
-- status='em_estoque' — "fantasmas" que qualquer tela que liste IMEI
-- disponível direto de numeros_serie (não do agregado) mostraria como
-- vendável, mesmo a compra tendo sido cancelada.
--
-- Correção: por item de produto serializado, apaga só os IMEIs que a PRÓPRIA
-- nota criou (lista em itens_nota_entrada.series) e que ainda estão
-- 'em_estoque' (nunca vendidos) — um IMEI já vendido antes do estorno não é
-- mexido (a venda é real, desfazer isso seria um bug pior). O estoque
-- agregado desce só pela quantidade de IMEIs realmente revertidos, não pela
-- quantidade cheia do item — evita descontar 2x uma unidade que já saiu por
-- uma venda antes do estorno chegar.
--
-- Já aplicada e reverificada ao vivo (2 cenários: nenhum vendido = os 2
-- IMEIs somem e estoque zera; 1 vendido antes do estorno = o vendido fica
-- intocado, só o outro some, estoque não fica negativo).
create or replace function public.estornar_nota_entrada(p_nota_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_status         text;
  v_item           record;
  v_controla_serie boolean;
  v_serie          text;
  v_revertidos     int;
begin
  select status into v_status from notas_entrada where id = p_nota_id for update;
  if v_status <> 'recebida' then return; end if;

  for v_item in
    select produto_id, deposito_id, quantidade, series
    from itens_nota_entrada where nota_id = p_nota_id
  loop
    if v_item.produto_id is null or v_item.deposito_id is null then continue; end if;

    select controla_serie into v_controla_serie from produtos where id = v_item.produto_id;

    if v_controla_serie then
      v_revertidos := 0;
      for v_serie in select * from jsonb_array_elements_text(coalesce(v_item.series, '[]'::jsonb))
      loop
        delete from numeros_serie
          where produto_id = v_item.produto_id and serie = v_serie and status = 'em_estoque';
        if found then
          v_revertidos := v_revertidos + 1;
        end if;
      end loop;
      update estoque set quantidade = greatest(0, coalesce(quantidade, 0) - v_revertidos), updated_at = now()
        where produto_id = v_item.produto_id and deposito_id = v_item.deposito_id;
    else
      update estoque set quantidade = greatest(0, coalesce(quantidade, 0) - v_item.quantidade), updated_at = now()
        where produto_id = v_item.produto_id and deposito_id = v_item.deposito_id;
    end if;
  end loop;

  update notas_entrada set status = 'cancelada' where id = p_nota_id;
end;
$$;
