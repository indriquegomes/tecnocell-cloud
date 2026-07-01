'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buscarMeuPerfil, atualizarMeuNome, alterarMinhaSenha, type Res } from './actions'

export function MeuPerfilClient() {
  const supabase = createClient()
  const [carregando, setCarregando] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [cargo, setCargo] = useState<string | null>(null)
  const [nome, setNome] = useState('')

  const [senhaAtual, setSenhaAtual] = useState('')
  const [senhaNova, setSenhaNova] = useState('')
  const [senhaNova2, setSenhaNova2] = useState('')

  const [msgNome, setMsgNome] = useState<Res | null>(null)
  const [msgSenha, setMsgSenha] = useState<Res | null>(null)
  const [salvandoNome, setSalvandoNome] = useState(false)
  const [salvandoSenha, setSalvandoSenha] = useState(false)

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? ''

  useEffect(() => {
    ;(async () => {
      try {
        const p = await buscarMeuPerfil(await token())
        setNome(p.nome); setEmail(p.email); setCargo(p.cargo)
      } catch { /* sessão — o proxy redireciona */ }
      finally { setCarregando(false) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function salvarNome(e: React.FormEvent) {
    e.preventDefault(); setSalvandoNome(true); setMsgNome(null)
    setMsgNome(await atualizarMeuNome(await token(), nome))
    setSalvandoNome(false)
  }

  async function salvarSenha(e: React.FormEvent) {
    e.preventDefault(); setMsgSenha(null)
    if (senhaNova !== senhaNova2) { setMsgSenha({ ok: false, message: 'As senhas novas não coincidem' }); return }
    setSalvandoSenha(true)
    const r = await alterarMinhaSenha(await token(), senhaAtual, senhaNova)
    setMsgSenha(r)
    if (r.ok) { setSenhaAtual(''); setSenhaNova(''); setSenhaNova2('') }
    setSalvandoSenha(false)
  }

  if (carregando) return <p className="text-sm text-gray-400">Carregando...</p>

  const msgCls = (r: Res) => r.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Meu Perfil</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          {email}{cargo ? ` · ${cargo}` : ''}
        </p>
      </div>

      {/* Nome */}
      <form onSubmit={salvarNome} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Dados</h3>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} className="field" required />
        </div>
        {msgNome && <div className={`rounded-lg border px-3 py-2 text-sm ${msgCls(msgNome)}`}>{msgNome.message}</div>}
        <button type="submit" disabled={salvandoNome}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
          {salvandoNome ? 'Salvando...' : 'Salvar'}
        </button>
      </form>

      {/* Senha */}
      <form onSubmit={salvarSenha} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Trocar senha</h3>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Senha atual</label>
          <input type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} className="field" required autoComplete="current-password" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nova senha</label>
            <input type="password" value={senhaNova} onChange={(e) => setSenhaNova(e.target.value)} className="field" required autoComplete="new-password" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Repetir nova senha</label>
            <input type="password" value={senhaNova2} onChange={(e) => setSenhaNova2(e.target.value)} className="field" required autoComplete="new-password" />
          </div>
        </div>
        {msgSenha && <div className={`rounded-lg border px-3 py-2 text-sm ${msgCls(msgSenha)}`}>{msgSenha.message}</div>}
        <button type="submit" disabled={salvandoSenha}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
          {salvandoSenha ? 'Alterando...' : 'Alterar senha'}
        </button>
      </form>
    </div>
  )
}
