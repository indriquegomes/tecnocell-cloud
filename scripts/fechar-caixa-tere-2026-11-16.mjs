#!/usr/bin/env node
// FECHA O CAIXA DE TERESÓPOLIS DA SESSÃO DE 16/11/2026.
//
// Faz o mesmo que o botão "Fechar Caixa" do PDV (app/painel/pdv/operacao/actions.ts):
//   1. remove a retirada fantasma de R$ 550,00 (PIX, "QUITEI ERRADO - VIC") que travava
//      o fechamento — não mexe em número da gaveta, PIX não é cédula;
//   2. lê o "PIX do dia" e grava o rastro em caixas.pix_resolucao — SEM abater dívida
//      (nesta sessão o único PIX "de fornecedor" caiu em CNPJ da própria rede);
//   3. fecha o caixa com o valor contado = esperado pela RPC calcular_valor_esperado;
//   4. registra no logs_atividade.
//
// Backup de tudo que é toca vai pra docs/registros-banco/ antes de qualquer escrita.
//
// Uso: node --import ./test/alias.mjs scripts/fechar-caixa-tere-2026-11-16.mjs
// Ensaio (não escreve nada): DRY=1 node --import ./test/alias.mjs scripts/fechar-caixa-tere-2026-11-16.mjs

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const RAIZ = path.resolve(import.meta.dirname, '..')
const CAIXA_ID = 'c6bfc8d8-9b84-44c6-8bf6-ae7c46ec9b6e'
const RETIRADA_FANTASMA = '3c31d3c2-0427-4bbe-8a1a-30b6400275e4' // retirada 550,00 PIX "QUITEI ERRADO - VIC"
const ESPERADO_CONFERIDO = 2016.30

function carregaEnv() {
  const txt = fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8')
  const get = (k) => {
    const m = txt.match(new RegExp('^' + k + '=(.*)$', 'm'))
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
  }
  return { url: get('NEXT_PUBLIC_SUPABASE_URL'), key: get('SUPABASE_SERVICE_ROLE_KEY') }
}

const brl = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',')
const DRY = process.env.DRY === '1'
const { url, key } = carregaEnv()
const sb = createClient(url, key, { auth: { persistSession: false } })
if (DRY) console.log('*** ENSAIO — nenhuma escrita no banco ***')

// ── 0. backup do estado atual ────────────────────────────────────────────────
const { data: caixaAntes, error: eCaixa } = await sb.from('caixas').select('*').eq('id', CAIXA_ID).single()
if (eCaixa) throw new Error('caixa: ' + eCaixa.message)
const { data: movsAntes } = await sb.from('movimentos_caixa').select('*').eq('caixa_id', CAIXA_ID)
const pasta = path.join(RAIZ, 'docs', 'registros-banco')
fs.mkdirSync(pasta, { recursive: true })
const arquivoBackup = path.join(pasta, `backup-caixa-tere-${new Date().toISOString().slice(0, 10)}.json`)
fs.writeFileSync(arquivoBackup, JSON.stringify({ caixa: caixaAntes, movimentos: movsAntes }, null, 2), 'utf8')
console.log('backup:', path.relative(RAIZ, arquivoBackup), `(${(movsAntes ?? []).length} movimentos)`)

// ── 1. trava: o caixa tem que estar aberto e no valor que conferimos ─────────
if (caixaAntes.status !== 'aberto') {
  console.log('NADA A FAZER: o caixa já está', caixaAntes.status, '— fechado em', caixaAntes.fechado_em)
  process.exit(0)
}
const { data: espRpc, error: eEsp } = await sb.rpc('calcular_valor_esperado', { p_caixa_id: CAIXA_ID })
if (eEsp) throw new Error('calcular_valor_esperado: ' + eEsp.message)
const esperado = Number(espRpc) || 0
console.log('esperado pela RPC:', brl(esperado))
if (Math.abs(esperado - ESPERADO_CONFERIDO) > 0.005) {
  throw new Error(`esperado ${brl(esperado)} ≠ conferido ${brl(ESPERADO_CONFERIDO)} — parei pra não fechar número errado.`)
}

// ── 2. apaga a retirada fantasma (só se ainda for ela) ───────────────────────
const { data: fantasma } = await sb.from('movimentos_caixa')
  .select('id, tipo, valor, forma_pagamento, motivo, lancamento_id')
  .eq('id', RETIRADA_FANTASMA).eq('caixa_id', CAIXA_ID).maybeSingle()
if (fantasma) {
  if (fantasma.tipo !== 'retirada' || Number(fantasma.valor) !== 550 || fantasma.lancamento_id) {
    throw new Error('a linha não é a retirada fantasma esperada: ' + JSON.stringify(fantasma))
  }
  const { error } = DRY
    ? { error: null }
    : await sb.from('movimentos_caixa').delete().eq('id', RETIRADA_FANTASMA)
  if (error) throw new Error('delete retirada: ' + error.message)
  console.log((DRY ? 'removeria' : 'removida') + ' a retirada fantasma:', fantasma.motivo)
} else {
  console.log('retirada fantasma já não existe (ok)')
}

// ── 3. PIX do dia — LIDO E REGISTRADO, SEM ABATER NADA ─────────────────────
//
// O botão do PDV abateria a dívida do fornecedor aqui. Nesta sessão o único PIX
// "de fornecedor" é R$ 66,76 com destinatário 38.216.415 JOAO VITOR MAXIMIANO FRANCA
// (CNPJ 38216415000170) — que é o cadastro da própria TECNOCELL PETROPOLIS: dinheiro
// que caixa da loja, não pagamento a fornecedor. Abater criaria crédito fantasma na
// dívida dela. Então o fechamento registra a leitura e não abate.
const { resolverPixDoDia } = await import('@/lib/pix-do-dia')

const lojaId = caixaAntes.loja_id ?? null
const abertoEm = caixaAntes.aberto_em ?? null
const registro = {
  janela: { de: abertoEm, ate: new Date().toISOString() },
  fornecedores: [],
  contaPropria: [],
  naoIdentificado: { total: 0, comprovantes: 0 },
  naoAbatido: 0,
  observacao: 'Baixa automática não aplicada: o único PIX classificado como fornecedor caiu em CNPJ da própria rede (TECNOCELL PETROPOLIS). Conferir antes de abater.',
}
if (lojaId && abertoEm) {
  const destinos = await resolverPixDoDia(sb, lojaId, abertoEm)
  for (const d of destinos) {
    if (d.propria) {
      registro.contaPropria.push({ nome: d.nome, total: d.total, comprovantes: d.comprovantes })
      continue
    }
    if (!d.fornecedorId) {
      registro.naoIdentificado.total = Math.round((registro.naoIdentificado.total + d.total) * 100) / 100
      registro.naoIdentificado.comprovantes += d.comprovantes
      continue
    }
    registro.fornecedores.push({
      nome: d.fornecedorNome ?? d.nome, fornecedorId: d.fornecedorId,
      resolvido: d.total, abatido: 0, credito: 0, comprovantes: d.comprovantes,
    })
    registro.naoAbatido = Math.round((registro.naoAbatido + d.total) * 100) / 100
    console.log(`  PIX do dia NÃO abatido: ${brl(d.total)} — "${d.nome}" casou com o cadastro ${d.fornecedorNome ?? d.nome}`)
  }
  console.log('  conta própria (caiu no banco):', registro.contaPropria.length ? JSON.stringify(registro.contaPropria) : 'nenhum')
}

// ── 4. fecha ────────────────────────────────────────────────────────────────
const { error: eFechar } = DRY ? { error: null } : await sb.from('caixas').update({
  status: 'fechado',
  valor_fechamento: esperado,
  obs_fechamento: 'Fechado pelo responsável: a retirada de R$ 550,00 em PIX ("QUITEI ERRADO - VIC") era correção de digitação sem saída de dinheiro e foi removida. Contagem conferida com o esperado.',
  fechado_em: new Date().toISOString(),
  pix_resolucao: registro,
}).eq('id', CAIXA_ID).eq('status', 'aberto')
if (eFechar) throw new Error('fechar caixa: ' + eFechar.message)

// ── 5. log ──────────────────────────────────────────────────────────────────
if (!DRY) await sb.from('logs_atividade').insert({
  usuario_id: null,
  usuario_email: null,
  tipo_acao: 'caixa.fechar',
  contexto: {
    caixa_id: CAIXA_ID,
    valor_esperado: esperado,
    valor_contado: esperado,
    divergencia: 0,
    ciente_dos_avisos: true,
    removido: { id: RETIRADA_FANTASMA, tipo: 'retirada', valor: 550, forma: 'PIX', motivo: 'QUITEI ERRADO - VIC' },
    obs: 'fechamento feito a pedido do dono, fora da tela do PDV',
    pixel_do_dia: { fornecedores: registro.fornecedores.length, naoAbatido: registro.naoAbatido },
  },
  url: '/painel/pdv/operacao',
  origem: 'server',
})

// ── 6. confere o resultado ──────────────────────────────────────────────────
const { data: depois } = await sb.from('caixas')
  .select('status, valor_abertura, valor_fechamento, fechado_em').eq('id', CAIXA_ID).single()
console.log('\nCAIXA FECHADO:', JSON.stringify(depois, null, 2))
if (registro.fornecedores.length) console.log('PIX do dia — fornecedores abatidos:', JSON.stringify(registro.fornecedores, null, 2))
if (registro.naoAbatido > 0) console.log('ATENÇÃO: PIX não abatido:', brl(registro.naoAbatido))
