'use client'

import { useState, useTransition } from 'react'
import { inspecionarPlanilha, type Previa } from './actions'

export function ImportarProdutos() {
  const [erro, setErro] = useState('')
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [pending, startTransition] = useTransition()

  function enviar(file: File, aba?: string) {
    setErro(''); setPrevia(null)
    const fd = new FormData()
    fd.set('arquivo', file)
    if (aba) fd.set('aba', aba)
    startTransition(async () => {
      const res = await inspecionarPlanilha(fd)
      if (res.ok) setPrevia(res.previa)
      else setErro(res.erro)
    })
  }

  function onEnviar(formData: FormData) {
    const file = formData.get('arquivo') as File | null
    if (!file) return
    setArquivo(file)
    enviar(file)
  }

  return (
    <div className="space-y-4">
      <form action={onEnviar} className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="arquivo"
          accept=".xlsx"
          required
          className="block text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
        />
        <button type="submit" disabled={pending}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50">
          {pending ? 'Lendo...' : 'Enviar e ver o que tem dentro'}
        </button>
      </form>

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">{erro}</p>
        </div>
      )}

      {previa && (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-800">
              Li a planilha. <b>Nada foi gravado.</b>
            </p>
            <p className="mt-1 text-sm text-emerald-700">
              Aba <b>{previa.aba}</b> — {previa.totalLinhas.toLocaleString('pt-BR')} linha(s) de dado,{' '}
              {previa.colunas.length} coluna(s).
            </p>
          </div>

          {previa.abasDisponiveis.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-gray-500">Abas do arquivo:</span>
              {previa.abasDisponiveis.map((a) => (
                <button key={a} type="button" disabled={pending || a === previa.aba}
                  onClick={() => arquivo && enviar(arquivo, a)}
                  className={`rounded-lg border px-3 py-1 font-medium transition ${
                    a === previa.aba
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {a}
                </button>
              ))}
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-semibold text-gray-700">Colunas encontradas</p>
            <div className="flex flex-wrap gap-2">
              {previa.colunas.map((c, i) => (
                <span key={i} className="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">{c}</span>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-gray-700">
              Primeiras {previa.linhas.length} linha(s)
            </p>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    {previa.colunas.map((c, i) => (
                      <th key={i} className="whitespace-nowrap px-3 py-2 text-left font-semibold">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {previa.linhas.map((linha, r) => (
                    <tr key={r}>
                      {linha.map((v, i) => (
                        <td key={i} className="whitespace-nowrap px-3 py-1.5 text-gray-800">{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800">
              <b>Passo 2 ainda nao existe.</b> Mande esta tela pro Claude com as colunas acima
              para ligar os campos (codigo, nome, categoria, preco) e liberar o botao de aplicar.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
