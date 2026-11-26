// FECHA UM CASO DE ESTORNO: conta a pagar ↔ devolução ↔ comprovante. SÓ LÊ + vincula.
//
//   node --env-file=.env.local scripts/fechar-caso.mjs --conta <prefixo> --venda <numero> \
//        --valor <valor> --cliente "<NOME NO CADASTRO>" [--favorecido "<dono da conta>"] \
//        [--descricao "<texto>"] [--data <AAAA-MM-DD>] [--aplicar|--desfazer]
//
// O que faz, e só isso:
//   1. liga `lancamentos.devolucao_id` à devolução daquela venda com aquele valor;
//   2. liga o lançamento ao cadastro (`pessoa_id`) quando o cliente é informado;
//   3. troca o tipo da devolução para `pix` com o reembolso no valor certo;
//   4. se `--favorecido` for passado, registra em `pessoa_chaves_pix` o nome do dono
//      da conta que recebeu (padrão "cliente no app ≠ dono da conta do PIX").
//
// Não mexe em valor, forma, conta, status nem estoque.
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const arg = (nome) => { const i = args.indexOf('--' + nome); return i >= 0 ? args[i + 1] : null }
const aplicar = args.includes('--aplicar')
const desfazer = args.includes('--desfazer')
const contaPrefixo = arg('conta')
const vendaNumero = Number(arg('venda'))
const valor = Number(arg('valor'))
const clienteNome = arg('cliente')
const favorecido = arg('favorecido')
const descricaoNova = arg('descricao')
const dataNova = arg('data')
if (!contaPrefixo || !vendaNumero || !valor || !clienteNome) {
  console.error('uso: --conta <prefixo> --venda <numero> --valor <valor> --cliente "<nome>" [--favorecido "<nome>"] [--descricao "<texto>"] [--data AAAA-MM-DD] [--aplicar|--desfazer]')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou env'); process.exit(1) }
const h = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=representation' }
const get = async (p) => { const r = await fetch(`${url}/rest/v1/${p}`, { headers: h }); const j = await r.json(); return Array.isArray(j) ? j : [] }
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')

// `limit` alto + filtro de descrição: valores redondos (15, 20, 37) têm dezenas de
// linhas no mês e sem isso a conta procurada ficava fora da página.
const todas = await get(`lancamentos?select=id,valor,descricao,pessoa_nome,pessoa_id,forma_pagamento,conta_id,data_pagamento,devolucao_id,status&tipo=eq.pagar&valor=eq.${valor}&descricao=ilike.*devolu*&order=id&limit=1000`)
const conta = todas.find((c) => c.id.startsWith(contaPrefixo))
const pessoa = (await get(`pessoas?select=id,nome&nome=ilike.*${encodeURIComponent(clienteNome)}*&limit=3`))[0]
const venda = (await get(`vendas?select=id,numero,total&numero=eq.${vendaNumero}`))[0]
const devs = await get(`devolucoes?select=id,valor_total,tipo_credito,reembolsos,pessoa_nome&venda_id=eq.${venda?.id}`)
const dev = devs.find((d) => Math.abs(Number(d.valor_total) - valor) < 0.011)
if (!conta) { console.error(`não achei conta ${contaPrefixo} de ${brl(valor)}`); process.exit(1) }
if (!pessoa) { console.error(`não achei cadastro "${clienteNome}"`); process.exit(1) }
if (!venda) { console.error(`não achei venda #${vendaNumero}`); process.exit(1) }
if (!dev) { console.error(`a venda #${vendaNumero} não tem devolução de ${brl(valor)} (tem: ${devs.map((d) => brl(d.valor_total)).join(', ') || 'nenhuma'})`); process.exit(1) }

console.log(`\nANTES`)
console.log(`  conta     : ${brl(conta.valor)} · ${conta.status} · ${conta.forma_pagamento} · conta=${conta.conta_id ? 'PagBank' : '—'} · pag=${String(conta.data_pagamento).slice(0, 10)}`)
console.log(`              '${conta.descricao}'`)
console.log(`              pessoa=${conta.pessoa_nome ?? '—'} · devolução=${conta.devolucao_id ?? '—'}`)
console.log(`  devolução : ${dev.id.slice(0, 8)} · ${brl(dev.valor_total)} · ${dev.tipo_credito} · reembolsos=${JSON.stringify(dev.reembolsos)} · ${dev.pessoa_nome}`)
console.log(`  cliente   : ${pessoa.nome}`)
if (favorecido) console.log(`  dono da conta que recebeu: ${favorecido}`)

if (!aplicar && !desfazer) { console.log(`\n(ensaio: nada gravado. --aplicar fecha · --desfazer volta)`); process.exit(0) }

const dir = path.join('docs', 'registros-banco', '2026-11')
fs.mkdirSync(dir, { recursive: true })
const arquivo = path.join(dir, `fechar-${contaPrefixo}-${Date.now()}.json`)
fs.writeFileSync(arquivo, JSON.stringify({
  conta_id: conta.id, venda: vendaNumero, valor,
  antes: {
    conta: { descricao: conta.descricao, pessoa_nome: conta.pessoa_nome, pessoa_id: conta.pessoa_id, data_pagamento: conta.data_pagamento, devolucao_id: conta.devolucao_id },
    devolucao: { tipo_credito: dev.tipo_credito, reembolsos: dev.reembolsos },
  },
  favorecido,
}, null, 2), 'utf8')
console.log(`\nbackup: ${arquivo}`)

const corpoConta = desfazer
  ? { descricao: conta.descricao, pessoa_nome: conta.pessoa_nome, pessoa_id: conta.pessoa_id, data_pagamento: conta.data_pagamento, devolucao_id: conta.devolucao_id }
  : {
      ...(descricaoNova ? { descricao: descricaoNova } : {}),
      pessoa_nome: pessoa.nome,
      pessoa_id: pessoa.id,
      devolucao_id: dev.id,
      ...(dataNova ? { data_pagamento: `${dataNova}T12:00:00-03:00` } : {}),
      updated_at: new Date().toISOString(),
    }
const corpoDev = desfazer
  ? { tipo_credito: dev.tipo_credito, reembolsos: dev.reembolsos }
  : { tipo_credito: 'pix', reembolsos: [{ tipo: 'pix', valor }] }

const r1 = await fetch(`${url}/rest/v1/lancamentos?id=eq.${conta.id}`, { method: 'PATCH', headers: h, body: JSON.stringify(corpoConta) })
const r2 = await fetch(`${url}/rest/v1/devolucoes?id=eq.${dev.id}`, { method: 'PATCH', headers: h, body: JSON.stringify(corpoDev) })

let chaveOk = '—'
if (favorecido) {
  const jaTem = await get(`pessoa_chaves_pix?select=id&pessoa_id=eq.${pessoa.id}&favorecido=ilike.*${encodeURIComponent(favorecido.slice(0, 12))}*`)
  if (desfazer) {
    for (const j of jaTem) await fetch(`${url}/rest/v1/pessoa_chaves_pix?id=eq.${j.id}`, { method: 'DELETE', headers: h })
    chaveOk = 'removida'
  } else if (jaTem.length) chaveOk = 'já existia'
  else {
    const r = await fetch(`${url}/rest/v1/pessoa_chaves_pix`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ id: crypto.randomUUID(), pessoa_id: pessoa.id, tipo: 'Nome no comprovante', favorecido, ativo: true }),
    })
    chaveOk = r.ok ? 'registrada' : 'falhou'
  }
}

const dc = (await get(`lancamentos?select=descricao,pessoa_nome,data_pagamento,devolucao_id&id=eq.${conta.id}`))[0]
const dd = (await get(`devolucoes?select=tipo_credito,reembolsos&id=eq.${dev.id}`))[0]
console.log(`\nDEPOIS (${desfazer ? 'desfeito' : 'fechado'}) — conta ok=${r1.ok} · devolução ok=${r2.ok} · nome no comprovante: ${chaveOk}`)
console.log(`  conta     : '${dc.descricao}' · ${dc.pessoa_nome} · pag=${String(dc.data_pagamento).slice(0, 10)} · dev=${dc.devolucao_id ?? '—'}`)
console.log(`  devolução : ${dd.tipo_credito} · ${JSON.stringify(dd.reembolsos)}`)
