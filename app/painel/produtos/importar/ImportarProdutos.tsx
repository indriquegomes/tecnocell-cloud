'use client'

import { useState, useTransition } from 'react'
import { conferirImportacao, aplicarImportacao, type Conferencia } from './actions'

// Teto do envio, alinhado com o bodySizeLimit do next.config.ts (4mb). Checar
// AQUI, antes de mandar, é o que transforma "a tela morreu" em "o arquivo é
// grande demais, divide em dois": passar do limite fazia o Next recusar o POST
// com 400 antes de rodar qualquer código nosso, e a promessa rejeitada
// derrubava a página inteira. Folga de 100kb pro peso do resto do formulário.
const LIMITE_ENVIO = 3.9 * 1024 * 1024

export function ImportarProdutos() {
  const [erros, setErros] = useState<string[]>([])
  const [conf, setConf] = useState<Conferencia | null>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [sucesso, setSucesso] = useState<{ novos: number; atualizados: number } | null>(null)
  const [somenteExistentes, setSomenteExistentes] = useState(true)
  const [pending, startTransition] = useTransition()

  function conferir(file: File, aba?: string) {
    setErros([]); setConf(null); setSucesso(null)
    if (file.size > LIMITE_ENVIO) {
      const mb = (file.size / 1024 / 1024).toFixed(1)
      setErros([
        `A planilha tem ${mb}MB e o limite de envio é 4MB — nada foi enviado.`,
        'A exportação do sistema antigo pode ser feita em partes (ex: de 1 a 5000, de 5001 em diante). Envie um arquivo de cada vez, em qualquer ordem: cada um só mexe nos produtos que ele traz.',
      ])
      return
    }
    const fd = new FormData()
    fd.set('arquivo', file)
    if (aba) fd.set('aba', aba)
    if (somenteExistentes) fd.set('somente_existentes', '1')
    startTransition(async () => {
      // try/catch: sem isso, qualquer recusa do servidor (arquivo grande demais,
      // sessão caída, oscilação no meio do upload) virava promessa rejeitada e
      // levava a tela toda pro erro genérico do Next, sem dizer o que houve.
      try {
        const res = await conferirImportacao(fd)
        if (res.ok) setConf(res.conferencia)
        else setErros(res.erros)
      } catch {
        setErros(['Não consegui enviar a planilha — nada foi gravado. Confira a internet e tente de novo; se o arquivo for muito grande, exporte em partes.'])
      }
    })
  }

  function onEnviar(formData: FormData) {
    const file = formData.get('arquivo') as File | null
    if (!file) return
    setArquivo(file)
    conferir(file)
  }

  function onAplicar() {
    if (!conf || conf.mudancas.length === 0) return
    startTransition(async () => {
      try {
        const res = await aplicarImportacao(conf.mudancas)
        if (res.ok) { setSucesso({ novos: res.novos, atualizados: res.atualizados }); setConf(null) }
        else { setErros([res.erro ?? 'Erro ao aplicar.']); setConf(null) }
      } catch {
        setErros(['Não consegui gravar agora. Nada foi alterado — confira a internet e tente de novo.'])
        setConf(null)
      }
    })
  }

  return (
    <div className="space-y-4">
      <form action={onEnviar} className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" name="arquivo" accept=".xlsx" required
            className="block text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100" />
          <button type="submit" disabled={pending}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50">
            {pending ? 'Conferindo...' : 'Enviar e conferir'}
          </button>
        </div>
        {/* Marcado por padrão: reimportar dado do sistema antigo é o caso comum,
            e criar produto sem querer enche o catálogo de duplicata. Quem quer
            trazer item novo desmarca de propósito. */}
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-gray-200 bg-gray-50 p-3">
          {/* sem defaultChecked: quem manda é o estado (que já nasce true).
              Os dois juntos faziam o React reclamar no console a cada render. */}
          <input type="checkbox" name="somente_existentes" value="1"
            checked={somenteExistentes}
            onChange={(e) => setSomenteExistentes(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          <span>
            <span className="block text-sm font-medium text-gray-800">Só atualizar o que já existe</span>
            <span className="block text-xs text-gray-500 mt-0.5">
              Corrige os produtos já cadastrados e <b>não cria nenhum novo</b>. Desmarque só quando
              quiser mesmo trazer produtos que ainda não estão aqui.
            </span>
          </span>
        </label>
      </form>

      {erros.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="mb-2 text-sm font-semibold text-red-700">
            {erros.length === 1 ? 'Encontrei um problema — nada foi gravado:' : `Encontrei ${erros.length} problemas — nada foi gravado:`}
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {erros.map((e, i) => <li key={i} className="text-sm text-red-600">{e}</li>)}
          </ul>
        </div>
      )}

      {sucesso && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-700">
            Pronto! {sucesso.novos} produto(s) novo(s) e {sucesso.atualizados} atualizado(s).
          </p>
          <p className="mt-1 text-sm text-green-600">Pode enviar o proximo arquivo da exportacao.</p>
        </div>
      )}

      {conf && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { rot: 'Produtos no arquivo', v: conf.produtos, cor: 'text-gray-900' },
              conf.somenteExistentes
                ? { rot: 'Nao existem aqui (pulados)', v: conf.naoEncontrados, cor: 'text-gray-400' }
                : { rot: 'Produtos novos', v: conf.novos, cor: 'text-emerald-600' },
              { rot: 'Serao atualizados', v: conf.atualizar, cor: 'text-amber-600' },
              { rot: 'Ja estao iguais', v: conf.semMudanca, cor: 'text-gray-400' },
            ].map((c) => (
              <div key={c.rot} className="rounded-xl border border-gray-200 bg-white p-3">
                <p className="text-xs font-medium text-gray-500">{c.rot}</p>
                <p className={`text-2xl font-bold ${c.cor}`}>{c.v.toLocaleString('pt-BR')}</p>
              </div>
            ))}
          </div>

          {conf.somenteExistentes && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-sm text-blue-900">
              Modo <b>só atualizar</b> ligado: nenhum produto novo vai ser criado.
              {conf.naoEncontrados > 0 && <> {conf.naoEncontrados.toLocaleString('pt-BR')} linha(s) do arquivo não existem aqui e foram puladas.</>}
            </div>
          )}

          {conf.abas.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-gray-500">Aba lida: <b>{conf.aba}</b> · trocar:</span>
              {conf.abas.map((a) => (
                <button key={a} type="button" disabled={pending || a === conf.aba}
                  onClick={() => arquivo && conferir(arquivo, a)}
                  className={`rounded-lg border px-3 py-1 font-medium transition ${
                    a === conf.aba ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>{a}</button>
              ))}
            </div>
          )}

          {conf.avisos.map((a, i) => (
            <div key={i} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{a}</div>
          ))}

          {conf.erros.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="mb-1 text-sm font-semibold text-red-700">
                {conf.erros.length} linha(s) serao ignoradas:
              </p>
              <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5">
                {conf.erros.map((e, i) => <li key={i} className="text-sm text-red-600">{e}</li>)}
              </ul>
            </div>
          )}

          {conf.mudancas.length > 0 ? (
            <>
              <div className="max-h-96 overflow-y-auto rounded-xl border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Ação</th>
                      <th className="px-3 py-2 text-left font-semibold">Código</th>
                      <th className="px-3 py-2 text-left font-semibold">Produto</th>
                      <th className="px-3 py-2 text-left font-semibold">O que muda</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {conf.mudancas.slice(0, 300).map((m) => (
                      <tr key={m.id}>
                        <td className="px-3 py-1.5">
                          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${
                            m.acao === 'novo' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>{m.acao === 'novo' ? 'novo' : 'atualizar'}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-gray-500">{m.codigo || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-800">{m.nome}</td>
                        <td className="px-3 py-1.5 text-gray-600">
                          {m.acao === 'novo' ? <span className="text-gray-400">cadastro novo</span>
                            : <span className="text-xs">{m.diffs.join(' · ')}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {conf.mudancas.length > 300 && (
                <p className="text-xs text-gray-500">Mostrando as 300 primeiras de {conf.mudancas.length}. Aplicar grava todas.</p>
              )}

              <div className="flex gap-2">
                <button onClick={onAplicar} disabled={pending}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50">
                  {pending ? 'Gravando...' : `Confirmar e gravar ${conf.mudancas.length} produto(s)`}
                </button>
                <button onClick={() => setConf(null)} disabled={pending}
                  className="rounded-lg bg-gray-200 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300 transition disabled:opacity-50">
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              Nada a fazer: todos os {conf.semMudanca} produto(s) deste arquivo ja estao iguais aqui.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
