'use client'

import { useState } from 'react'

/**
 * "Como fechar" — o passo a passo do fechamento dentro da própria tela.
 *
 * Existe porque a atendente fecha o caixa sozinha, muitas vezes no aperto do fim do
 * movimento, e a dúvida sempre é a mesma: "posso fechar?", "esse aviso é problema?",
 * "o que faço com essa retirada?". Cada dúvida dessas já virou fechamento errado.
 * Aqui ela lê sem sair do PDV e sem depender de alguém explicar por mensagem.
 */
export function AjudaFechamento() {
  const [aberto, setAberto] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
      >
        ❓ Como fechar
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <p className="text-base font-bold text-gray-900">Como fechar o caixa</p>
              <button type="button" onClick={() => setAberto(false)}
                className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100">✕</button>
            </div>

            <div className="max-h-[75vh] space-y-5 overflow-y-auto px-6 py-5 text-sm text-gray-700">
              <div>
                <p className="mb-1 font-semibold text-gray-900">1. Olhe o resumo antes de contar</p>
                <p>Confira dinheiro, PIX, cartão e fiado do dia. Se algum valor parecer errado, chame o responsável <b>antes</b> de fechar — depois não corrige.</p>
              </div>

              <div>
                <p className="mb-1 font-semibold text-gray-900">2. Confira o bloco "PIX do dia — quem recebeu"</p>
                <ul className="ml-4 list-disc space-y-1">
                  <li><b>Fornecedor (ADL, H2O, ZL…)</b> — o cliente pagou na chave dele. A dívida baixa sozinha ao fechar.</li>
                  <li><b>"Caiu na nossa conta (banco)"</b> — o dinheiro entrou no banco.</li>
                  <li><b>Não identificado</b> — não bateu com ninguém. Avise o responsável.</li>
                </ul>
              </div>

              <div>
                <p className="mb-1 font-semibold text-gray-900">3. Avisos amarelos: só avisam, não travam</p>
                <p>PIX sem comprovante e último pagamento sem baixa são lembretes. Confira no grupo do Telegram e siga.</p>
              </div>

              <div className="rounded-xl border border-red-200 bg-red-50/60 p-3">
                <p className="mb-1 font-semibold text-red-800">4. Retirada de dinheiro — é aqui que dá erro</p>
                <p className="mb-2">Dinheiro que sai da gaveta <b>precisa ter destino escrito</b>:</p>
                <ul className="ml-4 list-disc space-y-1">
                  <li>Pagou fornecedor em dinheiro → Financeiro → achar a nota → <b>Pago</b> → Dinheiro</li>
                  <li>Dinheiro indo para o cofre → registre a <b>transferência</b> (não é retirada)</li>
                  <li>Motoboy, taxa, lanche → Financeiro → <b>+ A Pagar</b> → lançar e marcar paga em dinheiro</li>
                  <li><b>Erro de digitação</b> → não invente retirada nem reforço. Chame o responsável.</li>
                </ul>
                <p className="mt-2">Retirada sem destino <b>trava o fechamento</b> — e é de propósito: impede dinheiro sumir sem rastro.</p>
              </div>

              <div>
                <p className="mb-1 font-semibold text-gray-900">5. Conte a gaveta e feche</p>
                <p>Digite <b>o que você contou</b>, não o que o sistema espera. Se a diferença for grande, conte de novo. Escreva na observação qualquer coisa fora do normal. Depois clique em <b>Fechar Caixa</b>.</p>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <p className="mb-1 font-semibold text-amber-900">Erros que já aconteceram</p>
                <ul className="ml-4 list-disc space-y-1">
                  <li>Venda marcada como <b>dinheiro</b> mas o cliente pagou <b>PIX</b> → a gaveta fica devendo dinheiro que não existe.</li>
                  <li>Criar <b>retirada + reforço</b> do mesmo valor para "corrigir" → não se anulam e travam o fechamento.</li>
                  <li>Fechar sem olhar o "PIX do dia" → comprovante de fornecedor fica sem baixa.</li>
                  <li>Digitar o valor que o sistema esperava no lugar do contado.</li>
                </ul>
              </div>

              <div>
                <p className="mb-1 font-semibold text-gray-900">Na dúvida</p>
                <p><b>Não feche e não invente lançamento.</b> Chame o responsável com hora, valor, quem atendeu e print da tela. Corrigir depois é possível; número inventado contamina o mês inteiro.</p>
              </div>
            </div>

            <div className="border-t border-gray-100 px-6 py-4 text-right">
              <button type="button" onClick={() => setAberto(false)}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
