'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { validarConvite, definirSenhaConvite } from '../actions'

export function ConviteClient({ token }: { token: string }) {
  const [estado, setEstado] = useState<'carregando' | 'valido' | 'invalido' | 'pronto'>('carregando')
  const [nome, setNome] = useState<string | undefined>()
  const [motivo, setMotivo] = useState<string>('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    ;(async () => {
      const r = await validarConvite(token)
      if (r.valido) { setNome(r.nome); setEstado('valido') }
      else { setMotivo(r.motivo ?? 'Convite inválido.'); setEstado('invalido') }
    })()
  }, [token])

  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setErro('')
    if (senha !== senha2) { setErro('As senhas não coincidem.'); return }
    setSalvando(true)
    const r = await definirSenhaConvite(token, senha)
    setSalvando(false)
    if (r.ok) setEstado('pronto')
    else setErro(r.message)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">TecnoCell</h1>

        {estado === 'carregando' && <p className="mt-4 text-sm text-gray-400">Carregando convite...</p>}

        {estado === 'invalido' && (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{motivo}</div>
            <Link href="/login" className="text-sm text-blue-600 hover:underline">Ir para o login</Link>
          </div>
        )}

        {estado === 'valido' && (
          <form onSubmit={salvar} className="mt-4 space-y-4">
            <p className="text-sm text-gray-600">
              {nome ? <>Bem-vinda, <span className="font-semibold">{nome}</span>! </> : 'Bem-vinda! '}
              Defina a sua senha para acessar o sistema.
            </p>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Sua senha</label>
              <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
                className="field" required autoComplete="new-password" placeholder="Mínimo 4 caracteres" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Repita a senha</label>
              <input type="password" value={senha2} onChange={(e) => setSenha2(e.target.value)}
                className="field" required autoComplete="new-password" />
            </div>
            {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
            <button type="submit" disabled={salvando}
              className="w-full rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
              {salvando ? 'Salvando...' : 'Definir senha e ativar conta'}
            </button>
          </form>
        )}

        {estado === 'pronto' && (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              ✓ Senha definida! Sua conta está ativa.
            </div>
            <Link href="/login" className="inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
              Entrar no sistema
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
