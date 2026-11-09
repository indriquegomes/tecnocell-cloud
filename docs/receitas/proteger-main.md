# Proteger a `main` no GitHub (2 minutos)

> Por que fazer isto: nos últimos 30 dias entraram **249 mudanças**, e só 9
> passaram por revisão. Cerca de **130** dessas mexeram em dinheiro, caixa,
> fiado ou conta. Nada impede que uma mudança pela metade chegue na loja.
>
> Proteger a `main` não muda nada do que está no ar hoje. Só impede que mudança
> nova entre **sem passar pela conferência automática**.

## O que fazer

1. Abra no navegador: `https://github.com/indriquegomes/tecnocell-cloud/settings/branches`
   (precisa estar logado como dono do repositório).
2. Clique no botão **Add branch protection rule** (ou *Add classic branch
   protection rule*).
3. Em **Branch name pattern**, digite exatamente: `main`
4. Marque **Require a pull request before merging**.
   - Deixe **Required approvals** em `0`. Você trabalha sozinho; exigir
     aprovação de outra pessoa travaria você mesmo.
5. Ainda dentro desse bloco, marque **Require status checks to pass before
   merging** e, na lista que aparece, escolha:
   - `tsc` (o mesmo nome que aparece em Actions → "Type check")
   - `dinheiro` (aparece depois da primeira vez que o teste rodar; se ainda não
     aparecer, salve agora e volte aqui depois de abrir um pull request)
6. Marque **Do not allow bypassing the above settings**. É o que faz a regra
   valer até para você.
7. Clique em **Create** (verde, no rodapé).

## Como usar no dia a dia

- Mudança pequena e com pressa: dá para fazer direto pela tela do GitHub —
  criar a branch, editar o arquivo e clicar em **Create pull request**. O
  GitHub oferece o botão **Merge** assim que a conferência ficar verde.
- Mudança de dinheiro, caixa, estoque ou banco: **sempre** por pull request,
  mesmo com pressa. É a única hora em que a conferência automática olha o
  dinheiro antes de a loja usar.

## Se algo der errado

- A conferência ficou vermelha e você precisa subir assim mesmo: **não** desligue
  a proteção. Volte o commit (`Revert`) ou peça uma sessão de agente para
  consertar — a mensagem de erro diz qual conta discordou.
- Quiser desfazer a proteção: mesma tela, botão **Delete** na regra `main`.
  Nada do app muda.

## Depois que a `main` estiver protegida

A `main` passa a receber código só por pull request. Isso combina com o teste
do dinheiro: em cada pull request, o GitHub monta um banco de treino e confere
se as contas batem entre as telas — antes de a mudança chegar na loja.
