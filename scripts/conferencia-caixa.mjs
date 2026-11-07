#!/usr/bin/env node
// CONFERÊNCIA DE CAIXA — dinheiro em espécie por loja e por período. SÓ LÊ.
//
// A conta é a mesma do RPC calcular_valor_esperado (a oficial do Fechamento de Caixa):
//   troco inicial (valor_abertura dos caixas do período)
//   + vendas pagas em DINHEIRO (pagamentos_venda, status 'pago', forma tipo 'dinheiro')
//   + fiado recebido e sinal em dinheiro (movimentos_caixa 'recebimento')
//   + reforços em dinheiro
//   - retiradas em dinheiro
//   - devoluções em dinheiro
//   = DEVERIA TER  →  comparar com a soma das contagens (valor_fechamento)
//
// Uso:
//   node scripts/conferencia-caixa.mjs 2026-11-03 2026-11-06
//   node scripts/conferencia-caixa.mjs 2026-11-03 2026-11-06 petropolis
//   node scripts/conferencia-caixa.mjs 2026-11-01 2026-11-30 todas
//
// Não escreve nada no banco: só select.

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const RAIZ = path.resolve(import.meta.dirname, '..')

function carregaEnv() {
  const arq = path.join(RAIZ, '.env.local')
  if (!fs.existsSync(arq)) {
    console.error('Sem .env.local neste PC — rode no PC da loja.')
    process.exit(1)
  }
  const txt = fs.readFileSync(arq, 'utf8')
  const get = (k) => {
    const m = txt.match(new RegExp('^' + k + '=(.*)$', 'm'))
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
  }
  return { url: get('NEXT_PUBLIC_SUPABASE_URL'), key: get('SUPABASE_SERVICE_ROLE_KEY') }
}

const brl = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dia = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const hora = (iso) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const ehDinheiro = (s) => String(s || '').toLowerCase().includes('dinheiro')

async function principal() {
  const [de, ate, alvo] = process.argv.slice(2)
  if (!de || !ate) {
    console.error('Uso: node scripts/conferencia-caixa.mjs AAAA-MM-DD AAAA-MM-DD [petropolis|teresopolis|todas]')
    process.exit(1)
  }
  const env = carregaEnv()
  const sb = createClient(env.url, env.key, { auth: { persistSession: false } })

  const { data: lojas, error: eLoja } = await sb.from('lojas').select('id, nome').order('nome')
  if (eLoja) { console.error('ERRO ao ler lojas: ' + eLoja.message); process.exit(1) }

  const pedido = (alvo || 'todas').toLowerCase()
  const escolhidas = (lojas ?? []).filter((l) =>
    pedido === 'todas' ? true : (l.nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(pedido),
  )
  if (!escolhidas.length) { console.error('Loja não encontrada: ' + alvo); process.exit(1) }

  const { data: formas } = await sb.from('formas_pagamento').select('id, tipo')
  const formaDinheiro = new Set((formas ?? []).filter((f) => (f.tipo || '').toLowerCase() === 'dinheiro').map((f) => f.id))

  const DE = de + 'T00:00:00-03:00'
  const ATE = ate + 'T23:59:59-03:00'
  let totalContado = 0, totalEsperado = 0, totalVenda = 0

  for (const loja of escolhidas) {
    const { data: caixas } = await sb.from('caixas')
      .select('id, aberto_em, fechado_em, valor_abertura, valor_fechamento, status')
      .eq('loja_id', loja.id).gte('aberto_em', DE).lte('aberto_em', ATE).order('aberto_em')

    console.log(`\n===== ${loja.nome} — ${de} a ${ate} — ${(caixas ?? []).length} caixa(s) =====`)
    if (!(caixas ?? []).length) { console.log('  nenhum caixa aberto no período'); continue }

    console.log('caixa              | troco   | venda dinheiro | fiado/sinal | reforço | retirada | DEVIA TER  | CONTADO    | diferença')
    let contado = 0, esperado = 0, vendaTotal = 0
    for (const c of caixas) {
      const { data: vendas } = await sb.from('vendas').select('id').eq('caixa_id', c.id).eq('status', 'concluida')
      const vIds = (vendas ?? []).map((v) => v.id)
      let vendaDin = 0
      for (let i = 0; i < vIds.length; i += 300) {
        const { data: pg } = await sb.from('pagamentos_venda').select('valor, status, forma_pagamento_id').in('venda_id', vIds.slice(i, i + 300))
        for (const p of pg ?? []) if (p.status === 'pago' && formaDinheiro.has(p.forma_pagamento_id)) vendaDin += Number(p.valor || 0)
      }
      const { data: movs } = await sb.from('movimentos_caixa').select('tipo, forma_pagamento, valor, motivo').eq('caixa_id', c.id)
      let receb = 0, reforco = 0, retirada = 0, devolucao = 0
      for (const m of movs ?? []) {
        if (!ehDinheiro(m.forma_pagamento)) continue
        if (m.tipo === 'recebimento') receb += Number(m.valor || 0)
        else if (m.tipo === 'reforco') reforco += Number(m.valor || 0)
        else if (m.tipo === 'retirada') retirada += Number(m.valor || 0)
        else if (m.tipo === 'devolucao') devolucao += Number(m.valor || 0)
      }
      const devia = Math.round((Number(c.valor_abertura || 0) + vendaDin + receb + reforco - retirada - devolucao) * 100) / 100
      const temContagem = c.valor_fechamento != null
      const cont = Number(c.valor_fechamento ?? 0)
      const dif = temContagem ? Math.round((cont - devia) * 100) / 100 : null
      console.log(
        `${hora(c.aberto_em)} | ${brl(c.valor_abertura).padStart(7)} | ${brl(vendaDin).padStart(14)} | ${brl(receb).padStart(11)} | ${brl(reforco).padStart(7)} | ${brl(retirada).padStart(8)} | ${brl(devia).padStart(10)} | ${(temContagem ? brl(cont) : 'em aberto').padStart(10)} | ${dif == null ? '—' : dif === 0 ? 'bate' : brl(dif)}`,
      )
      if (temContagem) { contado += cont; esperado += devia }
      vendaTotal += vendaDin
    }
    console.log(`  ${loja.nome}: contado ${brl(contado)} | devia ter ${brl(esperado)} | diferença ${brl(contado - esperado)}`)
    console.log(`  (dinheiro de VENDA no período: ${brl(vendaTotal)} — é parte do "devia ter", não é recebimento de gaveta)`)
    totalContado += contado; totalEsperado += esperado; totalVenda += vendaTotal
  }

  console.log(`\n===== TOTAL ${de} a ${ate} =====`)
  console.log(`  contado:      ${brl(totalContado)}`)
  console.log(`  devia ter:    ${brl(totalEsperado)}`)
  console.log(`  diferença:    ${brl(totalContado - totalEsperado)} ${totalContado - totalEsperado < 0 ? '(falta)' : totalContado - totalEsperado > 0 ? '(sobra)' : '(bate)'}`)
  console.log(`  dinheiro de venda dentro do "devia ter": ${brl(totalVenda)}`)
  console.log('  (a abertura/troco dos caixas é contada aqui; para o total SEM troco, subtraia a soma das aberturas)')
}

principal().catch((e) => { console.error('ERRO: ' + (e?.message || e)); process.exit(1) })
