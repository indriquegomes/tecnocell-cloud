begin;
do $seed_guard$ begin
 if exists(select from public.lojas) or exists(select from public.produtos) or (select count(*) from auth.users where email in ('cliente1@tecnocell.test','cliente2@tecnocell.test','operador@tecnocell.test'))<>3 then raise exception 'Seed bloqueado: estado inesperado'; end if;
end $seed_guard$;
insert into public.lojas(nome,razao_social,endereco,cidade,ativa,termos_venda) values
('Petrópolis','TESTE - Unidade fictícia Petrópolis','Rua Fictícia TESTE, 1','Cidade TESTE',true,'AMBIENTE TESTE - sem validade comercial'),
('Teresópolis','TESTE - Unidade fictícia Teresópolis','Rua Fictícia TESTE, 2','Cidade TESTE',true,'AMBIENTE TESTE - sem validade comercial');
insert into public.depositos(id,nome,loja_id,disponivel_app,descricao) select 'TESTE-DEP-'||case nome when 'Petrópolis' then 'PET' else 'TER' end,'TESTE - Estoque fictício '||nome,id,true,'Somente dados fictícios; sem vínculo com estoque real' from public.lojas;
insert into public.contas(nome,tipo,saldo_inicial,loja_id,titular) select 'TESTE - Caixa fictício '||nome,'banco',0,id,'TESTE - sem conta bancária real' from public.lojas;
update public.lojas l set deposito_padrao_id=d.id,conta_padrao_id=c.id from public.depositos d,public.contas c where d.loja_id=l.id and c.loja_id=l.id;
insert into public.pedidos_app_unidades(unidade,loja_id) select nome,id from public.lojas;
insert into public.formas_pagamento(id,nome,tipo,conta_destino_id,loja_id) select 'TESTE-DINHEIRO-'||case l.nome when 'Petrópolis' then 'PET' else 'TER' end,'Dinheiro TESTE '||l.nome,'dinheiro',c.id,l.id from public.lojas l join public.contas c on c.loja_id=l.id;
insert into public.categorias(hierarquia,nome) values ('TESTE','TESTE - Acessórios fictícios');
insert into public.marcas(nome) values ('TESTE - Marca fictícia');
insert into public.produtos(id,nome,descricao,preco,preco_custo,categoria,marca,codigo,ativo,visivel_catalogo) values
('TESTE-PROD-1','TESTE - Cabo fictício','Produto fictício para homologação; não vender',25,10,'TESTE','TESTE - Marca fictícia','TESTE001',true,true),
('TESTE-PROD-2','TESTE - Tela fictícia','Produto fictício para homologação; não vender',100,50,'TESTE','TESTE - Marca fictícia','TESTE002',true,true);
insert into public.estoque(produto_id,deposito_id,quantidade) select p.id,d.id,20 from public.produtos p cross join public.depositos d;
insert into public.pessoas(id,nome,tipo,email,ativo,origem,observacoes) values
('TESTE-CLIENTE-1','TESTE - Cliente Um','cliente','cliente1@tecnocell.test',true,'TESTE','Pessoa fictícia, não enviar mensagens'),
('TESTE-CLIENTE-2','TESTE - Cliente Dois','cliente','cliente2@tecnocell.test',true,'TESTE','Pessoa fictícia, não enviar mensagens');
insert into public.cadastros_clientes(user_id,nome_completo,usuario,email,pessoa_id,status)
select id,case email when 'cliente1@tecnocell.test' then 'TESTE Cliente Um' else 'TESTE Cliente Dois' end,case email when 'cliente1@tecnocell.test' then 'teste.cliente1' else 'teste.cliente2' end,email,case email when 'cliente1@tecnocell.test' then 'TESTE-CLIENTE-1' else null end,case email when 'cliente1@tecnocell.test' then 'aprovado' else 'pendente' end from auth.users where email in ('cliente1@tecnocell.test','cliente2@tecnocell.test');
insert into public.perfis(id,nome,cargo,is_master,ativo,username,lojas_permitidas,pdv_loja_id,pdv_deposito_id,caixa_numero)
select u.id,'TESTE Operador','dono',true,true,'teste.operador',array(select id from public.lojas),l.id,d.id,1 from auth.users u cross join public.lojas l join public.depositos d on d.loja_id=l.id where u.email='operador@tecnocell.test' and l.nome='Petrópolis';
insert into public.caixas(usuario_id,aberto_por,loja_id,valor_abertura,obs_abertura) select p.id,p.id,p.pdv_loja_id,0,'TESTE - caixa fictício' from public.perfis p where username='teste.operador';
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('cadastros-clientes','cadastros-clientes',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']);
commit;
