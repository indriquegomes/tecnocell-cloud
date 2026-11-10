-- A chave pode ser só o NOME do recebedor.
--
-- Nem todo destino de PIX aparece com chave cadastrada: o comprovante pode trazer
-- só o nome do favorecido (FERNANDES DA SILVA REPRESENTACAO COMERCIAL SJC LTDA,
-- PLANORH PLANEJAMENTO E ORGANIZACAO EMPRESARIAL). São a mesma fornecedora — a ZL
-- recebe por esses dois nomes — e sem uma linha para cada um o comprovante cai em
-- "não identificado" e a dívida não baixa.
--
-- Por isso `chave` deixa de ser obrigatória: uma linha com chave preenchida casa
-- pelo documento; uma linha só com o favorecido casa pelo nome.

alter table public.pessoa_chaves_pix alter column chave drop not null;
