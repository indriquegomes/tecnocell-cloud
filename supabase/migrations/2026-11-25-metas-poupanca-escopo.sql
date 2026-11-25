-- Potes pessoais × metas da empresa.
--
-- O painel divertido da aba Particular (protótipo aprovado pelo dono) tem
-- "Meus potinhos" PESSOAIS, separados das metas do negócio. A tabela
-- metas_poupanca já existe; aqui entra a coluna que diz de quem é o pote.
--
-- linha antiga (criada antes desta coluna) vira 'empresa' — é o caso das 4
-- metas do painel financeiro (Reserva, Impostos, Equipamentos, Meta do ano).
-- Potes pessoais nascem com 'pessoal' e NÃO aparecem no painel da empresa.

alter table public.metas_poupanca add column if not exists escopo text not null default 'empresa';

create index if not exists metas_poupanca_escopo_idx on public.metas_poupanca (escopo, ativo);
