-- Pagamento recorrente: chave PIX pra copiar na hora de pagar + comprovante
-- obrigatório pra marcar como FEITO (só some depois do pagamento).
alter table lembretes add column if not exists chave_pix text;

alter table lembretes_feitos add column if not exists comprovante_url text;

-- RPC atualizado: aceita o caminho do comprovante e grava junto. Idêntico ao de
-- 2026-07-14_lembretes.sql, só com o p_comprovante_url a mais.
-- IMPORTANTE: dropa a versão antiga (3 params) ANTES. `create or replace` não
-- substitui função de assinatura diferente — cria OVERLOAD, e o PostgREST não
-- consegue escolher (erro PGRST203).
drop function if exists public.marcar_lembrete_feito(uuid, uuid, date);

create or replace function marcar_lembrete_feito(
  p_lembrete_id uuid,
  p_perfil_id   uuid,
  p_data        date,
  p_comprovante_url text default null
)
returns jsonb
language plpgsql
security definer
as $function$
declare
  v_ja record;
begin
  select f.perfil_id, f.feito_em into v_ja
  from lembretes_feitos f
  where f.lembrete_id = p_lembrete_id and f.data = p_data;

  if found then
    return jsonb_build_object('ja_feito', true, 'perfil_id', v_ja.perfil_id, 'feito_em', v_ja.feito_em);
  end if;

  insert into lembretes_feitos (lembrete_id, data, perfil_id, comprovante_url)
  values (p_lembrete_id, p_data, p_perfil_id, p_comprovante_url)
  on conflict (lembrete_id, data) do nothing;

  return jsonb_build_object('ja_feito', false);
end;
$function$;

-- Chaves PIX dos pagamentos semanais (lista corrigida em 09/09).
update lembretes set chave_pix = '64001237000170' where titulo = 'Pagamento: MARIA EDUARDA KAPPLER DA SILVA';
update lembretes set chave_pix = '63886068000130' where titulo = 'Pagamento: MARIANA VILA REAL CASTELLI';
update lembretes set chave_pix = '63999373000138' where titulo = 'Pagamento: BRUNNA FURTADO GONÇALVES';
update lembretes set chave_pix = 'cc33285c-99f7-4587-ade7-5e997f0c2684' where titulo = 'Pagamento: Nikollas Bernardo Leocadio';
update lembretes set chave_pix = '11959579711' where titulo = 'Pagamento: ERICK ALVES DE MATTOS';

-- Isaac saiu da lista — pausa (não apaga, reversível).
update lembretes set ativo = false where titulo = 'Pagamento: ISAAC BENTO MORELLI';

-- Novos: valor em branco e pausados até você preencher valor + dia.
insert into lembretes (titulo, descricao, hora, dias, ativo, tipo, valor, chave_pix) values
  ('Pagamento: ISABELA PONCIANO CAMARA', 'PIX', '09:00', '{6}', false, 'pagamento', null, '24993117516'),
  ('Pagamento: ISABELLA PEREIRA BULHÕES', 'PIX', '09:00', '{6}', false, 'pagamento', null, '21968948258'),
  ('Pagamento: VITÓRIA RANYELLE', 'PIX', '09:00', '{6}', false, 'pagamento', null, '21975990316');

