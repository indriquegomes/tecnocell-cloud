'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const EMAIL_DESTINO = 'tecnocellcorporation@gmail.com'
const BUCKET = 'reports'
const MAX_MB = 5

export function BotaoReport() {
  const [aberto, setAberto] = useState(false)
  const [tipo, setTipo] = useState<'erro' | 'melhoria'>('erro')
  const [descricao, setDescricao] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erroMsg, setErroMsg] = useState<string | null>(null)

  const fechar = () => {
    setAberto(false)
    setDescricao('')
    setTipo('erro')
    setArquivo(null)
    setErroMsg(null)
  }

  const selecionarArquivo = (f: File | null) => {
    setErroMsg(null)
    if (f && f.size > MAX_MB * 1024 * 1024) {
      setErroMsg(`A foto passa de ${MAX_MB}MB. Escolha uma menor.`)
      return
    }
    setArquivo(f)
  }

  const enviar = async () => {
    if (!descricao.trim()) return
    setEnviando(true)
    setErroMsg(null)
    let linkFoto = ''
    try {
      if (arquivo) {
        const sb = createClient()
        const ext = arquivo.name.split('.').pop() ?? 'png'
        const nome = `report-${Date.now()}.${ext}`
        const { error } = await sb.storage.from(BUCKET).upload(nome, arquivo, { upsert: false })
        if (error) throw error
        linkFoto = sb.storage.from(BUCKET).getPublicUrl(nome).data.publicUrl
      }

      const rotulo = tipo === 'erro' ? 'Erro' : 'Melhoria'
      const assunto = `[${rotulo}] Report TecnoCell`
      let corpo = `Tipo: ${rotulo}\n\n${descricao.trim()}`
      if (linkFoto) corpo += `\n\nFoto: ${linkFoto}`
      corpo += `\n\n— Enviado pelo painel TecnoCell`
      window.location.href = `mailto:${EMAIL_DESTINO}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`
      fechar()
    } catch {
      setErroMsg('Não consegui enviar a foto. Você pode enviar sem ela ou tentar de novo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
      >
        📣 Reportar
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="text-lg font-bold text-gray-900">Reportar</h3>
              <p className="mt-0.5 text-xs text-gray-400">Encontrou um erro ou tem uma sugestão? Conta pra gente.</p>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">Tipo</label>
                <div className="flex gap-2">
                  {([['erro', 'Erro'], ['melhoria', 'Melhoria']] as const).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setTipo(val)}
                      className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                        tipo === val ? 'bg-blue-600 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">Descrição</label>
                <textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={4}
                  autoFocus
                  placeholder="Descreva o erro ou a sugestão..."
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">Foto / print (opcional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => selecionarArquivo(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
                />
                {arquivo && <p className="mt-1 text-xs text-gray-400">📎 {arquivo.name}</p>}
              </div>

              {erroMsg && <p className="text-xs font-medium text-red-600">{erroMsg}</p>}
            </div>

            <div className="flex gap-3 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={fechar}
                disabled={enviando}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={enviar}
                disabled={!descricao.trim() || enviando}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition disabled:opacity-50"
              >
                {enviando ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
