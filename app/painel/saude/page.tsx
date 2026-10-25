import { createServiceClient } from '@/lib/supabase/server'
import { auditarFinanceiro, resumo, type Achado } from '@/lib/saude-financeiro'
import { REGRAS_DINHEIRO } from '@/lib/financeiro-regras'
import { formatBRL, hojeSP } from '@/lib/utils'
import { IconShield } from '@/components/icons'
import { Dica } from '@/components/Dica'

// Tela de conferência: aperta e vê o que está quebrado. Nada aqui grava.
export const dynamic = 'force-dynamic'

function corDe(a: Achado) {
  if (a.gravidade === 'erro') return { borda: 'border-red-200', fundo: 'bg-red-50', texto: 'text-red-700', ponto: 'bg-red-500' }
  if (a.gravidade === 'atencao') return { borda: 'border-amber-200', fundo: 'bg-amber-50', texto: 'text-amber-700', ponto: 'bg-amber-500' }
  return { borda: 'border-green-200', fundo: 'bg-green-50', texto: 'text-green-700', ponto: 'bg-green-500' }
}

function Cartao({ achado }: { achado: Achado }) {
  const c = corDe(achado)
  return (
    <div className={'rounded-xl border p-4 shadow-sm ' + c.borda + ' ' + c.fundo}>
      <div className="flex items-start gap-3">
        <span className={'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ' + c.ponto} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={'text-sm font-semibold ' + c.texto}>{achado.titulo}</p>
            <p className="text-sm font-bold text-gray-900">
              {achado.qtd === 0 ? 'tudo certo' : achado.qtd + (achado.qtd === 1 ? ' caso' : ' casos')}
              {achado.qtd > 0 && achado.valor > 0 && <span className="ml-2 font-medium text-gray-600">{formatBRL(achado.valor)}</span>}
            </p>
          </div>
          <p className="mt-1 text-xs text-gray-600"><strong className="font-semibold">Regra:</strong> {achado.regra}</p>
          {achado.qtd > 0 && (
            <p className="mt-1 text-xs text-gray-600"><strong className="font-semibold">O que fazer:</strong> {achado.oQueFazer}</p>
          )}
          {achado.exemplos.length > 0 && (
            <p className="mt-1 truncate text-xs text-gray-500">ex.: {achado.exemplos.join(' · ')}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default async function SaudePage() {
  const supabase = await createServiceClient()
  const achados = await auditarFinanceiro(supabase)
  const r = resumo(achados)
  const graves = achados.filter((a) => a.gravidade === 'erro')
  const atencao = achados.filter((a) => a.gravidade === 'atencao')
  const certos = achados.filter((a) => a.gravidade === 'ok')

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconShield className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Saúde do sistema</h2>
        <Dica texto="Confere sozinho se o dinheiro está batendo. Só lê: não corrige, não apaga e não altera nada." />
      </div>

      <p className="text-sm text-gray-600">
        Conferência de {hojeSP()} — dinheiro, caixa e estoque. Lançamento em aberto é conferido inteiro; venda, caixa e devolução, dos últimos 31 dias. Esta tela só lê o sistema: nenhum valor é corrigido, apagado ou alterado aqui.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-red-700">Erros</p>
          <p className="mt-1 text-2xl font-bold text-red-800">{r.erros}</p>
          <p className="mt-1 text-xs text-red-600">contradição que faz a tela mostrar número errado</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-amber-700">Pontos de atenção</p>
          <p className="mt-1 text-2xl font-bold text-amber-800">{r.atencoes}</p>
          <p className="mt-1 text-xs text-amber-600">dado torto ou dinheiro não registrado</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-green-700">Conferidos</p>
          <p className="mt-1 text-2xl font-bold text-green-800">{r.ok} de {r.total}</p>
          <p className="mt-1 text-xs text-green-600">regra que está batendo</p>
        </div>
      </div>

      {graves.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Erros</h3>
          {graves.map((a) => <Cartao key={a.chave} achado={a} />)}
        </section>
      )}

      {atencao.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Pontos de atenção</h3>
          {atencao.map((a) => <Cartao key={a.chave} achado={a} />)}
        </section>
      )}

      {certos.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Conferidos</h3>
          {certos.map((a) => <Cartao key={a.chave} achado={a} />)}
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-800">As regras que esta tela confere</h3>
        <ul className="mt-2 space-y-1.5 text-xs text-gray-600">
          {REGRAS_DINHEIRO.map((regra) => (
            <li key={regra.titulo}>
              <strong className="font-semibold text-gray-800">{regra.titulo}.</strong> {regra.texto}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
