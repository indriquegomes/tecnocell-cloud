# Ambiente separado de testes — plano e execução

**Objetivo:** App e Cloud de homologação usam somente o Supabase pessoal tecnocell-testes, sem estoque, usuários ou financeiro de produção.

**Arquitetura aprovada:** projetos Supabase e Vercel separados na conta pessoal do titular; worktrees no D:; mesmo código-base e schema reconciliado, dados fictícios, identidade Android distinta. Nenhuma implantação no Cloud da loja.

## Recursos criados

- Supabase `tecnocell-testes`, organização pessoal missao, São Paulo, ref `gzetgvbzsinulxgxtflg`.
- Vercel `tecnocell-cloud-testes`, equipe pessoal vitaomfs-projects, id `prj_YQDFt6bVg7iefS6Sy6aB3UwmDX0x`.
- Origem Cloud `e1dedba21c31d5438a9bab85005e6a6471f8a05b`; origem App `cd2bf18`.
- Worktrees `D:\projetos\tecnocell-homologacao-20261101\cloud` e `cliente`, branch codex/homologacao-20261101.

## Execução

- [x] Confirmar organizações com o titular e criar recursos separados.
- [x] Configurar URL/chave pública do Supabase novo no Vercel; manter flags de atendimento/automação desligadas.
- [x] Conferir banco novo: zero tabelas public e zero usuários Auth.
- [x] Preparar configs testadas que recusam banco de produção, crons e credenciais de integrações externas.
- [ ] Extrair schema efetivo de TECNOCELL.CLAUD somente em leitura; comparar funções/policies e versionar baseline fiel, sem dados pessoais nem segredos.
- [ ] Validar baseline em banco isolado e aplicar exclusivamente no projeto novo; sem db push geral.
- [ ] Criar dois clientes fictícios, operador fictício, unidades e produtos/estoque de teste, com senha digitada pelo titular ou provisionada com segurança.
- [ ] Configurar chave administrativa NOVA apenas no servidor de testes; não reutilizar chave de produção.
- [ ] Configurar Auth/redirects de testes; Google fica desligado até configuração própria.
- [ ] Publicar Cloud no projeto novo, sem cron e com identificação Testes.
- [ ] Preparar APK com nome/pacote/scheme próprios e apontar ao banco novo; contatos reais desligados.
- [ ] Validar cadastro/aprovação/pedido/PDV/F9/cancelamento/RLS e nova tentativa sem duplicidade.

## Bloqueio atual

O conector pessoal acessa o novo projeto, mas recusou SELECT em TECNOCELL.CLAUD. Titular informou que vai reconectar à conta Tecnocell Corp. Aguardar confirmação de acesso antes de exportar a estrutura. Não reconstruir contrato a partir de suposições: migrations locais não criam todos os objetos base do App.

Ainda faltam schema, chave administrativa do projeto novo, configuração Auth, dados fictícios, deploy e APK. Projetos criados não equivalem a ambiente funcional homologado.

## Validação local concluída

- App: 215/215 Jest, 17 suítes; TypeScript aprovado; 3 testes Node de configuração aprovados.
- Expo leu a configuração efetiva e retornou Tecnocell Teste / com.tecnocell.app.testes / tecnocelltestes.
- Exportação Android: Metro/Hermes concluída, 1680 módulos, bundle local em dist. Não é APK nativo.
- Cloud: TypeScript aprovado após next typegen, 3 testes do guard aprovados, npm run build concluído (108 páginas).
- npm ci concluído nos dois worktrees com node_modules próprios; sem junctions.
- Host e chave pública do banco novo configurados no Vercel. Nenhuma chave administrativa nova encontrada ainda.
