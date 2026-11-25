-- Monitoramento em uso: o que quebrou na mão de quem estava trabalhando.
--
-- Não é log de auditoria (isso é logs_atividade): aqui entra o problema que a
-- pessoa VIU — tela que não carregou, ação que falhou, promessa que estourou —
-- com a rota, a hora e quem estava usando. A tela Saúde do sistema lê daqui, e o
-- vigia (/api/vigia/erros) avisa o dono no grupo privado do Telegram.
--
-- RLS ligado e SEM policy de propósito: nem usuário logado lê o erro de outro.
-- O único caminho de leitura é a service role, usada pela tela e pelo vigia.
--
-- agrupamento = hash de (tela + título). Serve para o MESMO problema não virar
-- 50 linhas nem 50 avisos; avisado_em marca quando esse grupo já foi avisado
-- (um problema que se repete não volta ao Telegram antes de 1 hora).

create table if not exists erros_app (
  id uuid default gen_random_uuid() not null,
  created_at timestamptz default now() not null,
  origem text not null,                     -- 'tela' | 'servidor' | 'vigia'
  gravidade text default 'erro' not null,   -- 'erro' | 'atencao'
  tela text,                                -- rota (/painel/pdv)
  titulo text not null,                     -- resumo curto, sem dado de cliente
  mensagem text,                            -- detalhe técnico já saneado
  agrupamento text not null,                -- hash (tela | título)
  usuario_id uuid,                          -- quem estava usando (equipe, não cliente)
  usuario_email text,
  loja_id uuid,
  digest text,                              -- código que aparece na tela de erro
  contexto jsonb default '{}'::jsonb not null,
  avisado_em timestamptz,
  primary key (id)
);

create index if not exists idx_erros_app_data   on erros_app (created_at desc);
create index if not exists idx_erros_app_grupo  on erros_app (agrupamento, avisado_em);
create index if not exists idx_erros_app_tela   on erros_app (tela, created_at desc);

alter table erros_app enable row level security;

-- Nenhuma policy de select/insert/update/delete: escrita e leitura só pela
-- service role (rotas e tela). Se um dia o dono precisar ler direto do navegador,
-- criar policy com is_master — hoje não precisa, a tela é server component.
