#!/usr/bin/env node
// Cria (ou recria) as promoções de BRINDE da campanha BLACK TECBLACK.
//
//   • brinde_pelicula — comprou tela, ganhou película do MESMO modelo (R$ 0,00).
//     Não tem item cadastrado: a regra casa tela ↔ película pelo nome (lib/brinde.ts).
//   • brinde_total    — passou do valor mínimo, ganhou o brinde UMA vez na campanha.
//     O produto do brinde é o item cadastrado nesta promoção (itens_promocao).
//
// Só mexe em promocoes / itens_promocao. Nenhum produto é alterado.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const RAIZ = path.resolve(import.meta.dirname, '..')
const txt = fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8')
const get = (k) => { const m = txt.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : null }
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const INICIO = '2026-11-27'
const FIM = '2026-11-30'
const MINIMO_ANEL = 500
const CODIGO_ANEL = '12233'

async function limpar(nome) {
  const { data } = await sb.from('promocoes').select('id').eq('nome', nome)
  for (const p of data ?? []) {
    await sb.from('itens_promocao').delete().eq('promocao_id', p.id)
    await sb.from('faixas_promocao').delete().eq('promocao_id', p.id)
    await sb.from('promocoes').delete().eq('id', p.id)
  }
}

// ---------- película de brinde ----------
const NOME_PELICULA = 'BLACK TECBLACK - BRINDE PELICULA'
await limpar(NOME_PELICULA)
const { error: ePel } = await sb.from('promocoes').insert({
  nome: NOME_PELICULA,
  tipo: 'brinde_pelicula',
  valor: 0,
  data_inicio: INICIO,
  data_fim: FIM,
  ativa: true,
  descricao: 'Na compra de qualquer tela, o cliente ganha uma película do mesmo modelo (R$ 0,00). Vale só na campanha.',
})
if (ePel) { console.error('ERRO promo película:', ePel.message); process.exit(1) }
console.log(`OK "${NOME_PELICULA}"`)

// ---------- brinde único (Smart Ring) ----------
const NOME_UNICO = 'BLACK TECBLACK - BRINDE ANEL'
const { data: anel, error: eAnel } = await sb.from('produtos').select('id, codigo, nome, preco, preco_custo').eq('codigo', CODIGO_ANEL).maybeSingle()
if (eAnel || !anel) { console.error('Anel não encontrado:', eAnel?.message ?? CODIGO_ANEL); process.exit(1) }

await limpar(NOME_UNICO)
const { data: promoUnico, error: eUnico } = await sb.from('promocoes').insert({
  nome: NOME_UNICO,
  tipo: 'brinde_total',
  valor: MINIMO_ANEL,
  data_inicio: INICIO,
  data_fim: FIM,
  ativa: true,
  descricao: `Primeiro cliente acima de R$ ${MINIMO_ANEL},00 ganha 1 ${anel.nome} (R$ 0,00) — uma vez só na campanha.`,
}).select('id').single()
if (eUnico) { console.error('ERRO promo brinde único:', eUnico.message); process.exit(1) }

const { error: eItem } = await sb.from('itens_promocao').insert({
  promocao_id: promoUnico.id,
  produto_id: anel.id,
  preco_promocional: 0,
  quantidade_x: null,
  quantidade_y: null,
})
if (eItem) { console.error('ERRO item brinde único:', eItem.message); process.exit(1) }
console.log(`OK "${NOME_UNICO}" — mínimo R$ ${MINIMO_ANEL},00 — brinde ${anel.codigo} ${anel.nome}`)

// ---------- conferência ----------
const { data: conf } = await sb.from('promocoes')
  .select('id, nome, tipo, valor, ativa, data_inicio, data_fim')
  .in('tipo', ['brinde_pelicula', 'brinde_total'])
console.log('\n--- BRINDES ATIVOS ---')
for (const p of conf ?? []) console.log(`${p.ativa} ${p.tipo} ${p.data_inicio}→${p.data_fim} valor=${p.valor} | ${p.nome}`)

const { error: eTabela } = await sb.from('brindes_concedidos').select('promocao_id').limit(1)
console.log(eTabela ? `\nATENÇÃO: tabela brindes_concedidos não existe ainda (${eTabela.message}) — cole a migration 2026-11-27-black-brinde.sql no SQL Editor.` : '\nbrindes_concedidos: ok')
