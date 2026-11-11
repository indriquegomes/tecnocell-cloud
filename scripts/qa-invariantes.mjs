// 50 verificações de invariante no banco — SÓ LEITURA.
//
// Roda contra o banco de produção e responde uma pergunta por linha: "o dado está
// coerente?". Nasceu da revisão de 10/11/2026 e serve para rodar de novo depois de
// qualquer mexida em contas, chaves Pix, lançamentos, notas ou vale-crédito.
//
// Uso: SUPABASE_ACCESS_TOKEN=... node scripts/qa-invariantes.mjs
// O token é de gestão do projeto (Management API), não fica no repositório.
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const URL = 'https://api.supabase.com/v1/projects/rbjwbfekkhebaschiqda/database/query'

async function sql(query) {
  const r = await fetch(URL, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
  const txt = await r.text()
  let p; try { p = JSON.parse(txt) } catch { throw new Error(txt) }
  if (!Array.isArray(p)) throw new Error(txt)
  return p
}
const um = async (q) => (await sql(q))[0]

const checks = []
// `hist` marca o achado que é de setembro/outubro: fica registrado, mas não conta como
// falha do mês 11 — a conferência combinada com o dono é do mês 11.
function check(nome, ok, detalhe = '', hist = false) { checks.push({ nome, ok, detalhe, hist }) }

// ── contas ────────────────────────────────────────────────────────────────
const r1 = await um(`select count(*) n from contas where chave_pix is not null and (titular is null or trim(titular) = '')`)
check('conta com chave Pix também tem titular', Number(r1.n) === 0, `${r1.n} sem titular`)

const r2 = await um(`select count(*) n from (select chave_pix from contas where chave_pix is not null group by 1 having count(*) > 1) x`)
check('nenhuma chave Pix repetida entre contas', Number(r2.n) === 0, `${r2.n} repetida(s)`)

const r3 = await um(`select count(*) n from contas where numero_conta is not null and tipo not in ('banco')`)
check('número de conta só em conta tipo banco', Number(r3.n) === 0, `${r3.n} fora`)

const r4 = await um(`select count(*) n from contas where saldo_inicial is null`)
check('toda conta tem saldo inicial numérico', Number(r4.n) === 0, `${r4.n} nula(s)`)

const r5 = await um(`select count(*) n from contas where banco is not null and (agencia is null or numero_conta is null)`)
check('conta com banco preenchido tem agência e número', Number(r5.n) === 0, `${r5.n} incompleta(s)`)

const r6 = await um(`select count(*) n from contas c left join lojas l on l.id = c.loja_id where c.loja_id is not null and l.id is null`)
check('nenhuma conta aponta para loja inexistente', Number(r6.n) === 0, `${r6.n} órfã(s)`)

// ── lojas / empresas ──────────────────────────────────────────────────────
const r8 = await um(`select count(*) n from lojas where cnpj is null or length(regexp_replace(cnpj,'\\D','','g')) <> 14`)
check('toda loja tem CNPJ com 14 dígitos', Number(r8.n) === 0, `${r8.n} inválida(s)`)

const r9 = await um(`select count(*) n from (select cnpj from lojas group by 1 having count(*) > 1) x`)
check('nenhum CNPJ repetido entre lojas', Number(r9.n) === 0, `${r9.n} repetido(s)`)

const r10 = await um(`select count(*) n from lojas where razao_social is null or trim(razao_social) = ''`)
check('toda loja tem razão social', Number(r10.n) === 0, `${r10.n} sem razão`)

const r11 = await um(`select count(*) n from lojas where nome_fantasia is null`)
check('toda loja tem nome fantasia da empresa', Number(r11.n) === 0, `${r11.n} sem fantasia`)

const r12 = await um(`select count(*) n from lojas where data_abertura is null or natureza_juridica is null or cnae_principal is null`)
check('ficha da empresa completa (abertura, natureza, CNAE)', Number(r12.n) === 0, `${r12.n} incompleta(s)`)

const r13 = await um(`select count(*) n from lojas where cidade is null or uf is null or cep is null or endereco is null`)
check('endereço da loja completo', Number(r13.n) === 0, `${r13.n} incompleta(s)`)

// ── chaves Pix da pessoa ──────────────────────────────────────────────────
const r14 = await um(`select count(*) n from (select chave from pessoa_chaves_pix where chave is not null group by 1 having count(*) > 1) x`)
check('nenhuma chave de pessoa repetida', Number(r14.n) === 0, `${r14.n} repetida(s)`)

const r15 = await um(`select count(*) n from pessoa_chaves_pix k left join pessoas p on p.id = k.pessoa_id where p.id is null`)
check('nenhuma chave aponta para pessoa inexistente', Number(r15.n) === 0, `${r15.n} órfã(s)`)

const r16 = await um(`select count(*) n from pessoa_chaves_pix where favorecido is null or trim(favorecido) = ''`)
check('toda chave/nome tem favorecido', Number(r16.n) === 0, `${r16.n} sem favorecido`)

const r17 = await um(`select count(*) n from pessoa_chaves_pix where chave is null and (tipo is null or tipo = '')`)
check('linha só com nome tem tipo explicando', Number(r17.n) === 0, `${r17.n} sem tipo`)

// ── lançamentos ───────────────────────────────────────────────────────────
const r18 = await um(`select count(*) n from lancamentos l left join pessoas p on p.id = l.pessoa_id where l.pessoa_id is not null and p.id is null`)
check('nenhum lançamento aponta para pessoa inexistente', Number(r18.n) === 0, `${r18.n} órfão(s)`)

const r19 = await um(`select count(*) n from lancamentos where pessoa_nome in ('H2O FORNECEDOR','ADL FORNECEDOR','ZL CELL FORNECEDOR','INOVA MERCADORIAS','PLANETA CELL') and pessoa_id is null`)
check('nenhum lançamento dos 5 grandes sem vínculo', Number(r19.n) === 0, `${r19.n} sem vínculo`)

const r20 = await um(`select count(*) n from lancamentos where categoria = 'Mercadoria' and descricao ilike '%PAGAMENTO DE MERCADORIA%' and categoria <> 'Mercadoria'`)
check('pagamento de mercadoria na categoria Mercadoria', Number(r20.n) === 0)

const r21 = await um(`select count(*) n from lancamentos where tipo = 'pagar' and categoria = 'Vendas' and descricao ilike '%MERCADORIA%'`)
check('nenhuma compra de mercadoria sobrando em "Vendas"', Number(r21.n) === 0, `${r21.n} sobrando`, true)

const r22 = await um(`select count(*) n from lancamentos where tipo = 'pagar' and status = 'pago' and valor_pago is null`)
check('pagamento quitado tem valor_pago', Number(r22.n) === 0, `${r22.n} sem valor_pago`)

const r23 = await um(`select count(*) n from lancamentos where status = 'pago' and data_pagamento is null`)
check('pagamento quitado tem data de pagamento', Number(r23.n) === 0, `${r23.n} sem data`)

const r24 = await um(`select count(*) n from lancamentos where valor < 0 and categoria not in ('Estorno','Devolução ao cliente','Vale crédito usado','Mercadoria')`)
check('valor negativo só em estorno/devolução/crédito', Number(r24.n) === 0, `${r24.n} fora`)

const r25 = await um(`select count(*) n from lancamentos where status = 'pago' and valor_pago > valor + 0.01`)
check('valor pago não passa do valor da conta', Number(r25.n) === 0, `${r25.n} acima`, true)

// ── vale-crédito (regra nova) ─────────────────────────────────────────────
const r26 = await um(`select count(*) n from creditos_clientes c where c.tipo = 'uso' and coalesce(c.valor,0) > 0 and c.created_at >= '2026-11-01' and not exists (
  select 1 from lancamentos l where l.categoria = 'Vale crédito usado' and l.descricao like '%' || left(c.id::text, 8) || '%')`)
check('todo uso de crédito tem lançamento de despesa', Number(r26.n) === 0, `${r26.n} sem lançamento`)

const r27 = await um(`select count(*) n from (select substring(descricao from '\(crédito ([0-9a-f]{8})\)') credito, count(*) c from lancamentos
  where categoria = 'Vale crédito usado' and descricao like '%(crédito%' and data_vencimento >= '2026-11-01' group by 1 having count(*) > 1) x`)
check('nenhum uso de crédito lançado duas vezes', Number(r27.n) === 0, `${r27.n} duplicado(s)`)

const r28 = await um(`select count(*) n from lancamentos where categoria = 'Vale crédito usado' and (tipo <> 'pagar' or status <> 'pago')`)
check('despesa de vale crédito é pagar e pago', Number(r28.n) === 0, `${r28.n} fora`)

const r29 = await um(`select count(*) n from lancamentos where categoria = 'Vale crédito usado' and conta_id is not null`)
check('despesa de vale crédito não mexe em conta', Number(r29.n) === 0, `${r29.n} com conta`)

const r30 = await um(`select count(*) n from creditos_clientes where tipo not in ('uso','estorno','criacao','credito')`)
check('tipo de crédito dentro do esperado', Number(r30.n) === 0, `${r30.n} fora`)

// ── notas e fornecedores ──────────────────────────────────────────────────
const r31 = await um(`select count(*) n from notas_entrada where fornecedor_id is not null and fornecedor_id not in (select id from pessoas)`)
check('nenhuma nota aponta fornecedor inexistente', Number(r31.n) === 0, `${r31.n} órfã(s)`)

const r32 = await um(`select count(*) n from notas_entrada where numero = '103' and coalesce(observacoes,'') = ''`)
check('nota 103 marcada como não sendo dívida', Number(r32.n) === 0)

const r33 = await um(`select count(*) n from pessoas where nome ilike '%FORNECEDOR%' or nome ilike '%MERCADORIA%'`)
check('[aviso] cadastro com palavra de tipo no nome', Number(r33.n) === 0, `${r33.n} restante(s)`)

const r34 = await um(`select count(*) n from (select nome from pessoas group by 1 having count(*) > 1) x`)
check('[aviso] nenhum nome de pessoa repetido', Number(r34.n) === 0, `${r34.n} nome(s) repetido(s)`)

const r35 = await um(`select count(*) n from pessoas where tipo not in ('cliente','fornecedor','ambos')`)
check('tipo de pessoa dentro do esperado', Number(r35.n) === 0, `${r35.n} fora`)

const r36 = await um(`select count(*) n from pessoas where chave_pix is not null and length(regexp_replace(chave_pix,'\\D','','g')) = 0 and chave_pix not like '%@%'`)
check('chave Pix de pessoa tem formato reconhecível', Number(r36.n) === 0, `${r36.n} estranha(s)`)

// ── vendas / estoque ──────────────────────────────────────────────────────
const r37 = await um(`select count(*) n from vendas v left join pessoas p on p.id = v.pessoa_id where v.pessoa_id is not null and p.id is null`)
check('nenhuma venda aponta cliente inexistente', Number(r37.n) === 0, `${r37.n} órfã(s)`)

const r38 = await um(`select count(*) n from vendas where data < '2000-01-01'`)
check('nenhuma venda com data absurda', Number(r38.n) === 0, `${r38.n} fora`)

const r39 = await um(`select count(*) n from vendas where total < 0`)
check('nenhuma venda com total negativo', Number(r39.n) === 0, `${r39.n} negativa(s)`)

const r40 = await um(`select count(*) n from itens_venda i left join vendas v on v.id = i.venda_id where v.id is null`)
check('nenhum item de venda sem venda', Number(r40.n) === 0, `${r40.n} órfão(s)`)

const r41 = await um(`select count(*) n from pagamentos_venda pv left join vendas v on v.id = pv.venda_id where v.id is null`)
check('nenhum pagamento de venda sem venda', Number(r41.n) === 0, `${r41.n} órfão(s)`)

const r42 = await um(`select count(*) n from pagamentos_venda where status = 'pago' and forma_pagamento_id is null`)
check('pagamento aprovado tem forma', Number(r42.n) === 0, `${r42.n} sem forma`)

// ── comprovantes de PIX ───────────────────────────────────────────────────
const r43 = await um(`select count(*) n from comprovantes_pix where status <> 'furo' and valor is not null and valor <= 0`)
check('comprovante válido tem valor positivo', Number(r43.n) === 0, `${r43.n} fora`)

const r44 = await um(`select count(*) n from comprovantes_pix where recebido_em < '2026-01-01'`)
check('nenhum comprovante com data absurda', Number(r44.n) === 0, `${r44.n} fora`)

const r45 = await um(`select count(*) n from comprovantes_pix where destinatario ilike '%IG FRANCA%' and recebido_em >= '2026-10-03'`)
check('nenhum PIX novo na chave da IG FRANCA (encerrada)', Number(r45.n) === 0, `${r45.n} novo(s)`, true)

// ── caixa e transferências ────────────────────────────────────────────────
const r46 = await um(`select count(*) n from movimentos_caixa m left join caixas c on c.id = m.caixa_id where c.id is null`)
check('nenhum movimento de caixa sem caixa', Number(r46.n) === 0, `${r46.n} órfão(s)`)

const r47 = await um(`select count(*) n from transferencias t where t.conta_origem_id not in (select id from contas) or t.conta_destino_id not in (select id from contas)`)
check('nenhuma transferência com conta inexistente', Number(r47.n) === 0, `${r47.n} órfã(s)`)

const r48 = await um(`select count(*) n from transferencias where valor <= 0`)
check('nenhuma transferência de valor zero/negativo', Number(r48.n) === 0, `${r48.n} inválida(s)`)

const r49 = await um(`select count(*) n from caixas where fechado_em is not null and valor_fechamento is null`)
check('caixa fechado tem valor contado', Number(r49.n) === 0, `${r49.n} sem contagem`)

const r50 = await um(`select count(*) n from caixas where status = 'aberto' and date(aberto_em) < current_date - 2`)
check('[aviso] nenhum caixa aberto há mais de 2 dias', Number(r50.n) === 0, `${r50.n} aberto(s)`)

// ── relatório ─────────────────────────────────────────────────────────────
const noMes = checks.filter((c) => !c.hist)
const hist = checks.filter((c) => c.hist)
const falhas = noMes.filter((c) => !c.ok)
const falhasHist = hist.filter((c) => !c.ok)
console.log('\n=== 50 VERIFICAÇÕES DE ERRO ===')
checks.forEach((c, i) => console.log(`${String(i + 1).padStart(2)}) ${c.ok ? 'OK  ' : 'FALHA'} ${c.nome}${c.detalhe && !c.ok ? ' -> ' + c.detalhe : ''}`))
console.log(`\nOK: ${checks.length - falhas.length} | FALHA: ${falhas.length}`)
console.log(`\nMÊS 11 -> OK: ${noMes.length - falhas.length} | FALHA: ${falhas.length}`)
if (falhas.length) { console.log('FALHAS no mês 11:'); for (const f of falhas) console.log(' - ' + f.nome + (f.detalhe ? ' -> ' + f.detalhe : '')) }
console.log(`\nHISTÓRICO (fora do mês 11) -> ${hist.length - falhasHist.length} ok | ${falhasHist.length} para conferir depois`)
for (const f of falhasHist) console.log(' - ' + f.nome + (f.detalhe ? ' -> ' + f.detalhe : ''))
