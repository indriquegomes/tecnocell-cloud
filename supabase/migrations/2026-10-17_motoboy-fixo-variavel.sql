-- Motoboy: modelo FIXO x VARIÁVEL (decisão do dono 16/10).
--   fixo     = salário semanal fixo, DÉBITO AUTOMÁTICO no PagBank (o sistema só
--              registra como despesa já paga — não cobra, não duplica).
--   variavel = comissão (por entrega + por extra), somada seg→sáb, PIX no sábado.
-- Reaproveita motoboy_tipo (text): 'diaria'/'semanal' viram 'fixo'/'variavel'.

-- Default de motoboy novo: variável (comissão) — mais seguro que um fixo fantasma.
alter table public.perfis alter column motoboy_tipo set default 'variavel';

-- Erick → fixo 950, Petrópolis (custo sai da Petrópolis)
update public.perfis
  set motoboy_tipo = 'fixo', pdv_loja_id = 'e41aa9ea-820d-44d2-a04a-2e4efc8b0946'
  where id = '45da9f4c-ebcb-455d-8e72-351d9a3990e9';

-- Nikollas → fixo 720, Petrópolis
update public.perfis
  set motoboy_tipo = 'fixo', pdv_loja_id = 'e41aa9ea-820d-44d2-a04a-2e4efc8b0946'
  where id = '145dba40-7602-47d8-b922-27f1389c7341';

-- Isaac → fixo 600, reativar, custo Teresópolis (entrega nas 2 lojas, custo Tere)
update public.perfis
  set motoboy_tipo = 'fixo', ativo = true, pdv_loja_id = '81791d01-dc4a-485c-bbb8-f2b4cda6731c'
  where id = '560f4f16-8979-4011-94f6-aa0b90953ed2';

-- Giovane → variável (comissão), fixo 0, Teresópolis
update public.perfis
  set motoboy_tipo = 'variavel', motoboy_valor_fixo = 0, pdv_loja_id = '81791d01-dc4a-485c-bbb8-f2b4cda6731c'
  where id = 'b45d68b4-dd1c-486d-a292-d5b62694b849';

-- Lucas → variável (comissão), fixo 0, Teresópolis
update public.perfis
  set motoboy_tipo = 'variavel', motoboy_valor_fixo = 0, pdv_loja_id = '81791d01-dc4a-485c-bbb8-f2b4cda6731c'
  where id = '00475e4c-d148-4868-8766-b60b7222ebce';

-- Sobras de valor antigo ('diaria'/'semanal') viram 'variavel' — nenhum MOTOBOY
-- pode ficar com um valor que o código novo não entende. Só cargo MOTOBOY (a
-- coluna existe pra todo perfil, mas só motoboy usa).
update public.perfis
  set motoboy_tipo = 'variavel'
  where motoboy_tipo in ('diaria', 'semanal')
    and cargo_id = (select id from public.cargos where nome = 'MOTOBOY');

-- Reativar o login do Isaac (estava banido por ter saído; voltou como motoboy).
update auth.users
  set banned_until = null
  where email = 'isaacbento@tecnocell.local';

-- Fixos agora debitam sozinhos no PagBank: desativa os lembretes PIX deles
-- (se ficassem, o sábado mandaria pagar de novo por PIX → paga 2x).
update public.lembretes
  set ativo = false
  where tipo = 'pagamento' and (titulo ilike '%ERICK%' or titulo ilike '%Nikollas%');
