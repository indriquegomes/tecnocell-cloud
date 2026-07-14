'use client'

import { useActionState, useState, useEffect } from 'react'
import { Spinner } from '@/components/Spinner'
import { createClient } from '@/lib/supabase/client'
import { salvarLembrete, excluirLembrete, type ActionState } from './actions'
import { DIAS_LABEL } from '@/lib/lembretes'

const supabaseBrowser = createClient()
let tokenCache = ''
function withToken(action: (fd: FormData) => void) {
  return (fd: FormData) => { fd.set('access_token', tokenCache); action(fd) }
}

interface Lembrete {
  id: string
  titulo: string
  descricao: string | null
  perfil_id: string | null
  cargo_id: string | null
  hora: string
  dias: number[]
  ativo: boolean
}
interface Pessoa { id: string; nome: string }
interface Feito { lembrete_id: string; perfil_id: string | null; feito_em: string }

const hhmm = (h: string) => (h ?? '').slice(0, 5)
const DIAS_UTEIS = [1, 2, 3, 4, 5, 6]

export function LembretesClient({
  lembretes, perfis, cargos, feitosHoje,
}: {
  lembretes: Lembrete[]
  perfis: Pessoa[]
  cargos: Pessoa[]
  feitosHoje: Feito[]
}) {
  const [editando, setEditando] = useState<Lembrete | null>(null)
  const [novo, setNovo] = useState(false)
  useEffect(() => { supabaseBrowser.auth.getSession().then(({ data }) => { tokenCache = data.session?.access_token ?? '' }) }, [])

  const nomePerfil = Object.fromEntries(perfis.map((p) => [p.id, p.nome]))
  const nomeCargo = Object.fromEntries(cargos.map((c) => [c.id, c.nome]))
  const feitoPor = Object.fromEntries(feitosHoje.map((f) => [f.lembrete_id, f]))

  const paraQuem = (l: Lembrete) =>
    l.perfil_id ? (nomePerfil[l.perfil_id] ?? 'Alguém')
      : l.cargo_id ? `Cargo: ${nomeCargo[l.cargo_id] ?? '?'}`
        : 'Todos'

  const fechar = () => { setEditando(null); setNovo(false) }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Lembretes</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Rotinas que o sistema cobra da equipe. Aparecem no painel no horário e só somem quando a pessoa marca <b>Feito</b>.
          </p>
        </div>
        <button
          onClick={() => { setNovo(true); setEditando(null) }}
          className="shrink-0 rounded-xl bg-[#1B6CA8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#155a8c] transition"
        >
          + Novo lembrete
        </button>
      </div>

      {(novo || editando) && (
        <Formulario
          key={editando?.id ?? 'novo'}
          lembrete={editando}
          perfis={perfis}
          cargos={cargos}
          onFechar={fechar}
        />
      )}

      {lembretes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
          <div className="mb-3 text-4xl">🔔</div>
          <p className="font-semibold text-gray-700">Nenhum lembrete ainda</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-400">
            Ex: “Conferir o caixa” pra Duda às 18:30, de segunda a sábado. No horário, aparece
            um aviso no painel dela — e você vê quando ela marcar como feito.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-400">O que</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-400">Quem</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-400">Hora</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-400">Dias</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-400">Hoje</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-gray-400">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lembretes.map((l) => {
                const f = feitoPor[l.id]
                return (
                  <tr key={l.id} className={`hover:bg-blue-50/40 transition ${l.ativo ? '' : 'opacity-50'}`}>
                    <td className="px-6 py-3">
                      <p className="font-semibold text-gray-800">{l.titulo}</p>
                      {l.descricao && <p className="text-xs text-gray-400">{l.descricao}</p>}
                      {!l.ativo && <span className="mt-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">pausado</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{paraQuem(l)}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-gray-700">{hhmm(l.hora)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-0.5">
                        {DIAS_LABEL.map((d, i) => (
                          <span key={i}
                            className={`rounded px-1 py-0.5 text-[10px] font-semibold ${(l.dias ?? []).includes(i) ? 'bg-blue-100 text-blue-700' : 'bg-gray-50 text-gray-300'}`}>
                            {d[0]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {f ? (
                        <span className="text-xs font-semibold text-emerald-600">
                          ✓ {nomePerfil[f.perfil_id ?? ''] ?? 'feito'}
                          <span className="ml-1 font-normal text-gray-400">
                            {new Date(f.feito_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button onClick={() => { setEditando(l); setNovo(false) }}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition">
                        Editar
                      </button>
                      <BotaoExcluir id={l.id} titulo={l.titulo} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function BotaoExcluir({ id, titulo }: { id: string; titulo: string }) {
  const [, action, pending] = useActionState<ActionState, FormData>(excluirLembrete, null)
  return (
    <form
      action={withToken(action)}
      className="inline"
      onSubmit={(e) => { if (!confirm(`Excluir o lembrete "${titulo}"?`)) e.preventDefault() }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending}
        className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 transition disabled:opacity-50">
        {pending ? '...' : 'Excluir'}
      </button>
    </form>
  )
}

function Formulario({
  lembrete, perfis, cargos, onFechar,
}: {
  lembrete: Lembrete | null
  perfis: Pessoa[]
  cargos: Pessoa[]
  onFechar: () => void
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(salvarLembrete, null)
  const [dias, setDias] = useState<number[]>(lembrete?.dias ?? DIAS_UTEIS)

  useEffect(() => { if (state?.ok) { const t = setTimeout(onFechar, 800); return () => clearTimeout(t) } }, [state, onFechar])

  const alvo = lembrete?.perfil_id ? `perfil:${lembrete.perfil_id}`
    : lembrete?.cargo_id ? `cargo:${lembrete.cargo_id}`
      : 'todos'

  const toggleDia = (i: number) =>
    setDias((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort()))

  return (
    <div className="rounded-2xl border border-blue-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 font-semibold text-gray-800">{lembrete ? 'Editar lembrete' : 'Novo lembrete'}</h3>
      <form action={withToken(action)} className="space-y-4">
        {lembrete && <input type="hidden" name="id" value={lembrete.id} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">O que precisa ser feito <span className="text-red-500">*</span></label>
            <input name="titulo" defaultValue={lembrete?.titulo ?? ''} required
              placeholder="Ex: Conferir o caixa" className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Para quem</label>
            <select name="para" defaultValue={alvo} className="field">
              <option value="todos">Todos da loja</option>
              <optgroup label="Pessoa">
                {perfis.map((p) => <option key={p.id} value={`perfil:${p.id}`}>{p.nome}</option>)}
              </optgroup>
              <optgroup label="Cargo (todo mundo do cargo)">
                {cargos.map((c) => <option key={c.id} value={`cargo:${c.id}`}>{c.nome}</option>)}
              </optgroup>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Detalhe (opcional)</label>
          <input name="descricao" defaultValue={lembrete?.descricao ?? ''}
            placeholder="Ex: bater o PIX com os comprovantes do WhatsApp" className="field" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Horário <span className="text-red-500">*</span></label>
            <input name="hora" type="time" defaultValue={hhmm(lembrete?.hora ?? '') || '18:30'} required className="field" />
            <p className="mt-1 text-xs text-gray-400">O aviso aparece a partir deste horário.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Dias da semana <span className="text-red-500">*</span></label>
            <div className="flex gap-1">
              {DIAS_LABEL.map((d, i) => (
                <button key={i} type="button" onClick={() => toggleDia(i)}
                  className={`h-9 flex-1 rounded-lg border text-xs font-semibold transition ${
                    dias.includes(i) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
                  }`}>
                  {d}
                </button>
              ))}
            </div>
            {dias.map((d) => <input key={d} type="hidden" name="dias" value={d} />)}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="hidden" name="ativo" value="0" />
          <input type="checkbox" name="ativo" value="1" defaultChecked={lembrete?.ativo ?? true} className="rounded border-gray-300" />
          Ativo (desmarque pra pausar sem apagar)
        </label>

        <div className="flex items-center gap-2 pt-1">
          <button type="submit" disabled={pending}
            className="flex items-center gap-2 rounded-xl bg-[#1B6CA8] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#155a8c] transition disabled:opacity-50">
            {pending && <Spinner />}{pending ? 'Salvando...' : 'Salvar'}
          </button>
          <button type="button" onClick={onFechar}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </button>
          {state && (
            <p className={`text-sm font-medium ${state.ok ? 'text-green-600' : 'text-red-600'}`}>
              {state.ok ? '✓' : '✗'} {state.message}
            </p>
          )}
        </div>
      </form>
    </div>
  )
}
