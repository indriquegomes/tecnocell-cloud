'use client'

import { IconUser } from '@/components/icons'
import { useState, useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Spinner } from '@/components/Spinner'
import { createClient } from '@/lib/supabase/client'
import { TODAS_PERMISSOES } from '@/lib/permissoes'
import { criarUsuario, criarConvite, atualizarPerfil, alterarSenha, type ActionResult, type ConviteResult } from './actions'

const supabaseBrowser = createClient()
async function authToken() {
  const { data } = await supabaseBrowser.auth.getSession()
  return data.session?.access_token ?? ''
}

export interface Usuario {
  id: string
  email: string
  nome: string
  permissoes: string[]
  isMaster: boolean
  ativo: boolean
  cargoId: string | null
  lojasPermitidas: string[]
  tabelasPermitidas: string[]
  pdvLojaId: string | null
  pdvDepositoId: string | null
  acessoHoraInicio: string | null
  acessoHoraFim: string | null
  acessoBloqSabado: boolean
  acessoBloqDomingo: boolean
  acessoBloqFeriado: boolean
  metaVendaMensal: number
  created_at: string
}
export type Cargo = { id: string; nome: string }
export type Loja = { id: string; nome: string }
export type Deposito = { id: string; nome: string; loja_id: string | null }
export type Tabela = { id: string; nome: string }

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null
  return (
    <p className={`text-sm font-medium ${state.ok ? 'text-green-600' : 'text-red-600'}`}>
      {state.ok ? '✓' : '✗'} {state.message}
    </p>
  )
}

function PermissoesGrid({
  permissoes,
  isMaster: defaultMaster,
}: {
  permissoes: string[]
  isMaster: boolean
}) {
  const [master, setMaster] = useState(defaultMaster)
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set(permissoes))

  const toggle = (key: string) =>
    setSelecionadas((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center justify-between rounded-xl border border-purple-200 bg-purple-50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-purple-800">Acesso total (Master)</p>
          <p className="text-xs text-purple-500">Ignora todas as restrições</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="hidden" name="is_master" value="0" />
          <input
            type="checkbox"
            name="is_master"
            value="1"
            checked={master}
            onChange={(e) => setMaster(e.target.checked)}
            className="h-4 w-4 rounded accent-purple-600"
          />
          <span className={`text-xs font-bold ${master ? 'text-purple-600' : 'text-gray-400'}`}>
            {master ? 'ON' : 'OFF'}
          </span>
        </div>
      </label>

      {!master && (
        <div className="grid grid-cols-2 gap-2">
          {TODAS_PERMISSOES.map((p) => {
            const ativo = selecionadas.has(p.key)
            return (
              <label
                key={p.key}
                className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 transition-colors ${
                  ativo ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                }`}
              >
                <div className="min-w-0 pr-2">
                  <p className={`truncate text-xs font-semibold ${ativo ? 'text-blue-700' : 'text-gray-600'}`}>
                    {p.label}
                  </p>
                  <p className="truncate text-[10px] text-gray-400">{p.desc}</p>
                </div>
                <input
                  type="checkbox"
                  name="permissoes"
                  value={p.key}
                  checked={ativo}
                  onChange={() => toggle(p.key)}
                  className="h-4 w-4 shrink-0 rounded accent-blue-600"
                />
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Escolhe um cargo (permissões vêm dele) OU marca permissões individuais (sem cargo)
function CargoOuPermissoes({ cargos, cargoId: defaultCargo, permissoes, isMaster }: {
  cargos: Cargo[]; cargoId: string | null; permissoes: string[]; isMaster: boolean
}) {
  const [cargoId, setCargoId] = useState(defaultCargo ?? '')
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Cargo</label>
        <select name="cargo_id" value={cargoId} onChange={(e) => setCargoId(e.target.value)} className="field w-full">
          <option value="">Personalizado (sem cargo)</option>
          {cargos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <p className="mt-1 text-[11px] text-gray-400">
          {cargoId ? 'As permissões vêm do cargo. Mudou o cargo, muda pra todo mundo que tem ele.' : 'Sem cargo: marque as permissões abaixo pra esta pessoa.'}
        </p>
      </div>
      {!cargoId && <PermissoesGrid permissoes={permissoes} isMaster={isMaster} />}
    </div>
  )
}

// Lojas que a pessoa pode operar + o que já vem selecionado no PDV.
// lojas_permitidas vazio = todas. Só aparece se houver >1 loja (senão não faz sentido).
function LojasPdvConfig({ lojas, depositos, tabelas, usuario }: { lojas: Loja[]; depositos: Deposito[]; tabelas: Tabela[]; usuario: Usuario }) {
  const [permitidas, setPermitidas] = useState<Set<string>>(new Set(usuario.lojasPermitidas))
  const [tabsSel, setTabsSel] = useState<Set<string>>(new Set(usuario.tabelasPermitidas))
  const [lojaPadrao, setLojaPadrao] = useState(usuario.pdvLojaId ?? '')

  const togglePermitida = (id: string) => setPermitidas((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const toggleTabela = (id: string) => setTabsSel((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  // Lojas onde ela pode escolher o padrão = as permitidas (ou todas, se vazio).
  const lojasDisponiveis = permitidas.size ? lojas.filter((l) => permitidas.has(l.id)) : lojas
  const depositosDaLoja = lojaPadrao ? depositos.filter((d) => d.loja_id === lojaPadrao) : []

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-sm font-semibold text-gray-700">Lojas & PDV</p>

      {lojas.length > 1 && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">Lojas que pode operar</label>
          <div className="grid grid-cols-2 gap-2">
            {lojas.map((l) => {
              const on = permitidas.has(l.id)
              return (
                <label key={l.id} className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-xs transition ${on ? 'border-blue-200 bg-blue-50 text-blue-700 font-semibold' : 'border-gray-200 bg-white text-gray-600'}`}>
                  {l.nome}
                  <input type="checkbox" name="lojas_permitidas" value={l.id} checked={on} onChange={() => togglePermitida(l.id)} className="h-4 w-4 rounded accent-blue-600" />
                </label>
              )
            })}
          </div>
          <p className="mt-1 text-[11px] text-gray-400">Nenhuma marcada = pode operar todas.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Loja padrão no PDV</label>
          <select name="pdv_loja_id" value={lojaPadrao} onChange={(e) => setLojaPadrao(e.target.value)} className="field w-full text-sm">
            <option value="">Automático</option>
            {lojasDisponiveis.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Depósito padrão</label>
          <select name="pdv_deposito_id" defaultValue={usuario.pdvDepositoId ?? ''} className="field w-full text-sm" disabled={!lojaPadrao}>
            <option value="">{lojaPadrao ? 'Padrão da loja' : 'Escolha a loja'}</option>
            {depositosDaLoja.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
        </div>
      </div>

      <div className="w-48">
        <label className="mb-1 block text-xs font-medium text-gray-600">Meta de venda mensal (R$)</label>
        <input name="meta_venda_mensal" type="number" step="0.01" min="0" defaultValue={usuario.metaVendaMensal || ''} className="field w-full text-sm" placeholder="0 = sem meta" />
      </div>

      {tabelas.length > 0 && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">Tabelas de preço visíveis no PDV</label>
          <div className="grid grid-cols-2 gap-2">
            {tabelas.map((t) => {
              const on = tabsSel.has(t.id)
              return (
                <label key={t.id} className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-xs transition ${on ? 'border-blue-200 bg-blue-50 text-blue-700 font-semibold' : 'border-gray-200 bg-white text-gray-600'}`}>
                  {t.nome}
                  <input type="checkbox" name="tabelas_permitidas" value={t.id} checked={on} onChange={() => toggleTabela(t.id)} className="h-4 w-4 rounded accent-blue-600" />
                </label>
              )
            })}
          </div>
          <p className="mt-1 text-[11px] text-gray-400">Nenhuma marcada = vê todas. Preço Padrão sempre aparece.</p>
        </div>
      )}
    </div>
  )
}

// Restrição de horário/dias de acesso (Master ignora). Só bloqueia a menina.
function RestricaoAcesso({ usuario }: { usuario: Usuario }) {
  const [limitar, setLimitar] = useState(!!(usuario.acessoHoraInicio && usuario.acessoHoraFim))
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-sm font-semibold text-gray-700">Restrição de acesso</p>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={limitar} onChange={(e) => setLimitar(e.target.checked)} className="h-4 w-4 rounded accent-blue-600" />
        Limitar horário de acesso
      </label>
      {limitar && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Das</label>
            <input name="acesso_hora_inicio" type="time" defaultValue={usuario.acessoHoraInicio ?? '08:00'} className="field w-full text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Até</label>
            <input name="acesso_hora_fim" type="time" defaultValue={usuario.acessoHoraFim ?? '19:00'} className="field w-full text-sm" />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-4 pt-1">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" name="acesso_bloqueia_sabado" value="1" defaultChecked={usuario.acessoBloqSabado} className="h-4 w-4 rounded accent-blue-600" />
          Bloquear sábado
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" name="acesso_bloqueia_domingo" value="1" defaultChecked={usuario.acessoBloqDomingo} className="h-4 w-4 rounded accent-blue-600" />
          Bloquear domingo
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" name="acesso_bloqueia_feriado" value="1" defaultChecked={usuario.acessoBloqFeriado} className="h-4 w-4 rounded accent-blue-600" />
          Bloquear feriado
        </label>
      </div>
    </div>
  )
}

function NovoUsuarioModal({ cargos, onClose }: { cargos: Cargo[]; onClose: () => void }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(criarUsuario, null)
  const [tk, setTk] = useState('')
  useEffect(() => { authToken().then(setTk) }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-xl flex-col rounded-2xl bg-white shadow-xl overflow-hidden" style={{ maxHeight: '90vh' }}>
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-base font-semibold text-gray-800">Novo Usuário</h3>
          <button onClick={onClose} className="text-xl leading-none text-gray-400 hover:text-gray-600">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <form id="form-novo-user" action={action} className="space-y-5">
            <input type="hidden" name="access_token" value={tk} />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nome *</label>
                <input name="nome" className="field" placeholder="Ex: Mariana" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">E-mail *</label>
                <input name="email" type="email" className="field" placeholder="mariana@tecnocell.com" required />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Senha *</label>
              <input name="senha" type="text" className="field" placeholder="Mínimo 4 caracteres" required />
              <p className="mt-1 text-xs text-gray-400">Pode ser simples: nome + número</p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Cargo / Permissões</label>
              <CargoOuPermissoes cargos={cargos} cargoId={null} permissoes={[]} isMaster={false} />
            </div>
          </form>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-6 py-3">
          <Feedback state={state} />
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition">Cancelar</button>
            <button type="button" disabled={pending}
              onClick={() => (document.getElementById('form-novo-user') as HTMLFormElement | null)?.requestSubmit()}
              className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50">
              {pending ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Criando...</span> : 'Criar Usuário'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ConvidarModal({ cargos, onClose }: { cargos: Cargo[]; onClose: () => void }) {
  const [state, action, pending] = useActionState<ConviteResult | null, FormData>(criarConvite, null)
  const [copiado, setCopiado] = useState(false)
  const [tk, setTk] = useState('')
  useEffect(() => { authToken().then(setTk) }, [])
  const link = state && state.ok ? `${window.location.origin}${state.link}` : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-xl flex-col rounded-2xl bg-white shadow-xl overflow-hidden" style={{ maxHeight: '90vh' }}>
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-base font-semibold text-gray-800">Convidar usuária</h3>
          <button onClick={onClose} className="text-xl leading-none text-gray-400 hover:text-gray-600">×</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
        {state?.ok ? (
          <div className="space-y-4 px-6 py-5">
            <p className="text-sm text-green-700">✓ {state.message}</p>
            <p className="text-sm text-gray-600">Envie este link para ela (WhatsApp). Ela define a própria senha e ativa a conta:</p>
            <div className="flex gap-2">
              <input readOnly value={link} className="field flex-1 text-xs" onFocus={(e) => e.target.select()} />
              <button type="button"
                onClick={() => { navigator.clipboard?.writeText(link); setCopiado(true) }}
                className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
                {copiado ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
            <div className="flex justify-end border-t border-gray-100 pt-4">
              <button onClick={onClose} className="rounded-xl border border-gray-200 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <form action={action} className="space-y-5 px-6 py-5">
            <input type="hidden" name="access_token" value={tk} />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nome *</label>
                <input name="nome" className="field" placeholder="Ex: Mariana" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">E-mail *</label>
                <input name="email" type="email" className="field" placeholder="mariana@tecnocell.com" required />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Cargo / Permissões</label>
              <CargoOuPermissoes cargos={cargos} cargoId={null} permissoes={[]} isMaster={false} />
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 pt-4">
              {state && !state.ok ? <Feedback state={state} /> : <span />}
              <button type="submit" disabled={pending}
                className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50">
                {pending ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Gerando...</span> : 'Gerar convite'}
              </button>
            </div>
          </form>
        )}
        </div>
      </div>
    </div>
  )
}

function EditarModal({ usuario, cargos, lojas, depositos, tabelas, onClose }: { usuario: Usuario; cargos: Cargo[]; lojas: Loja[]; depositos: Deposito[]; tabelas: Tabela[]; onClose: () => void }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(atualizarPerfil, null)
  const [senhaState, senhaAction, senhaPending] = useActionState<ActionResult | null, FormData>(alterarSenha, null)
  const router = useRouter()
  const [tk, setTk] = useState('')
  useEffect(() => { authToken().then(setTk) }, [])
  // ao salvar, atualiza a lista (senão reabrir o modal mostra o cargo/dados velhos)
  useEffect(() => { if (state?.ok) router.refresh() }, [state?.ok, router])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-xl flex-col rounded-2xl bg-white shadow-xl overflow-hidden" style={{ maxHeight: '90vh' }}>
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-800">{usuario.nome}</h3>
            <p className="text-xs text-gray-400">{usuario.email}</p>
          </div>
          <button onClick={onClose} className="text-xl leading-none text-gray-400 hover:text-gray-600">×</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <form id="form-edit-user" action={action} className="space-y-4">
            <input type="hidden" name="access_token" value={tk} />
            <input type="hidden" name="user_id" value={usuario.id} />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nome</label>
                <input name="nome" className="field" defaultValue={usuario.nome} required />
              </div>
              <div className="flex items-end pb-0.5">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
                  <input type="hidden" name="ativo" value="0" />
                  <input
                    type="checkbox"
                    name="ativo"
                    value="1"
                    defaultChecked={usuario.ativo}
                    className="h-4 w-4 rounded"
                  />
                  Conta ativa
                </label>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Cargo / Permissões</label>
              <CargoOuPermissoes cargos={cargos} cargoId={usuario.cargoId} permissoes={usuario.permissoes} isMaster={usuario.isMaster} />
            </div>
            <LojasPdvConfig lojas={lojas} depositos={depositos} tabelas={tabelas} usuario={usuario} />
            <RestricaoAcesso usuario={usuario} />
          </form>

          <div className="border-t border-gray-100 pt-4">
            <p className="mb-2 text-sm font-medium text-gray-700">Alterar Senha</p>
            <form action={senhaAction} className="flex gap-3">
              <input type="hidden" name="access_token" value={tk} />
              <input type="hidden" name="user_id" value={usuario.id} />
              <input name="senha" type="text" className="field flex-1" placeholder="Nova senha" />
              <button
                type="submit"
                disabled={senhaPending}
                className="shrink-0 rounded-xl bg-gray-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 transition disabled:opacity-50"
              >
                {senhaPending ? '...' : 'Alterar'}
              </button>
            </form>
            <Feedback state={senhaState} />
          </div>
        </div>

        {/* Rodapé fixo — Salvar/Cancelar sempre visíveis (sem rolar) */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-6 py-3">
          <Feedback state={state} />
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition">Cancelar</button>
            <button type="button" disabled={pending}
              onClick={() => (document.getElementById('form-edit-user') as HTMLFormElement | null)?.requestSubmit()}
              className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50">
              {pending ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Salvando...</span> : 'Salvar alterações'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function UsuariosClient({ usuarios, cargos, lojas, depositos, tabelas }: { usuarios: Usuario[]; cargos: Cargo[]; lojas: Loja[]; depositos: Deposito[]; tabelas: Tabela[] }) {
  const [criando, setCriando] = useState(false)
  const [convidando, setConvidando] = useState(false)
  const [editando, setEditando] = useState<Usuario | null>(null)
  const cargoNome = new Map(cargos.map((c) => [c.id, c.nome]))

  const resumoPermissoes = (u: Usuario) => {
    if (u.cargoId) return `Cargo: ${cargoNome.get(u.cargoId) ?? '—'}`
    if (u.isMaster) return 'Acesso total'
    if (!u.permissoes.length) return 'Sem permissões'
    const labels = u.permissoes
      .slice(0, 3)
      .map((k) => TODAS_PERMISSOES.find((p) => p.key === k)?.label ?? k)
    return labels.join(', ') + (u.permissoes.length > 3 ? ` +${u.permissoes.length - 3}` : '')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <IconUser className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
            <h2 className="text-2xl font-bold text-gray-900">Usuários</h2>
          </div>
          <p className="mt-0.5 text-sm text-gray-500">Gerencie os acessos da equipe</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setConvidando(true)}
            className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition"
          >
            ✉ Convidar
          </button>
          <button
            onClick={() => setCriando(true)}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition"
          >
            + Novo Usuário
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Nome</th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">E-mail</th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-gray-500">Permissões</th>
              <th className="px-6 py-3 text-center text-xs font-semibold uppercase text-gray-500">Status</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-400">
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            )}
            {usuarios.map((u) => (
              <tr key={u.id} className="hover:bg-blue-50/60 transition">
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                      {u.nome[0]?.toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-gray-900">{u.nome}</span>
                  </div>
                </td>
                <td className="px-6 py-3 text-sm text-gray-500">{u.email}</td>
                <td className="px-6 py-3">
                  {u.isMaster ? (
                    <span className="inline-flex rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700">
                      Master
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">{resumoPermissoes(u)}</span>
                  )}
                </td>
                <td className="px-6 py-3 text-center">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${u.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                    {u.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-6 py-3 text-right">
                  <button onClick={() => setEditando(u)} className="text-sm text-blue-600 hover:underline">
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {criando && <NovoUsuarioModal cargos={cargos} onClose={() => setCriando(false)} />}
      {convidando && <ConvidarModal cargos={cargos} onClose={() => setConvidando(false)} />}
      {editando && <EditarModal usuario={editando} cargos={cargos} lojas={lojas} depositos={depositos} tabelas={tabelas} onClose={() => setEditando(null)} />}
    </div>
  )
}
