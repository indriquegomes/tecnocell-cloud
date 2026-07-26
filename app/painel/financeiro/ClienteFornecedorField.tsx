'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buscarPessoasFinanceiro, criarPessoaRapida } from './actions'

const sb = createClient()
async function token(): Promise<string> {
  const { data } = await sb.auth.getSession()
  return data.session?.access_token ?? ''
}

// Campo Cliente/Fornecedor do lançamento: busca quem JÁ existe no cadastro e,
// se não achar, deixa CRIAR NOVO ali mesmo. Submete em name="pessoa_nome".
export function ClienteFornecedorField({ defaultValue = '' }: { defaultValue?: string }) {
  const [valor, setValor] = useState(defaultValue)
  const [aberto, setAberto] = useState(false)
  const [res, setRes] = useState<{ id: string; nome: string }[]>([])
  const [buscando, setBuscando] = useState(false)
  const [criando, setCriando] = useState(false)
  const deb = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  function onChange(v: string) {
    setValor(v); setAberto(true)
    clearTimeout(deb.current)
    if (v.trim().length < 1) { setRes([]); return }
    setBuscando(true)
    deb.current = setTimeout(async () => {
      try { setRes(await buscarPessoasFinanceiro(await token(), v)) } catch { setRes([]) } finally { setBuscando(false) }
    }, 250)
  }
  function escolher(nome: string) { setValor(nome); setAberto(false); setRes([]) }
  async function criar() {
    const nome = valor.trim()
    if (nome.length < 2 || criando) return
    setCriando(true)
    try { const r = await criarPessoaRapida(await token(), nome); if (r.ok) escolher(r.nome); else alert(r.erro) } finally { setCriando(false) }
  }
  const temExato = res.some((r) => r.nome.trim().toLowerCase() === valor.trim().toLowerCase())

  return (
    <div className="relative" ref={box}>
      <input name="pessoa_nome" value={valor} autoComplete="off"
        onChange={(e) => onChange(e.target.value)} onFocus={() => valor.trim() && setAberto(true)}
        className="field" placeholder="Buscar cliente/fornecedor…" />
      {aberto && valor.trim().length >= 1 && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {buscando && <div className="px-3 py-2 text-sm text-gray-400">Buscando…</div>}
          {!buscando && res.map((r) => (
            <button key={r.id} type="button" onClick={() => escolher(r.nome)}
              className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 transition">{r.nome}</button>
          ))}
          {!buscando && !temExato && valor.trim().length >= 2 && (
            <button type="button" onClick={criar} disabled={criando}
              className="block w-full border-t border-gray-100 px-3 py-2 text-left text-sm font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition">
              {criando ? 'Criando…' : `➕ Criar "${valor.trim()}"`}
            </button>
          )}
          {!buscando && res.length === 0 && !temExato && valor.trim().length < 2 && (
            <div className="px-3 py-2 text-sm text-gray-400">Digite pra buscar…</div>
          )}
        </div>
      )}
    </div>
  )
}
