-- Desfaz 2026-11-25T21:57:59.677Z — backup: fone-vitao-1795643879679.json

delete from public.lancamentos where id = 'e52521e4-b099-4b6c-8fb7-500d2e72231f';

update public.lancamentos
   set status = 'pago',
       updated_at = '2026-11-24T18:58:04.051+00:00'
 where id = '87fe1531-de08-437a-b736-d6ddd356929d';
