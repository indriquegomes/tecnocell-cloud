'use client'

import { useState, useActionState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { criarUsuario, atualizarPerfil, alterarSenha, MODULOS, type ActionResult } from './actions'

const supabaseBrowser = createClient()
async function authToken() {
  const { data } = await supabaseBrowser.auth.getSession()
  return data.session?.access_token ?? ''
}
function withToken(action: (fd: FormData) => void) {
  return async (fd: FormData) => {
    fd.set('access_token', await authToken())
    action(fd)
  }
}

const CARGO_LABEL: Record<string, string> = { dono: 'Dono', gerente: 'Gerente', vendedor: 'Vendedor' }
const CARGO_COR: Record<string, string> = {
  dono: 'bg-purple-100 text-purple-700',
  gerente: 'bg-blue-100 text-blue-700',
  vendedor: 'bg-gray-100 text-gray-600',
}
const MODULO_LABEL: Record<string, string> = {
  pdv: 'PDV', estoque: 'Estoque', pessoas: 'Pessoas', financeiro: 'Financeiro',
  relatorios: 'Relatórios', promocoes: 'Promoções', vales: 'Vales', pedidos: 'Pedidos',
  configuracoes: 'Configurações',
}

interface Usuario {
  id: string
  email: string
  nome: string
  cargo: 'dono' | 'gerente' | 'vendedor'
  permissoes: string[]
  ativo: boolean
  created_at: string
}

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null
  return (
    <p className={`text-sm font-medium ${state.ok ? 'text-green-600' : 'text-red-600'}`}>
      {state.ok ? '✓' : '✗'} {state.message}
    </p>
  )
}

function PermissoesCheckbox({ cargo, permissoes }: { cargo: string; permissoes: string[] }) {
  if (cargo === 'dono') {
    return <p className="text-xs text-gray-400 italic">Dono tem acesso total automático</p>
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {MODULOS.map((m) => (
        <label key={m} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            name="permissoes"
            value={m}
            defaultChecked={permissoes.includes(m)}
            className="rounded"
          />
          {MODULO_LABEL[m] ?? m}
        </label>
      ))}
    </div>
  )
}

function NovoUsuarioForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(criarUsuario, null)
  const [cargo, setCargo] = useState<string>('vendedor')

  return (
    <div className="rounded-2xl border border-blue-200 bg-white p-6 shadow-sm space-y-5">
      <h3 className="font-semibold text-gray-800 text-lg">Novo Usuário</h3>
      <form action={withToken(action)} className="space-y-4">
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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Senha *</label>
            <input name="senha" type="text" className="field" placeholder="Mínimo 4 caracteres" required />
            <p className="text-xs text-gray-400 mt-1">Pode ser simples: nome + número</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Cargo *</label>
            <select name="cargo" className="field" value={cargo} onChange={(e) => setCargo(e.target.value)}>
              <option value="vendedor">Vendedor</option>
              <option value="gerente">Gerente</option>
              <option value="dono">Dono</option>
            </select>
          </div>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Módulos com acesso</label>
          <PermissoesCheckbox cargo={cargo} permissoes={[]} />
        </div>
        <div className="flex items-center justify-between pt-2">
          <Feedback state={state} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50"
          >
            {pending ? 'Criando...' : 'Criar Usuário'}
          </button>
        </div>
      </form>
    </div>
  )
}

function EditarUsuarioModal({ usuario, onClose }: { usuario: Usuario; onClose: () => void }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(atualizarPerfil, null)
  const [senhaState, senhaAction, senhaPending] = useActionState<ActionResult | null, FormData>(alterarSenha, null)
  const [cargo, setCargo] = useState(usuario.cargo)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Editar — {usuario.nome}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Dados do perfil */}
          <form action={withToken(action)} className="space-y-4">
            <input type="hidden" name="user_id" value={usuario.id} />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nome</label>
                <input name="nome" className="field" defaultValue={usuario.nome} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Cargo</label>
                <select name="cargo" className="field" value={cargo} onChange={(e) => setCargo(e.target.value as typeof cargo)}>
                  <option value="vendedor">Vendedor</option>
                  <option value="gerente">Gerente</option>
                  <option value="dono">Dono</option>
                </select>
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <input type="hidden" name="ativo" value="0" />
                <input
                  type="checkbox"
                  name="ativo"
                  value="1"
                  defaultChecked={usuario.ativo}
                  className="rounded"
                />
                Usuário ativo
              </label>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Módulos com acesso</label>
              <PermissoesCheckbox cargo={cargo} permissoes={usuario.permissoes} />
            </div>
            <div className="flex items-center justify-between">
              <Feedback state={state} />
              <button
                type="submit"
                disabled={pending}
                className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50"
              >
                {pending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>

          {/* Alterar senha */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Alterar Senha</p>
            <form action={withToken(senhaAction)} className="flex gap-3">
              <input type="hidden" name="user_id" value={usuario.id} />
              <input name="senha" type="text" className="field flex-1" placeholder="Nova senha" />
              <button
                type="submit"
                disabled={senhaPending}
                className="rounded-xl bg-gray-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 transition disabled:opacity-50 shrink-0"
              >
                {senhaPending ? '...' : 'Alterar'}
              </button>
            </form>
            <Feedback state={senhaState} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function UsuariosClient({ usuarios }: { usuarios: Usuario[] }) {
  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<Usuario | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Usuários</h2>
          <p className="text-sm text-gray-500 mt-0.5">Gerencie os acessos da equipe</p>
        </div>
        <button
          onClick={() => setCriando((v) => !v)}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition"
        >
          + Novo Usuário
        </button>
      </div>

      {criando && <NovoUsuarioForm />}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Nome</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">E-mail</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cargo</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Acesso</th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-400">
                  Nenhum usuário cadastrado ainda.
                </td>
              </tr>
            )}
            {usuarios.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50 transition">
                <td className="px-6 py-3 text-sm font-medium text-gray-900">{u.nome}</td>
                <td className="px-6 py-3 text-sm text-gray-500">{u.email}</td>
                <td className="px-6 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${CARGO_COR[u.cargo] ?? ''}`}>
                    {CARGO_LABEL[u.cargo] ?? u.cargo}
                  </span>
                </td>
                <td className="px-6 py-3 text-xs text-gray-500">
                  {u.cargo === 'dono'
                    ? 'Tudo'
                    : u.permissoes.map((p) => MODULO_LABEL[p] ?? p).join(', ') || '—'}
                </td>
                <td className="px-6 py-3 text-center">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${u.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                    {u.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-6 py-3 text-right">
                  <button
                    onClick={() => setEditando(u)}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editando && (
        <EditarUsuarioModal usuario={editando} onClose={() => setEditando(null)} />
      )}
    </div>
  )
}
