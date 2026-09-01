'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/lib/chat-ia'

interface Props {
  tipo: 'funcionario' | 'cliente'
  className?: string
}

export function ChatWidget({ tipo, className }: Props) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [mensagens, setMensagens] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  async function enviar() {
    const texto = input.trim()
    if (!texto || loading) return

    const novasMensagens: ChatMessage[] = [
      ...mensagens,
      { role: 'user', content: texto },
    ]
    setMensagens(novasMensagens)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagens: novasMensagens, tipo }),
      })

      if (!res.body) throw new Error('Sem resposta')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let resposta = ''

      setMensagens((prev) => [...prev, { role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        resposta += decoder.decode(value, { stream: true })
        setMensagens((prev) => {
          const atualizado = [...prev]
          atualizado[atualizado.length - 1] = { role: 'assistant', content: resposta }
          return atualizado
        })
      }
    } catch (e) {
      setMensagens((prev) => [
        ...prev,
        { role: 'assistant', content: 'Desculpe, ocorreu um erro. Tente novamente.' },
      ])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  return (
    <div className={cn('fixed bottom-6 right-6 z-50', className)}>
      {/* Botão flutuante */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition hover:bg-blue-700 hover:scale-105"
          aria-label="Abrir chat"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </button>
      )}

      {/* Janela do chat */}
      {open && (
        <div className="flex h-[500px] w-[360px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between bg-blue-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-400" />
              <span className="font-semibold text-sm">
                {tipo === 'funcionario' ? 'Assistente TecnoCell Cloud' : 'Atendimento TecnoCell Cloud'}
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-1 hover:bg-blue-700 transition"
              aria-label="Fechar chat"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {mensagens.length === 0 && (
              <div className="text-center text-sm text-gray-400 mt-8">
                <p className="text-2xl mb-2">👋</p>
                <p>
                  {tipo === 'funcionario'
                    ? 'Olá! Posso ajudar com estoque, financeiro e dados do sistema.'
                    : 'Olá! Posso ajudar com produtos, preços e disponibilidade.'}
                </p>
              </div>
            )}
            {mensagens.map((msg, i) => (
              <div
                key={i}
                className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                  )}
                >
                  {msg.content || (
                    <span className="inline-flex gap-1">
                      <span className="animate-bounce">·</span>
                      <span className="animate-bounce delay-100">·</span>
                      <span className="animate-bounce delay-200">·</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Digite sua mensagem..."
                rows={1}
                className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ maxHeight: '80px' }}
              />
              <Button
                onClick={enviar}
                loading={loading}
                size="sm"
                className="h-9 w-9 rounded-xl p-0"
                aria-label="Enviar"
              >
                {!loading && (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </Button>
            </div>
            <p className="mt-1 text-center text-xs text-gray-400">Powered by Claude · TecnoCell Cloud</p>
          </div>
        </div>
      )}
    </div>
  )
}
