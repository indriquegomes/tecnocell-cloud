-- Desfaz 2026-11-25T23:50:13.139Z (backup: contas-1795650613141.json)

update public.contas set nome = 'Cofre Petrópolis' where id = 'b7720f9d-8a58-4226-9ff0-1bb2e8ddca6c';
update public.contas set nome = 'Cofre Teresópolis' where id = 'f56081a9-c5b9-4e29-80b8-d56359ed9a7b';
update public.contas set nome = 'Cofre PagBank' where id = 'b389ba50-98ad-40e1-8348-a8f45aabc604';
update public.contas set nome = 'PagBank Teresópolis', ativa = 'false' where id = '46f729d4-7456-431f-823b-60283533d67b';
update public.contas set nome = 'PIX', ativa = 'false' where id = '9b812cd0-e0fe-41dd-ad31-06ee5323d11d';
update public.contas set nome = 'PIX Teresópolis', ativa = 'false' where id = 'cbff217b-a5ee-421b-9af3-3d8147268e43';
update public.contas set nome = 'TON', ativa = 'false' where id = 'bf56901a-9585-430f-a273-3a4918040128';
update public.contas set nome = 'TON Teresópolis', ativa = 'true' where id = '09b542f4-e84a-4a20-9b87-235346d56d01';
update public.contas set nome = 'VALE CREDITO', ativa = 'false' where id = 'b3d8cb4c-9d8b-4a3d-8073-19d578331819';
update public.formas_pagamento set conta_destino_id = 'bf56901a-9585-430f-a273-3a4918040128' where id = '149a52e9-ff13-4516-a475-b0dcd2e1e733';
update public.formas_pagamento set conta_destino_id = 'bf56901a-9585-430f-a273-3a4918040128' where id = '96c201e5-81bf-4984-8013-8bd242dce6ae';
update public.formas_pagamento set conta_destino_id = 'b3d8cb4c-9d8b-4a3d-8073-19d578331819' where id = 'FP_VALE';
insert into public.forma_conta_loja (forma_id, loja_id, conta_id) values ('149a52e9-ff13-4516-a475-b0dcd2e1e733', '81791d01-dc4a-485c-bbb8-f2b4cda6731c', '09b542f4-e84a-4a20-9b87-235346d56d01');
insert into public.forma_conta_loja (forma_id, loja_id, conta_id) values ('96c201e5-81bf-4984-8013-8bd242dce6ae', '81791d01-dc4a-485c-bbb8-f2b4cda6731c', '09b542f4-e84a-4a20-9b87-235346d56d01');
