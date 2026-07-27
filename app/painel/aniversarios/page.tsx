import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { hojeSP } from '@/lib/utils'
import Link from 'next/link'

// Aba de Aniversários (ideia da Isa): abrir e ver quem faz aniversário hoje +
// a lista do mês. Usa pessoas.data_nascimento (date). Compara só MM-DD (ignora o
// ano) — o ano serve pra idade. Mês vem da URL (?mes=N), padrão o mês atual.

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const MES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const waLink = (tel: string, msg: string) => {
  let d = tel.replace(/\D/g, '')
  if (d.length <= 11) d = '55' + d
  return `https://wa.me/${d}?text=${encodeURIComponent(msg)}`
}
const parabens = (nome: string) =>
  `Feliz aniversário, ${nome}! 🎉🎂 A equipe da TecnoCell deseja um dia especial e tudo de bom pra você!`

type Pessoa = { id: string; nome: string; telefone: string | null; data_nascimento: string }

export default async function AniversariosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const { mes } = await searchParams
  const supabase = await createServiceClient()

  const pessoas = await fetchAll<Pessoa>(
    (from, to) => supabase
      .from('pessoas')
      .select('id, nome, telefone, data_nascimento')
      .not('data_nascimento', 'is', null)
      .order('nome')
      .range(from, to),
  )

  const hoje = hojeSP()                 // YYYY-MM-DD (America/Sao_Paulo)
  const hojeMMDD = hoje.slice(5, 10)
  const hojeDia = hoje.slice(8, 10)
  const anoAtual = Number(hoje.slice(0, 4))
  const mesAtual = Number(hoje.slice(5, 7))
  const mesSel = Math.min(12, Math.max(1, Number(mes) || mesAtual))
  const mesSelStr = String(mesSel).padStart(2, '0')

  const idadeQueFaz = (dn: string) => {
    const ano = Number(dn.slice(0, 4))
    if (ano < 1920 || ano > anoAtual) return null   // data suspeita → sem idade
    return anoAtual - ano
  }

  // aniversariantes de HOJE
  const doDia = pessoas.filter((p) => p.data_nascimento.slice(5, 10) === hojeMMDD)

  // do mês selecionado, agrupados por dia
  const doMes = pessoas.filter((p) => p.data_nascimento.slice(5, 7) === mesSelStr)
  const porDia = new Map<string, Pessoa[]>()
  for (const p of doMes) {
    const dia = p.data_nascimento.slice(8, 10)
    ;(porDia.get(dia) ?? porDia.set(dia, []).get(dia)!).push(p)
  }
  const dias = [...porDia.keys()].sort()

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎂</span>
          <h2 className="text-2xl font-bold text-gray-900">Aniversários</h2>
        </div>
        <p className="mt-0.5 text-sm text-gray-400">
          {pessoas.length} clientes com data cadastrada — quem faz aniversário hoje e no mês
        </p>
      </div>

      {/* HOJE — destaque */}
      <div className="overflow-hidden rounded-2xl bg-[#1B6CA8] p-6 text-white shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
          Hoje · {hojeDia}/{String(mesAtual).padStart(2, '0')}
        </p>
        {doDia.length === 0 ? (
          <p className="mt-2 text-lg font-medium text-white/90">Ninguém faz aniversário hoje 🎉</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {doDia.map((p) => {
              const idade = idadeQueFaz(p.data_nascimento)
              return (
                <div key={p.id} className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 backdrop-blur">
                  <span className="font-semibold">{p.nome}</span>
                  {idade !== null && <span className="text-xs text-white/70">faz {idade}</span>}
                  {p.telefone && (
                    // eslint-disable-next-line react/jsx-no-target-blank
                    <a href={waLink(p.telefone, parabens(p.nome))} target="_blank" rel="noopener"
                      className="rounded-lg bg-emerald-500 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-600 transition">
                      🎉 Parabéns
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Seletor de mês */}
      <div className="flex flex-wrap gap-1.5">
        {MES_CURTO.map((m, i) => {
          const n = i + 1
          const ativo = n === mesSel
          return (
            <Link key={m} href={`/painel/aniversarios?mes=${n}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${ativo ? 'bg-[#1B6CA8] text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}>
              {m}
            </Link>
          )
        })}
      </div>

      {/* Lista do mês */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-800">
            {MESES[mesSel - 1]} · {doMes.length} {doMes.length === 1 ? 'aniversariante' : 'aniversariantes'}
          </h3>
        </div>
        {dias.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">Nenhum aniversário em {MESES[mesSel - 1]}.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {dias.map((dia) => {
              const ehHoje = mesSel === mesAtual && dia === hojeDia
              return (
                <div key={dia} className="flex gap-4 px-5 py-3">
                  <div className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl text-sm font-bold ${ehHoje ? 'bg-[#1B6CA8] text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {Number(dia)}
                  </div>
                  <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1">
                    {porDia.get(dia)!.map((p) => {
                      const idade = idadeQueFaz(p.data_nascimento)
                      return (
                        <span key={p.id} className="inline-flex items-center gap-1.5 text-sm">
                          <span className="font-medium text-gray-800">{p.nome}</span>
                          {idade !== null && <span className="text-xs text-gray-400">({idade})</span>}
                          {p.telefone && (
                            // eslint-disable-next-line react/jsx-no-target-blank
                            <a href={waLink(p.telefone, parabens(p.nome))} target="_blank" rel="noopener"
                              className="text-xs font-semibold text-emerald-600 hover:underline">WhatsApp</a>
                          )}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
