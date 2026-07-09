-- Foto de perfil do usuário (Meu Perfil). Guarda a URL pública da imagem
-- no storage (bucket 'produtos', prefixo avatars/). Coluna simples e opcional.
alter table perfis add column if not exists avatar_url text;
