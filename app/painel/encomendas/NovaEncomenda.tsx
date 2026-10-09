'use client'

import { useState } from 'react'
import { criarEncomenda, buscarProdutosEncomenda, buscarPessoasEncomenda } from './actions'
import { formatBRL } from '@/lib/utils'

type Prod = { id: string; nome: string; atacado1: number }
type Pessoa = { id: string; nome: string; telefone: string | null }

export function NovaEncomenda({ lojaId, lojas = [] }: { lojaId: string | null; lojas?: { id: string; nome: string }[] }) {
  const [aberta, setAberta] = useState(false)
  const [lojaSel, setLojaSel] = useState<string>(lojaId ?? (lojas.length === 1 ? lojas[0].id : ''))
  const [buscaCliente, setBuscaCliente] = useState('')
  const [clientes, setClientes] = useState<Pessoa[]>([])
  const [pessoaId, setPessoaId] = useState<string | null>(null)
  const [pessoaNome, setPessoaNome] = useState('')
  const [buscaItem, setBuscaItem] = useState('')
  const [itens, setItens] = useState<Prod[]>([])
  const [produtoId, setProdutoId] = useState<string | null>(null)
  const [itemNome, setItemNome] = useState('')
  const [temporario, setTemporario] = useState(false)
  const [quantidade, setQuantidade] = useState('1')
  const [valorVenda, setValorVenda] = useState('')
  const [sinal, setSinal] = useState('')
  const [sinalForma, setSinalForma] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const reset = () => {
    setBuscaCliente(''); setClientes([]); setPessoaId(null); setPessoaNome('')
    setBuscaItem(''); setItens([]); setProdutoId(null); setItemNome(''); setTemporario(false)
    setQuantidade('1'); setValorVenda(''); setSinal(''); setSinalForma('pix'); setErro(null)
  }

  const buscarClientes = async (termo: string) => {
    setBuscaCliente(termo)
    if (termo.trim().length < 2) { setClientes([]); return }
    setClientes(await buscarPessoasEncomenda(termo))
  }
  const escolherCliente = (p: Pessoa) => { setPessoaId(p.id); setPessoaNome(p.nome); setBuscaCliente(p.nome); setClientes([]) }

  const buscarItens = async (termo: string) => {
    setBuscaItem(termo)
    if (termo.trim().length < 2) { setItens([]); return }
    setItens(await buscarProdutosEncomenda(termo))
  }
  const escolherItem = (p: Prod) => { setProdutoId(p.id); setItemNome(p.nome); setTemporario(false); setValorVenda(String(p.atacado1)); setBuscaItem(p.nome); setItens([]) }
  const usarTemporario = () => { setProdutoId(null); setItemNome(buscaItem.trim()); setTemporario(true); setItens([]) }

  const salvar = async () => {
    if (!pessoaNome.trim() || !itemNome.trim()) { setErro('Preencha cliente e item.'); return }
    const lojaFinal = lojas.length === 1 ? lojas[0].id : lojaSel
    if (!lojaFinal) { setErro('Escolha a loja.'); return }
    setSalvando(true); setErro(null)
    const fd = new FormData()
    fd.set('pessoa_id', pessoaId ?? '')
    fd.set('pessoa_nome', pessoaNome)
    fd.set('produto_id', produtoId ?? '')
    fd.set('item_nome', itemNome)
    fd.set('temporario', temporario ? '1' : '0')
    fd.set('quantidade', quantidade)
    fd.set('valor_venda', valorVenda)
    fd.set('sinal', sinal)
    fd.set('sinal_forma', sinalForma)
    fd.set('loja_id', lojaFinal)
    const r = await criarEncomenda(fd)
    setSalvando(false)
    if (r?.erro) { setErro(r.erro); return }
    setOk(true)
    setTimeout(() => { setOk(false); setAberta(false); reset() }, 1800)
  }

  return (
    <>
      <button type="button" onClick={() => setAberta(true)}
        className="rounded-xl border-2 border-dashed border-[#F47920] bg-orange-50 px-4 py-2.5 text-sm font-bold text-[#F47920] hover:bg-orange-100 transition">
        🛒 NOVA ENCOMENDA
      </button>

      {aberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAberta(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900">Nova Encomenda</h3>
            <p className="text-xs text-gray-500">Cliente quer peça que não está em estoque. Sinal (opcional) vira vale no nome dele.</p>

            <div className="mt-4 space-y-3">
              {lojas.length > 1 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Loja</label>
                  <select value={lojaSel} onChange={(e) => setLojaSel(e.target.value)} className="field">
                    <option value="">Escolha a loja...</option>
                    {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Cliente</label>
                <input value={buscaCliente} onChange={(e) => buscarClientes(e.target.value)} placeholder="Buscar cliente..." className="field" />
                {clientes.length > 0 && (
                  <div className="mt-1 max-h-40 overflow-auto rounded-lg border border-gray-200">
                    {clientes.map((p) => (
                      <button key={p.id} type="button" onClick={() => escolherCliente(p)} className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50">
                        {p.nome}{p.telefone ? <span className="text-gray-400"> · {p.telefone}</span> : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Item</label>
                <input value={buscaItem} onChange={(e) => buscarItens(e.target.value)} placeholder="Buscar peça..." className="field" />
                {itens.length > 0 && (
                  <div className="mt-1 max-h-40 overflow-auto rounded-lg border border-gray-200">
                    {itens.map((p) => (
                      <button key={p.id} type="button" onClick={() => escolherItem(p)} className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50">
                        {p.nome} <span className="text-gray-400">· ATACADO1 {formatBRL(p.atacado1)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {buscaItem.trim().length >= 2 && (
                  <button type="button" onClick={usarTemporario} className="mt-1 block w-full rounded-lg border border-dashed border-[#F47920] bg-orange-50/50 px-3 py-2 text-left text-sm font-semibold text-[#F47920] hover:bg-orange-100 transition">
                    ➕ Usar "{buscaItem.trim()}" (sem cadastro ainda)
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Quantidade</label>
                  <input type="number" min="1" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className="field" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Valor de venda</label>
                  <input type="number" step="0.01" value={valorVenda} onChange={(e) => setValorVenda(e.target.value)} placeholder="R$" className="field" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Sinal (opcional)</label>
                  <input type="number" step="0.01" value={sinal} onChange={(e) => setSinal(e.target.value)} placeholder="0,00" className="field" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Forma do sinal</label>
                  <select value={sinalForma} onChange={(e) => setSinalForma(e.target.value)} className="field">
                    <option value="">Sem sinal</option>
                    <option value="pix">PIX</option>
                    <option value="dinheiro">Dinheiro</option>
                    <option value="cartao_credito">Crédito</option>
                    <option value="cartao_debito">Débito</option>
                  </select>
                </div>
              </div>

              {erro && <p className="text-sm text-rose-600">{erro}</p>}
              {ok && <p className="text-sm font-semibold text-emerald-600">Encomenda criada! 🎉</p>}

              <div className="mt-4 flex gap-2">
                <button type="button" onClick={salvar} disabled={salvando} className="flex-1 rounded-xl bg-[#1B6CA8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#155a8f] disabled:opacity-60 transition">
                  {salvando ? 'Salvando...' : 'Salvar encomenda'}
                </button>
                <button type="button" onClick={() => setAberta(false)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

