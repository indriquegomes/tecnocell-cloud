'use client'

import { useState, useTransition } from 'react'
import { conferirPlanilha, aplicarConferencia, type LinhaConf } from './actions'

export function ImportarConferencia({ depositoId }: { depositoId: string }) {
  const [erros, setErros] = useState<string[]>([])
  const [mudancas, setMudancas] = useState<LinhaConf[] | null>(null)
  const [depositoNome, setDepositoNome] = useState('')
  const [sucesso, setSucesso] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  function onEnviar(formData: FormData) {
    setErros([]); setMudancas(null); setSucesso(null)
    formData.set('deposito_id', depositoId)
    startTransition(async () => {
      const res = await conferirPlanilha(formData)
      if (res.ok) {
        setMudancas(res.mudancas)
        setDepositoNome(res.depositoNome)
      } else {
        setErros(res.erros)
      }
    })
  }

  function onConfirmar() {
    if (!mudancas) return
    startTransition(async () => {
      const res = await aplicarConferencia({ deposito_id: depositoId, mudancas })
      if (res.ok) {
        setSucesso(res.aplicadas)
        setMudancas(null)
      } else {
        setErros([res.erro ?? 'Erro ao aplicar.'])
        setMudancas(null)
      }
    })
  }

  if (!depositoId) {
    return <p className="text-sm text-gray-400">Escolha um deposito acima para poder enviar a planilha.</p>
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
          {pending ? 'Conferindo...' : 'Enviar e conferir'}
        </button>
      </form>

      {erros.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="mb-2 text-sm font-semibold text-red-700">
            {erros.length === 1 ? 'Encontrei um problema — nada foi alterado:' : `Encontrei ${erros.length} problemas — nada foi alterado. Corrija a planilha e reenvie:`}
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {erros.map((e, i) => (
              <li key={i} className="text-sm text-red-600">{e}</li>
            ))}
          </ul>
        </div>
      )}

      {mudancas && mudancas.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-800">
            Confira antes de aplicar — {mudancas.length} produto(s) serao corrigidos em <b>{depositoNome}</b>:
          </p>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-amber-100 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-amber-100/60 text-amber-900">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Produto</th>
                  <th className="px-3 py-2 text-right font-semibold">Antes</th>
                  <th className="px-3 py-2 text-right font-semibold">Correcao</th>
                  <th className="px-3 py-2 text-right font-semibold">Depois</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {mudancas.map((m) => (
                  <tr key={m.produto_id}>
                    <td className="px-3 py-1.5 text-gray-800">{m.nome}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{m.saldoAtual}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${m.correcao > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {m.correcao > 0 ? '+' : ''}{m.correcao}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-bold text-gray-900">{m.novoSaldo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button onClick={onConfirmar} disabled={pending}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50">
              {pending ? 'Aplicando...' : `Confirmar e aplicar ${mudancas.length} correcao(oes)`}
            </button>
            <button onClick={() => setMudancas(null)} disabled={pending}
              className="rounded-lg bg-gray-200 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300 transition disabled:opacity-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {sucesso !== null && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-700">
            Pronto! {sucesso} produto(s) corrigido(s) e registrado(s) no historico.
          </p>
        </div>
      )}
    </div>
  )
}