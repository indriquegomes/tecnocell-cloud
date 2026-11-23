# Desenho — botão "Desconto 2ª peça (garantia)" no PDV

> Proposta de 23/11/2026, para o dono aprovar ANTES de qualquer código. Nada foi mexido.

## Por que um botão e não digitar direto

Digitar no campo Desconto é livre e sem rastro: o app não sabe se foi promoção de quebra,
não sabe se o cliente já usou a vez dele e não sabe se a peça é TOP 20. O botão amarra a
regra inteira: cliente, motivo, "uma vez só" e top 20.

## Onde fica

- **Na linha da peça no carrinho**, ao lado do desconto do item: botão **"🎁 2ª peça
  (garantia)"**.
- No PDV, a peça já chega com o selo TOP 20 na busca e no carrinho.

## O que acontece quando o operador clica

Abre um modal pequeno:

1. **Cliente** — busca por nome (obrigatório; sem cliente não aplica).
2. **A tela quebrada** — confirmação: "cliente trouxe a tela quebrada comprada dentro da
   garantia (3 meses)?" (obrigatório marcar). Campo opcional com a data da compra anterior.
3. **Desconto** — % (padrão 40) ou R$; editável, porque varia por peça.
4. **Verificação automática**:
   - Peça do carrinho é **TOP 20** → recusa: "peça TOP 20 não entra em desconto".
   - Cliente **já usou** esse benefício → avisa com data e peça; bloqueia (ou pede senha
     do gerente — decisão do dono).
5. **Senha do gerente** — se a loja exige senha para desconto, pede a mesma de hoje.
6. Botão **"Aplicar desconto"**.

## O que grava

- O desconto na linha do item (como o desconto de item que já existe).
- **Motivo "Segunda peça (garantia)"** amarrado à venda — para o relatório separar.
- **Benefício do cliente**: cliente, peça, data, valor e % — é o carimbo que se perdeu.
  Quando o cliente voltar, o app mostra "já usou em 12/11".

## Impacto técnico (para depois da aprovação)

- Migration: coluna de motivo na venda + tabela de benefícios do cliente + permissão
  própria (senão só o master usa).
- PDV: modal novo na linha do item; o desconto manual continua existindo para outros casos.
- Servidor valida de novo (top 20, já usou, cliente) — não confia só na tela.
- Vendas, caixa e financeiro: o desconto já existe; só passa a ter motivo e registro.
- Relatório: quantos descontos de segunda peça no mês e quanto custou.

## Decisões que o dono precisa tomar

1. Cliente que já usou: **bloqueia de vez** ou libera com senha do gerente? → **com senha**
   (decidido em 23/11).
2. O desconto % padrão é 40? Quem pode mudar o % (gerente ou vendedor)? → **vendedor pode
   até 40%; acima disso, senha do gerente** (decidido em 23/11).
3. Senha de desconto da loja: continuar valendo para este botão? → **sim** (decidido em
   23/11).

## Implementado em 23/11 (aguardando SQL + deploy)

- Botão 🎁 na linha da peça do carrinho do PDV.
- Modal: cliente da venda, confirmação "tela quebrada dentro da garantia (3 meses)",
  percentual (padrão 40, botão "40%"), senha do gerente quando o cliente já usou ou o
  percentual passa de 40.
- Migration `2026-11-23-desconto-segunda-peca.sql`: tabela `beneficios_segunda_peca`
  (o carimbo de verdade — quem usou, peça, venda, %, valor, data).
- O servidor confere tudo de novo (`conferirBeneficioSegundaPeca` /
  `registrarBeneficioSegundaPeca`): TOP 20 nunca entra, já usou e >40% exigem a senha.
- O registro do uso é gravado quando a venda conclui (com o `venda_id`).
- Pendente para uma próxima: relatório de quantos descontos de segunda peça no mês.
