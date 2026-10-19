import { carregarPedidosApp } from '../actions'
import { formatBRL, formatDate } from '@/lib/utils'
import { BotaoImprimir } from './BotaoImprimir'

export default async function ImprimirPedido({ searchParams }: { searchParams: Promise<{ pedido?: string; unidade?: string }> }) {
  const { pedido, unidade } = await searchParams
  let dados
  try {
    if (!pedido || !unidade) throw new Error('Link inválido')
    dados = await carregarPedidosApp(unidade, undefined, undefined, pedido)
    if (!dados.pedidos[0]?.confirmado || dados.pedidos[0].status === 'cancelado') throw new Error('Pedido não disponível')
  } catch {
    return <p role="alert">Ficha indisponível. Confira seu acesso e se o pedido foi aceito nesta unidade.</p>
  }
  const p = dados.pedidos[0]
  return <div>
    <div className="mb-4 flex flex-wrap gap-4 print:hidden"><BotaoImprimir /><a href={`/painel/pedidos-app?${new URLSearchParams({ pedido: p.id, unidade: unidade! })}`}>Voltar ao pedido</a></div>
    <article id="ficha-pedido" className="mx-auto w-[72mm] bg-white p-2 font-mono text-xs text-black">
      <h1 className="text-center text-lg font-bold">TECNOCELL · PEDIDO</h1>
      <p className="text-center">{dados.unidade?.nome}</p>
      <p className="mt-3 break-all">Pedido: {p.id}</p><p>{formatDate(p.criadoEm)}</p><p className="break-words">Cliente: {p.cliente}</p>
      <hr className="my-3" />
      {p.itens.map(i => <div key={i.id} className="mb-3"><p className="break-words">{i.quantidade}× {i.nome}</p><p className="text-right">{formatBRL(i.preco)} un. · {formatBRL(i.preco * i.quantidade)}</p></div>)}
      <hr className="my-3" /><p className="text-right font-bold">TOTAL DA UNIDADE: {formatBRL(p.total)}</p>
      <p className="mt-3">{p.pagamento === 'pago' ? 'Pagamento confirmado no sistema' : p.pagamento === 'cancelado' ? 'Pagamento cancelado' : 'Pagamento pendente'}</p>
      <p className="mt-3 text-center">Ficha de pedido · não é comprovante de pagamento.</p><p className="mt-2 text-center">Via / reimpressão</p>
    </article>
    <style>{`@page { size: 80mm 200mm; margin: 4mm; }
      @media print {
        body *:not(:has(#ficha-pedido)):not(#ficha-pedido):not(#ficha-pedido *) { display: none !important; }
        body, body *:has(#ficha-pedido) { display: block !important; position: static !important; transform: none !important; overflow: visible !important; height: auto !important; max-height: none !important; min-height: 0 !important; width: auto !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important; background: white !important; }
        #ficha-pedido { width: 72mm; margin: 0; padding: 0; }
        #ficha-pedido > div { break-inside: avoid; }
      }`}</style>
  </div>
}
