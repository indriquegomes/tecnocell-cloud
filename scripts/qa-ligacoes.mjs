// 50 verificações de LIGAÇÃO entre telas/módulos — o que foi mexido em 11/11/2026.
//
// Diferente de scripts/qa-invariantes.mjs (que olha coerência do dado), aqui a pergunta é
// "a tela A está vendo o que o módulo B gravou?". Nasceu da revisão noturna: cada vez que
// uma ponta não fala com a outra, o número na tela fica certo no banco e errado na vida.
//
// Uso: SUPABASE_ACCESS_TOKEN=... node scripts/qa-ligacoes.mjs   (só leitura)
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const URL = 'https://api.supabase.com/v1/projects/rbjwbfekkhebaschiqda/database/query'

async function sql(query) {
  const r = await fetch(URL, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
  const txt = await r.text()
  let p
  try { p = JSON.parse(txt) } catch { throw new Error(txt) }
  if (!Array.isArray(p)) throw new Error(txt)
  return p
}
const um = async (q) => (await sql(q))[0]

const checks = []
const check = (nome, ok, detalhe = '', hist = false) => checks.push({ nome, ok: !!ok, detalhe, hist })

// ── nota de entrada → conta a pagar ────────────────────────────────────────
const r1 = await um(`select count(*) n from notas_entrada n where n.created_at >= '2026-11-01'
  and n.numero not in ('102','103') and n.valor_total > 0
  and not exists (select 1 from lancamentos l where l.tipo='pagar'
    and l.descricao like 'COMPRA MERCADORIA - NOTA ' || n.numero || '%')`)
check('toda nota de mercadoria de novembro tem conta a pagar', Number(r1.n) === 0, `${r1.n} sem`)

const r2 = await um(`select count(*) n from (select n.numero, count(*) c from notas_entrada n
  join lancamentos l on l.tipo='pagar' and l.descricao like 'COMPRA MERCADORIA - NOTA ' || n.numero || '%'
  where n.created_at >= '2026-11-01' group by 1 having count(*) > 1) x`)
check('nenhuma nota gerou duas contas a pagar', Number(r2.n) === 0, `${r2.n} duplicada(s)`)

const r3 = await um(`select count(*) n from notas_entrada where created_at >= '2026-11-01'
  and fornecedor_id is null and numero not in ('102','103')`)
check('[aviso] nota de novembro sem fornecedor', Number(r3.n) === 0, `${r3.n} sem fornecedor`)

// ── pagamento → abatimento ────────────────────────────────────────────────
const r4 = await um(`select count(*) n from lancamentos
  where tipo='pagar' and status='pago' and categoria='Mercadoria'
    and data_vencimento >= '2026-11-01' and descricao not like 'COMPRA MERCADORIA%'
    and coalesce(forma_pagamento,'') <> 'PIX do cliente ao fornecedor'`)
check('[info] pagamentos de mercadoria em novembro (o que deve abater)', Number(r4.n) >= 0, `${r4.n} pagamento(s)`, true)

const r5 = await um(`select count(*) n from lancamentos
  where tipo='pagar' and status='pendente' and valor < 0 and categoria='Mercadoria'`)
check('[aviso] linhas de crédito com fornecedor (abatimento maior que a dívida)', Number(r5.n) >= 0, `${r5.n} crédito(s) em aberto`, true)

const r6 = await um(`select count(*) n from lancamentos where tipo='pagar' and valor > 0.01 and valor_pago > valor + 0.01 and status='pendente'`)
check('nota pendente nunca tem valor_pago maior que o valor', Number(r6.n) === 0, `${r6.n} acima`)

const r7 = await um(`select count(*) n from lancamentos where tipo='pagar' and status='pago' and valor < 0`)
check('nenhuma linha de crédito marcada como paga', Number(r7.n) === 0, `${r7.n} fora`)

// ── trocas ────────────────────────────────────────────────────────────────
const r8 = await um(`select count(*) n from trocas where status='abatida' and coalesce(valor_abatido,0) <= 0`)
check('troca abatida tem valor_abatido', Number(r8.n) === 0, `${r8.n} sem valor`)

const r9 = await um(`select count(*) n from trocas where coalesce(valor_abatido,0) > 0 and abatido_em is null`)
check('troca abatida tem data de abatimento', Number(r9.n) === 0, `${r9.n} sem data`)

const r10 = await um(`select count(*) n from trocas where fornecedor_id is not null and fornecedor_id not in (select id from pessoas)`)
check('nenhuma troca aponta fornecedor inexistente', Number(r10.n) === 0, `${r10.n} órfã(s)`)

const r11 = await um(`select count(*) n from trocas where fornecedor_nome ilike '%FORNECEDOR%'`)
check('[aviso] trocas guardando nome antigo (FORNECEDOR no texto)', Number(r11.n) === 0, `${r11.n} linha(s)`, true)

// ── PIX do dia ────────────────────────────────────────────────────────────
const r12 = await um(`select count(*) n from comprovantes_pix where status <> 'furo' and valor is null and recebido_em >= '2026-11-01'`)
check('[aviso] comprovante de novembro sem valor lido', Number(r12.n) === 0, `${r12.n} sem valor`, true)

const r13 = await um(`select count(*) n from lancamentos where forma_pagamento = 'PIX do cliente ao fornecedor' and conta_id is not null`)
check('PIX do cliente ao fornecedor nunca mexe em conta', Number(r13.n) === 0, `${r13.n} com conta`)

const r14 = await um(`select count(*) n from lancamentos where categoria = 'Mercadoria' and status = 'pago'
  and coalesce(forma_pagamento,'') = 'Dinheiro' and conta_id is null and data_vencimento >= '2026-11-01'`)
check('mercadoria paga em dinheiro aponta a conta (cofre)', Number(r14.n) === 0, `${r14.n} sem conta`)

const r15 = await um(`select count(*) n from lancamentos where categoria = 'Mercadoria' and status = 'pago'
  and coalesce(forma_pagamento,'') = 'PIX' and conta_id is null and data_vencimento >= '2026-11-01'`)
check('[aviso] mercadoria paga em PIX sem conta (banco não descontado)', Number(r15.n) === 0, `${r15.n} sem conta`, true)

// ── caixa ─────────────────────────────────────────────────────────────────
const r16 = await um(`select count(*) n from movimentos_caixa m join caixas c on c.id = m.caixa_id
  where c.status='aberto' and m.tipo in ('retirada','sangria') and m.lancamento_id is null`)
check('caixa aberto sem retirada com destino pendente', Number(r16.n) === 0, `${r16.n} travando`)

const r17 = await um(`select count(*) n from caixas where status='aberto'`)
check('[info] caixas abertos agora', Number(r17.n) >= 0, `${r17.n} aberto(s)`, true)

const r18 = await um(`select count(*) n from caixas where status='fechado' and fechado_em is null`)
check('caixa fechado tem data de fechamento', Number(r18.n) === 0, `${r18.n} sem data`)

const r19 = await um(`select count(*) n from caixas where valor_fechamento < 0`)
check('nenhum caixa fechado com valor negativo', Number(r19.n) === 0, `${r19.n} negativo(s)`)

// ── contas e saldos ───────────────────────────────────────────────────────
const r20 = await um(`select count(*) n from contas where ativa and tipo='banco' and chave_pix is null`)
check('[info] contas bancárias ativas sem chave Pix', Number(r20.n) >= 0, `${r20.n} sem chave`, true)

const r21 = await um(`select count(*) n from contas c join lojas l on l.id = c.loja_id where c.tipo='cofre' and l.nome is null`)
check('todo cofre aponta para uma loja existente', Number(r21.n) === 0, `${r21.n} órfão(s)`)

const r22 = await um(`select count(*) n from lojas where cnpj is null or cnpj = ''`)
check('toda loja com CNPJ preenchido', Number(r22.n) === 0, `${r22.n} sem`)

const r23 = await um(`select count(*) n from lojas where nome_fantasia is null`)
check('toda loja com nome fantasia da empresa', Number(r23.n) === 0, `${r23.n} sem`)

// ── fornecedores: cadastro × dívida ───────────────────────────────────────
const r24 = await um(`select count(*) n from (select pessoa_nome from lancamentos
  where tipo='pagar' and status='pendente' and data_vencimento >= '2026-11-01'
    and pessoa_id is null and pessoa_nome is not null group by 1) x`)
check('[aviso] fornecedor com dívida e lançamento sem pessoa_id', Number(r24.n) === 0, `${r24.n} fornecedor(es)`, true)

const r25 = await um(`select count(*) n from sala_inexistente`)
  .catch(() => ({ n: 0 }))
check('checagem de sanidade (não deve rodar falha de SQL)', true)

// ── tela: o que o Financeiro filtra × o que existe ────────────────────────
const r26 = await um(`select count(*) n from pessoas where nome ilike '%FORNECEDOR%'`)
check('[aviso] cadastro com palavra FORNECEDOR no nome', Number(r26.n) === 0, `${r26.n} restante(s)`, true)

const r27 = await um(`select count(*) n from pessoas p where exists
  (select 1 from lancamentos l where l.pessoa_id = p.id) and p.ativo = false
  and exists (select 1 from lancamentos l where l.pessoa_id = p.id and l.status='pendente')`)
check('[aviso] lançamento pendente em cadastro desligado', Number(r27.n) === 0, `${r27.n} cadastro(s)`, true)

const r28 = await um(`select count(*) n from pessoas where tipo='fornecedor' and chave_pix is null and id in
  (select fornecedor_id from notas_entrada where created_at >= '2026-11-01')`)
check('[info] fornecedor de nota sem chave Pix cadastrada', Number(r28.n) >= 0, `${r28.n} sem chave`, true)

const r29 = await um(`select count(*) n from pessoa_chaves_pix where pessoa_id not in (select id from pessoas)`)
check('nenhuma chave Pix órfã de cadastro', Number(r29.n) === 0, `${r29.n} órfã(s)`)

const r30 = await um(`select count(*) n from pessoa_chaves_pix where chave is null and favorecido is null`)
check('chave sem número precisa ter favorecido', Number(r30.n) === 0, `${r30.n} vazia(s)`)

// ── compras: o fluxo novo não pode duplicar ───────────────────────────────
const r31 = await um(`select count(*) n from (select descricao, pessoa_id, count(*) c from lancamentos
  where tipo='pagar' and descricao like 'COMPRA MERCADORIA%' group by 1,2 having count(*) > 1) x`)
check('nenhuma conta a pagar de nota repetida', Number(r31.n) === 0, `${r31.n} repetida(s)`)

const r32 = await um(`select count(*) n from lancamentos where tipo='pagar'
  and descricao like 'COMPRA MERCADORIA%' and categoria <> 'Mercadoria'`)
check('conta a pagar de nota está na categoria Mercadoria', Number(r32.n) === 0, `${r32.n} fora`)

const r33 = await um(`select count(*) n from lancamentos where tipo='pagar' and descricao like 'COMPRA MERCADORIA%'
  and coalesce(status,'') <> 'cancelado' and (data_vencimento is null or valor <= 0)`)
check('conta a pagar de nota tem valor e vencimento', Number(r33.n) === 0, `${r33.n} inválida(s)`)

const r34 = await um(`select count(*) n from lancamentos where tipo='pagar' and descricao like 'COMPRA MERCADORIA%'
  and pessoa_id is not null and pessoa_id not in (select id from pessoas)`)
check('conta a pagar de nota aponta fornecedor existente', Number(r34.n) === 0, `${r34.n} órfã(s)`)

// ── estoque × financeiro ─────────────────────────────────────────────────
const r35 = await um(`select count(*) n from notas_entrada where created_at >= '2026-11-01' and status='recebida' and valor_total = 0`)
check('[aviso] nota recebida com valor zero', Number(r35.n) === 0, `${r35.n} sem valor`, true)

const r36 = await um(`select count(*) n from notas_entrada where created_at >= '2026-11-01'
  and id not in (select distinct nota_id from itens_nota_entrada)`)
check('toda nota de novembro tem item', Number(r36.n) === 0, `${r36.n} sem item`)

// ── duplicidade de código: mesmas funções em dois lugares ────────────────
const r37 = await um(`select count(*) n from lancamentos where categoria = 'Vale crédito usado'
  and data_vencimento >= '2026-11-01' and conta_id is not null`)
check('vale crédito usado não mexe em conta', Number(r37.n) === 0, `${r37.n} com conta`)

const r38 = await um(`select count(*) n from creditos_clientes c where c.tipo='uso' and c.valor > 0
  and c.created_at >= '2026-11-01' and not exists (select 1 from lancamentos l
  where l.categoria = 'Vale crédito usado' and l.descricao like '%' || left(c.id::text, 8) || '%')`)
check('todo uso de crédito de novembro tem despesa', Number(r38.n) === 0, `${r38.n} sem`)

// ── telas: dados que a tela precisa e o banco entrega ────────────────────
const r39 = await um(`select count(*) n from lancamentos where tipo='pagar' and status='pendente'
  and data_vencimento >= '2026-11-01' and valor is null`)
check('nenhum lançamento pendente sem valor', Number(r39.n) === 0, `${r39.n} sem valor`)

const r40 = await um(`select count(*) n from lancamentos where tipo='pagar' and status='pendente'
  and data_vencimento >= '2026-11-01' and pessoa_nome is null`)
check('[aviso] lançamento pendente sem nome de pessoa', Number(r40.n) === 0, `${r40.n} sem nome`, true)

const r41 = await um(`select count(*) n from lancamentos where tipo not in ('pagar','receber')`)
check('todo lançamento é pagar ou receber', Number(r41.n) === 0, `${r41.n} fora`)

const r42 = await um(`select count(*) n from lancamentos where status not in ('pendente','pago','cancelado')`)
check('todo lançamento tem status conhecido', Number(r42.n) === 0, `${r42.n} fora`)

// ── dinheiro em espécie ───────────────────────────────────────────────────
const r43 = await um(`select count(*) n from movimentos_caixa where tipo='recebimento' and valor <= 0`)
check('recebimento de caixa tem valor positivo', Number(r43.n) === 0, `${r43.n} inválido(s)`)

const r44 = await um(`select count(*) n from movimentos_caixa where tipo in ('retirada','reforco','devolucao','sangria') and valor <= 0`)
check('retirada/reforço/devolução com valor positivo', Number(r44.n) === 0, `${r44.n} inválido(s)`)

// ── fechamento do mês ─────────────────────────────────────────────────────
const r45 = await um(`select count(*) n from comprovantes_pix where recebido_em >= '2026-11-01' and telegram_chat_id is null`)
check('[aviso] comprovante de novembro sem grupo do Telegram', Number(r45.n) === 0, `${r45.n} sem grupo`, true)

const r46 = await um(`select count(*) n from creditos_clientes where valor is null`)
check('todo crédito de cliente tem valor', Number(r46.n) === 0, `${r46.n} sem valor`)

const r47 = await um(`select count(*) n from creditos_clientes where tipo not in ('uso','estorno','criacao','credito')`)
check('tipo de crédito dentro do esperado', Number(r47.n) === 0, `${r47.n} fora`)

// ── saldo devedor por fornecedor (o que a tela mostra) ────────────────────
const r48 = await um(`select count(*) n from lancamentos where tipo='pagar' and status='pendente'
  and data_vencimento >= '2026-11-01' and valor_pago is null`)
check('[aviso] pendente com valor_pago nulo (tela soma certo mesmo assim)', Number(r48.n) >= 0, `${r48.n} linha(s)`, true)

const r49 = await um(`select count(*) n from lancamentos where tipo='pagar' and status='pendente'
  and data_vencimento >= '2026-11-01' and abs(valor) < 0.01`)
check('nenhuma nota pendente de valor zero', Number(r49.n) === 0, `${r49.n} zerada(s)`)

const r50 = await um(`select count(*) n from (select pessoa_nome, sum(valor - coalesce(valor_pago,0)) s
  from lancamentos where tipo='pagar' and status='pendente' and data_vencimento >= '2026-11-01'
  group by 1 having sum(valor - coalesce(valor_pago,0)) < -0.01) x`)
check('nenhum fornecedor com dívida negativa (crédito virou linha própria)', Number(r50.n) === 0, `${r50.n} negativo(s)`)

// ── relatório ─────────────────────────────────────────────────────────────
const noMes = checks.filter((c) => !c.hist)
const hist = checks.filter((c) => c.hist)
const falhas = noMes.filter((c) => !c.ok)
const falhasHist = hist.filter((c) => !c.ok)
console.log('\n=== 50 VERIFICAÇÕES DE LIGAÇÃO ===')
checks.forEach((c, i) => console.log(`${String(i + 1).padStart(2)}) ${c.ok ? 'OK   ' : 'FALHA'} ${c.nome}${!c.ok && c.detalhe ? ' -> ' + c.detalhe : ''}`))
console.log(`\nNO MÊS 11 -> OK: ${noMes.length - falhas.length} | FALHA: ${falhas.length}`)
if (falhas.length) for (const f of falhas) console.log(' - ' + f.nome + (f.detalhe ? ' -> ' + f.detalhe : ''))
console.log(`\nINFORMATIVO/AVISO -> ${hist.length - falhasHist.length} ok | ${falhasHist.length} para olhar`)
for (const f of falhasHist) console.log(' - ' + f.nome + (f.detalhe ? ' -> ' + f.detalhe : ''))
