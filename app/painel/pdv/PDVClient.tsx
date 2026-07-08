'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { formatBRL } from '@/lib/utils'
import { labelPrazo } from '@/lib/formas-pagamento'
import { createClient } from '@/lib/supabase/client'
import { finalizarVenda, salvarOrcamentoPDV, buscarItensTabela, buscarProdutosPDV, buscarClientesPDV, buscarVendas, buscarCrediario, pagarLancamentos, registrarPagamentoParcial, buscarPedidosAbertos, buscarDetalheVenda, validarSenhaDesconto, type VendaResumo, type PagamentoInput, type CrediarioItem, type PedidoResumo, type DetalheVenda } from './actions'
import { buscarSaldoCredito } from '@/app/painel/creditos/actions'
import type { PromoInfo } from './page'

// Preço unitário de uma faixa progressiva conforme a quantidade TOTAL do grupo.
// Pega a maior faixa cujo mínimo já foi atingido. Nenhuma atingida = sem desconto.
function precoFaixa(faixas: { quantidade_minima: number; preco: number }[], totalQtd: number): number | null {
  let melhor: number | null = null
  let maiorMin = -1
  for (const f of faixas) {
    if (totalQtd >= f.quantidade_minima && f.quantidade_minima > maiorMin) { maiorMin = f.quantidade_minima; melhor = f.preco }
  }
  return melhor
}

// Desconto que uma promoção dá para uma linha (preço base + quantidade).
// grupoQtd = quantidade total do grupo no carrinho (usado só no tipo progressivo).
function descontoDaPromo(promo: PromoInfo, base: number, qtd: number, grupoQtd?: number): number {
  if (promo.tipo === 'valor_direto' && promo.preco_promocional != null && base > promo.preco_promocional) {
    return qtd * (base - promo.preco_promocional)
  }
  if (promo.tipo === 'progressivo' && promo.faixas && promo.faixas.length > 0) {
    const preco = precoFaixa(promo.faixas, grupoQtd ?? qtd)
    if (preco != null && base > preco) return qtd * (base - preco)
  }
  if (promo.tipo === 'leve_x_pague_y' && promo.x && promo.y) {
    const grupos = Math.floor(qtd / promo.x)
    return grupos * (promo.x - promo.y) * base
  }
  if (promo.tipo === 'acima_x_pague_y' && promo.x && promo.valor != null && qtd >= promo.x && base > promo.valor) {
    return qtd * (base - promo.valor)
  }
  return 0
}

// Rótulo curto da promoção para o seletor do carrinho
function labelPromo(p: PromoInfo): string {
  const brl = (v: number) => formatBRL(v)
  if (p.tipo === 'valor_direto' && p.preco_promocional != null) return `${p.nome} · ${brl(p.preco_promocional)}`
  if (p.tipo === 'progressivo') return `${p.nome} · por quantidade`
  if (p.tipo === 'leve_x_pague_y') return `${p.nome} · Leve ${p.x} Pague ${p.y}`
  if (p.tipo === 'acima_x_pague_y') return `${p.nome} · ${p.x}+ a ${brl(p.valor ?? 0)}`
  return p.nome
}

// Lê o access token do navegador (cookie httpOnly:false). Fonte confiável de auth
// para server actions — cookies() vem vazio em server actions na Vercel.
const supabaseBrowser = createClient()
async function authToken(): Promise<string> {
  const { data } = await supabaseBrowser.auth.getSession()
  return data.session?.access_token ?? ''
}

function iconeForma(nome: string) {
  const n = nome.toLowerCase()
  if (n.includes('pix')) return '💠'
  if (n.includes('dinheiro')) return '💵'
  if (n.includes('fiado') || n.includes('crédito loja') || n.includes('credito loja')) return '🤝'
  if (n.includes('débito') || n.includes('debito') || n.includes('crédito') || n.includes('credito')) return '💳'
  return '•'
}

interface Produto {
  id: string
  nome: string
  preco: number
  codigo: string | null
  marca: string | null
  categoria: string | null
  descricao: string | null
  imagem_url: string | null
  controla_serie: boolean
  prateleira: string | null
  estoquePorDeposito: Record<string, number>
}

interface FormaPagamento {
  id: string
  nome: string
  tipo: string | null
  maquina_id: string | null
  prazo_recebimento: string | null
}

interface Maquina {
  id: string
  nome: string
  taxa_debito: number
  taxas_credito: number[]
  max_parcelas: number
}

interface Pessoa {
  id: string
  nome: string
  cpf_cnpj?: string | null
  telefone?: string | null
  endereco?: string | null
  bairro?: string | null
  cidade?: string | null
  estado?: string | null
  cep?: string | null
  tabela_preco_id?: string | null
}

interface Deposito {
  id: string
  nome: string
  loja_id: string | null
}

interface Loja {
  id: string
  nome: string
  razao_social: string | null
  cnpj: string | null
  inscricao_estadual: string | null
  telefone: string | null
  whatsapp: string | null
  cep: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  deposito_padrao_id: string | null
  tabela_padrao_id: string | null
  exige_senha_desconto: boolean
  logo_url: string | null
  termos_venda: string | null
}

interface TabelaPreco {
  id: string
  nome: string
}

interface ItemCarrinho {
  produto_id: string
  nome: string
  codigo: string | null
  quantidade: number
  preco_unitario: number   // preço base (tabela/padrão) — promoção entra como desconto
  estoque_disponivel: number
  promoSel: string         // 'auto' = melhor desconto | '' = sem promoção | <id> = promoção fixa
  serializado?: boolean    // produto controla IMEI/número de série
  series?: string[]        // IMEIs escolhidos (serializado: quantidade = series.length)
  prateleira?: string | null  // gaveta/prateleira onde a peça está guardada
}

interface PagamentoItem {
  uid: string
  forma_id: string
  valor: string
  maquina: string   // id da máquina de cartão ('' = nenhuma)
  parcelas: number
}

interface Props {
  produtos: Produto[]   // dados iniciais do servidor
  formas: FormaPagamento[]
  pessoas: Pessoa[]
  depositos: Deposito[]
  lojas: Loja[]
  maquinas: Maquina[]
  tabelas: TabelaPreco[]
  precosPorTabela: Record<string, Record<string, { qtd_min: number; preco: number }[]>>
  promosPorProduto: Record<string, PromoInfo[]>
  seriesPorProduto: Record<string, Record<string, string[]>>  // produto_id → deposito_id → [IMEIs em_estoque]
  depositoInicial?: string   // depósito padrão do usuário (config PDV do perfil)
}

export function PDVClient({ produtos: produtosIniciais, formas, pessoas: pessoasIniciais, depositos, lojas, maquinas, tabelas, precosPorTabela, promosPorProduto, seriesPorProduto: seriesIniciais, depositoInicial }: Props) {
  // produtos/pessoas/IMEIs viram CACHE acumulável: começam vazios (não vêm mais no HTML)
  // e vão sendo preenchidos pela busca sob demanda. Os `.find()` do carrinho leem daqui,
  // e como só entra no carrinho o que veio da busca, o item sempre está no cache.
  const [produtos, setProdutos] = useState(produtosIniciais)
  const [pessoas, setPessoas] = useState(pessoasIniciais)
  const [seriesPorProduto, setSeriesPorProduto] = useState(seriesIniciais)
  const [buscandoProdutos, setBuscandoProdutos] = useState(false)
  const [buscandoClientes, setBuscandoClientes] = useState(false)
  const [busca, setBusca] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [selCopia, setSelCopia] = useState<Set<string>>(new Set())  // peças marcadas pra copiar preço
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [pagamentos, setPagamentos] = useState<PagamentoItem[]>([
    { uid: '1', forma_id: formas[0]?.id ?? '', valor: '', maquina: formas[0]?.maquina_id ?? '', parcelas: 1 },
  ])
  // enquanto true, o valor do pagamento único acompanha o total do carrinho sozinho;
  // vira false quando o operador digita um valor à mão (pra dividir pagamento)
  const [valorAuto, setValorAuto] = useState(true)
  const [pessoaId, setPessoaId] = useState('')
  const [desconto, setDesconto] = useState('')
  const [senhaDesconto, setSenhaDesconto] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [copiadoId, setCopiadoId] = useState<string | null>(null)
  const [buscaCliente, setBuscaCliente] = useState('')
  const [descontoTipo, setDescontoTipo] = useState<'valor' | 'percent'>('valor')
  // #9 Buscar Vendas — modal de consulta de vendas já feitas
  const [mostrarVendas, setMostrarVendas] = useState(false)
  const [vendas, setVendas] = useState<VendaResumo[]>([])
  const [carregandoVendas, setCarregandoVendas] = useState(false)
  const [buscaVenda, setBuscaVenda] = useState('')
  // F9 Crediário — modal de fiado/A Receber
  const [mostrarCrediario, setMostrarCrediario] = useState(false)
  const [crediarioItens, setCrediarioItens] = useState<CrediarioItem[]>([])
  const [carregandoCrediario, setCarregandoCrediario] = useState(false)
  const [buscaCrediario, setBuscaCrediario] = useState('')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [pagandoCrediario, setPagandoCrediario] = useState(false)
  const [pagoCrediarioOk, setPagoCrediarioOk] = useState(false)
  const [detalheVenda, setDetalheVenda] = useState<DetalheVenda | null>(null)
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false)
  // Modal de recebimento por linha
  const [recebendoItem, setRecebendoItem] = useState<CrediarioItem | null>(null)
  const [formaRecebimento, setFormaRecebimento] = useState<string>('dinheiro')
  const [valorRecebido, setValorRecebido] = useState<string>('')
  // F3 — Busca Orçamento/Pedido
  const [mostrarOrcamentos, setMostrarOrcamentos] = useState(false)
  const [orcamentos, setOrcamentos] = useState<PedidoResumo[]>([])
  const [carregandoOrcamentos, setCarregandoOrcamentos] = useState(false)
  const [buscaOrcamento, setBuscaOrcamento] = useState('')

  // F1 — Consultar Produtos (modal com busca própria + ficha rica)
  const [fichaAberta, setFichaAberta] = useState(false)
  const [fichaSel, setFichaSel] = useState<Produto | null>(null)
  const [buscaFicha, setBuscaFicha] = useState('')

  // Crédito do cliente
  const [saldoCredito, setSaldoCredito] = useState(0)
  const [creditoAplicado, setCreditoAplicado] = useState(0)


  const qtdRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  // Busca saldo de crédito ao selecionar cliente
  useEffect(() => {
    if (!pessoaId) { setSaldoCredito(0); setCreditoAplicado(0); return }
    authToken().then((t) => {
      if (!t) return
      buscarSaldoCredito(t, pessoaId).then(({ saldo }) => setSaldoCredito(saldo)).catch(() => {})
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pessoaId])

  // Toast de aviso some sozinho após 4s
  useEffect(() => {
    if (!erro) return
    const t = setTimeout(() => setErro(null), 4000)
    return () => clearTimeout(t)
  }, [erro])

  // Junta resultados da busca no cache de produtos (dedupe por id) + IMEIs encontrados
  const mesclarProdutos = useCallback((novos: Produto[], series: Record<string, Record<string, string[]>>) => {
    if (novos.length) setProdutos((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]))
      for (const p of novos) map.set(p.id, p)   // versão nova sobrescreve (estoque fresco)
      return Array.from(map.values())
    })
    if (Object.keys(series).length) setSeriesPorProduto((prev) => ({ ...prev, ...series }))
  }, [])

  // Busca de produto SOB DEMANDA (debounce 250ms) — alimenta o cache; a vitrine
  // (produtosFiltrados) continua filtrando o cache pelo termo. Vale pra busca principal e a do F1.
  useEffect(() => {
    // modal F1 aberto usa a busca dele; senão a busca principal
    const termo = (fichaAberta ? buscaFicha : busca).trim()
    if (termo.length < 1) { setBuscandoProdutos(false); return }
    setBuscandoProdutos(true)
    let vivo = true
    const t = setTimeout(async () => {
      try {
        const { produtos: achados, series } = await buscarProdutosPDV(await authToken(), termo)
        if (vivo) mesclarProdutos(achados, series)
      } catch { /* silencioso */ }
      finally { if (vivo) setBuscandoProdutos(false) }
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [busca, buscaFicha, fichaAberta, mesclarProdutos])

  // Busca de cliente SOB DEMANDA (debounce 250ms) — alimenta o cache de pessoas
  useEffect(() => {
    const termo = buscaCliente.trim()
    if (termo.length < 1) { setBuscandoClientes(false); return }
    setBuscandoClientes(true)
    let vivo = true
    const t = setTimeout(async () => {
      try {
        const achados = await buscarClientesPDV(await authToken(), termo)
        if (vivo && achados.length) setPessoas((prev) => {
          const map = new Map(prev.map((p) => [p.id, p]))
          for (const p of achados) map.set(p.id, p)
          return Array.from(map.values())
        })
      } catch { /* silencioso */ }
      finally { if (vivo) setBuscandoClientes(false) }
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [buscaCliente])

  // Atalhos de teclado (F8 finalizar, F2 busca, Esc fecha) — refs evitam closure stale
  const buscaRef = useRef<HTMLInputElement>(null)
  const buscaFichaRef = useRef<HTMLInputElement>(null)
  const acaoF1Ref = useRef<() => void>(() => {})
  const acaoF3Ref = useRef<() => void>(() => {})
  const acaoF4Ref = useRef<() => void>(() => {})
  const acaoF8Ref = useRef<() => void>(() => {})
  const acaoF9Ref = useRef<() => void>(() => {})
  const acaoEscRef = useRef<() => void>(() => {})
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); acaoF1Ref.current() }
      else if (e.key === 'F3') { e.preventDefault(); acaoF3Ref.current() }
      else if (e.key === 'F4') { e.preventDefault(); acaoF4Ref.current() }
      else if (e.key === 'F8') { e.preventDefault(); acaoF8Ref.current() }
      else if (e.key === 'F9') { e.preventDefault(); acaoF9Ref.current() }
      else if (e.key === 'F2') { e.preventDefault(); buscaRef.current?.focus() }
      else if (e.key === 'Escape') { acaoEscRef.current() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  const [vendaConcluidaId, setVendaConcluidaId] = useState<string | null>(null)
  const [vendaTotal, setVendaTotal] = useState(0)
  const [vendaSnapshot, setVendaSnapshot] = useState<{
    numero: number | null
    itens: { codigo: string | null; nome: string; quantidade: number; preco_unitario: number }[]
    pagamentos: { forma_nome: string; valor: number; taxa: number; parcelas: number; status: string }[]
    cliente: string | null
    clienteTelefone: string | null
    clienteEndereco: string | null
    vendedor: string | null
    deposito: string
    loja: string | null
    lojaRazao: string | null
    lojaCnpj: string | null
    lojaIE: string | null
    lojaEndereco: string | null
    lojaTelefone: string | null
    lojaLogo: string | null
    lojaTermos: string | null
    desconto: number
    horario: string
  } | null>(null)
  const [mostrarConfirmacao, setMostrarConfirmacao] = useState(false)
  const [salvandoOrc, setSalvandoOrc] = useState(false)
  const [msgOrc, setMsgOrc] = useState('')
  // Loja/depósito: lembrado por COMPUTADOR (localStorage) — as usuárias revezam
  // entre lojas, então cada PC fica na sua loja. Sem loja chumbada.
  // Depósito padrão vem da configuração da loja; senão cai no 1º dela.
  function depoDefaultDaLoja(lj: string): string {
    // 1º: depósito padrão do USUÁRIO (config PDV do perfil), se for desta loja
    if (depositoInicial && depositos.some((d) => d.id === depositoInicial && d.loja_id === lj)) return depositoInicial
    const loja = lojas.find((l) => l.id === lj)
    if (loja?.deposito_padrao_id && depositos.some((d) => d.id === loja.deposito_padrao_id && d.loja_id === lj)) return loja.deposito_padrao_id
    return depositos.find((d) => d.loja_id === lj)?.id ?? ''
  }
  const [lojaId, setLojaId] = useState(lojas[0]?.id ?? '')
  const [depositoId, setDepositoId] = useState(depoDefaultDaLoja(lojas[0]?.id ?? ''))
  useEffect(() => {
    const lj = localStorage.getItem('pdv_loja')
    const dp = localStorage.getItem('pdv_deposito')
    if (lj && lojas.some((l) => l.id === lj)) {
      setLojaId(lj)
      const depsLoja = depositos.filter((d) => d.loja_id === lj)
      setDepositoId(dp && depsLoja.some((d) => d.id === dp) ? dp : depoDefaultDaLoja(lj))
      setTabelaId(tabelaVisivel(lojas.find((l) => l.id === lj)?.tabela_padrao_id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (lojaId) localStorage.setItem('pdv_loja', lojaId) }, [lojaId])
  useEffect(() => { if (depositoId) localStorage.setItem('pdv_deposito', depositoId) }, [depositoId])
  const lojaSel = lojas.find((l) => l.id === lojaId) ?? null
  const depositosDaLoja = depositos.filter((d) => d.loja_id === lojaId)
  // depósitos reais de todas as lojas (exclui órfãos tipo Estoque Geral) — pra mostrar
  // o estoque em TODAS as lojas no resultado da busca (Isa)
  const depositosReais = depositos.filter((d) => d.loja_id)
  // Tabela padrão só vale se o usuário pode vê-la (tabelas vem filtrada do servidor); senão Preço Padrão
  function tabelaVisivel(id: string | null | undefined): string {
    return id && tabelas.some((t) => t.id === id) ? id : ''
  }
  const [tabelaId, setTabelaId] = useState(tabelaVisivel(lojas[0]?.tabela_padrao_id))   // '' = Preço Padrão

  const clienteSelecionado = pessoas.find((p) => p.id === pessoaId)
  const soDigitos = (s: string) => s.replace(/\D/g, '')
  // sem acento (igual ao servidor) — senão "jose" não casaria "José" que a busca trouxe
  const semAcento = (s: string) => s.normalize('NFD').split('').filter((c) => { const n = c.charCodeAt(0); return n < 768 || n > 879 }).join('').toLowerCase()
  const clientesFiltrados = buscaCliente.length >= 1
    ? pessoas.filter((p) => {
        const nomeMatch = semAcento(p.nome).includes(semAcento(buscaCliente))
        const cpfMatch = soDigitos(buscaCliente).length >= 1 &&
          soDigitos(p.cpf_cnpj ?? '').includes(soDigitos(buscaCliente))
        return nomeMatch || cpfMatch
      }).slice(0, 6)
    : []

  const nomeDeposito = depositos.find((d) => d.id === depositoId)?.nome ?? ''
  const saldoNoDeposito = (p: Produto) => p.estoquePorDeposito[depositoId] ?? 0
  // Preços por tabela carregados sob demanda (começam vazios; carrega ao escolher a tabela)
  const [precos, setPrecos] = useState(precosPorTabela)
  const [carregandoTabela, setCarregandoTabela] = useState(false)

  // Preço na tabela conforme a quantidade (faixa/atacado): pega a 1ª faixa que cabe
  // (as faixas já vêm ordenadas do maior qtd_min pro menor). null = tabela não cobre o produto.
  const precoNoMapa = (mapa: typeof precos, tab: string, produtoId: string, qtd: number): number | null => {
    const faixas = mapa[tab]?.[produtoId]
    if (!faixas || faixas.length === 0) return null
    const faixa = faixas.find((f) => qtd >= f.qtd_min)
    return faixa ? faixa.preco : null
  }
  const precoTabela = (tab: string, produtoId: string, qtd: number): number | null => precoNoMapa(precos, tab, produtoId, qtd)
  // Preço do produto na tabela selecionada (qtd 1 pra vitrine; cai no padrão se não houver)
  const precoDoProduto = (p: Produto) => precoTabela(tabelaId, p.id, 1) ?? p.preco

  // Busca esperta: tira acento e casa cada palavra em qualquer ordem/posição
  // ("fr a11" acha "FRONTAL ... A11"; "tam" acha "TAMPA"). Procura em nome + código + marca.
  const casaBusca = (texto: string, termo: string) => {
    const alvo = semAcento(texto)
    return semAcento(termo).split(/\s+/).filter(Boolean).every((w) => alvo.includes(w))
  }
  const textoProduto = (p: Produto) => `${p.nome} ${p.codigo ?? ''} ${p.marca ?? ''}`

  const produtosFiltrados = busca.trim().length >= 1
    ? produtos.filter((p) => casaBusca(textoProduto(p), busca)).slice(0, 8)
    : []

  // Busca interna do modal Consultar Produtos (F1)
  const fichaFiltrados = buscaFicha.trim().length >= 1
    ? produtos.filter((p) => casaBusca(textoProduto(p), buscaFicha)).slice(0, 20)
    : []

  // trocar a busca zera as peças marcadas (evita marcar de uma busca e copiar de outra)
  useEffect(() => { setSelCopia(new Set()) }, [busca])
  const marcarCopia = (id: string) => setSelCopia((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  // Copiar preços pra mandar orçamento no WhatsApp: as marcadas, ou todas se nenhuma marcada
  const copiarPrecos = async () => {
    const base = produtos.filter((p) => casaBusca(textoProduto(p), busca)).slice(0, 50)
    const marcadas = base.filter((p) => selCopia.has(p.id))
    const alvo = marcadas.length ? marcadas : base
    const txt = alvo.map((p) => `${p.codigo ? p.codigo + ' - ' : ''}${p.nome} — ${formatBRL(precoDoProduto(p))}`).join('\n')
    try {
      await navigator.clipboard.writeText(txt)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    } catch { /* clipboard bloqueado */ }
  }

  const fecharFicha = () => { setFichaAberta(false); setFichaSel(null); setBuscaFicha('') }

  const adicionarAoCarrinho = useCallback((p: Produto) => {
    const disp = p.estoquePorDeposito[depositoId] ?? 0
    if (disp <= 0) {
      setErro(`"${p.nome}" sem estoque em ${nomeDeposito || 'depósito selecionado'}.`)
      return
    }
    setErro(null)
    setCarrinho((prev) => {
      const existing = prev.find((i) => i.produto_id === p.id)
      if (existing) {
        // Serializado: a linha já existe; os IMEIs são escolhidos no picker da linha
        if (p.controla_serie) return prev
        if (existing.quantidade >= disp) {
          setErro(`Estoque máximo em ${nomeDeposito}: ${disp} unidade(s).`)
          return prev
        }
        return prev.map((i) => i.produto_id === p.id ? { ...i, quantidade: i.quantidade + 1 } : i)
      }
      return [...prev, {
        produto_id: p.id,
        nome: p.nome,
        codigo: p.codigo,
        quantidade: p.controla_serie ? 0 : 1,   // serializado: quantidade = IMEIs escolhidos
        preco_unitario: precoTabela(tabelaId, p.id, 1) ?? p.preco,
        estoque_disponivel: disp,
        promoSel: 'auto',
        serializado: p.controla_serie,
        series: p.controla_serie ? [] : undefined,
        prateleira: p.prateleira,
      }]
    })
    setBusca('')
  }, [depositoId, nomeDeposito, tabelaId, precos])

  // IMEIs disponíveis (em_estoque) do produto no depósito atual
  const seriesDisponiveis = useCallback(
    (produto_id: string) => seriesPorProduto[produto_id]?.[depositoId] ?? [],
    [seriesPorProduto, depositoId],
  )

  // Marca/desmarca um IMEI na linha serializada (quantidade = nº de IMEIs)
  const toggleSerie = (produto_id: string, serie: string) => {
    setErro(null)
    setCarrinho((prev) => prev.map((i) => {
      if (i.produto_id !== produto_id) return i
      const atuais = i.series ?? []
      const novas = atuais.includes(serie) ? atuais.filter((s) => s !== serie) : [...atuais, serie]
      return { ...i, series: novas, quantidade: novas.length }
    }))
  }

  // Bipa um IMEI: valida contra os disponíveis e adiciona se ainda não escolhido
  const biparSerie = (produto_id: string, valorRaw: string) => {
    const valor = valorRaw.trim()
    if (!valor) return
    const disp = seriesDisponiveis(produto_id)
    if (!disp.includes(valor)) {
      setErro(`IMEI "${valor}" não está no estoque de ${nomeDeposito}.`)
      return
    }
    setErro(null)
    setCarrinho((prev) => prev.map((i) => {
      if (i.produto_id !== produto_id) return i
      const atuais = i.series ?? []
      if (atuais.includes(valor)) return i
      const novas = [...atuais, valor]
      return { ...i, series: novas, quantidade: novas.length }
    }))
  }

  // Troca a promoção aplicada a uma linha do carrinho
  const trocarPromo = (produto_id: string, valor: string) => {
    setCarrinho((prev) => prev.map((i) => i.produto_id === produto_id ? { ...i, promoSel: valor } : i))
  }

  // Quantidade total de um grupo (promo progressiva) somando TODAS as linhas do
  // carrinho cujo produto participa da promoção. É o que define a faixa de preço.
  const grupoTotalProg = (promoId: string) =>
    carrinho.reduce((s, i) => s + ((promosPorProduto[i.produto_id] ?? []).some((p) => p.id === promoId) ? i.quantidade : 0), 0)

  // Promoção efetiva de uma linha (resolve 'auto' = melhor desconto na quantidade atual)
  const promoEfetiva = (item: ItemCarrinho): PromoInfo | null => {
    const lista = promosPorProduto[item.produto_id] ?? []
    if (lista.length === 0 || item.promoSel === '') return null
    if (item.promoSel !== 'auto') return lista.find((p) => p.id === item.promoSel) ?? null
    let melhor: PromoInfo | null = null
    let maior = 0
    for (const p of lista) {
      const d = descontoDaPromo(p, item.preco_unitario, item.quantidade, p.tipo === 'progressivo' ? grupoTotalProg(p.id) : undefined)
      if (d > maior) { maior = d; melhor = p }
    }
    return melhor
  }

  // Definir a quantidade digitando direto (respeita o estoque disponível)
  const definirQtd = (produto_id: string, valor: string) => {
    setErro(null)
    const n = parseInt(valor, 10)
    setCarrinho((prev) => prev.map((i) => {
      if (i.produto_id !== produto_id) return i
      if (i.serializado) return i   // quantidade dirigida pelos IMEIs escolhidos
      const reprecar = (q: number) => precoTabela(tabelaId, produto_id, q) ?? i.preco_unitario
      if (isNaN(n) || n < 1) return { ...i, quantidade: 1, preco_unitario: reprecar(1) }
      if (n > i.estoque_disponivel) {
        setErro(`Estoque máximo: ${i.estoque_disponivel} unidade(s).`)
        return { ...i, quantidade: i.estoque_disponivel, preco_unitario: reprecar(i.estoque_disponivel) }
      }
      return { ...i, quantidade: n, preco_unitario: reprecar(n) }
    }))
  }

  // Trocar de tabela: carrega os itens da tabela sob demanda (se ainda não carregou) e
  // recalcula o preço dos itens do carrinho com o mapa já atualizado.
  const trocarTabela = async (novaTabela: string) => {
    setTabelaId(novaTabela)
    let mapa = precos
    if (novaTabela && !precos[novaTabela]) {
      setCarregandoTabela(true)
      try {
        const itens = await buscarItensTabela(await authToken(), novaTabela)
        const m: Record<string, { qtd_min: number; preco: number }[]> = {}
        for (const it of itens) {
          ;(m[it.produto_id] ??= []).push({ qtd_min: it.quantidade_minima ?? 1, preco: it.preco })
        }
        for (const pid in m) m[pid].sort((a, b) => b.qtd_min - a.qtd_min)
        mapa = { ...precos, [novaTabela]: m }
        setPrecos(mapa)
      } catch { setErro('Não consegui carregar a tabela de preço. Tenta de novo.') }
      setCarregandoTabela(false)
    }
    setCarrinho((prev) => prev.map((item) => {
      const prod = produtos.find((p) => p.id === item.produto_id)
      const novoPreco = precoNoMapa(mapa, novaTabela, item.produto_id, item.quantidade) ?? prod?.preco ?? item.preco_unitario
      return { ...item, preco_unitario: novoPreco }
    }))
  }

  // Se a loja abre com uma tabela padrão (não "Preço Padrão"), carrega os itens dela
  // no início pra os preços já saírem certos.
  useEffect(() => {
    if (tabelaId && !precos[tabelaId]) trocarTabela(tabelaId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Trocar de depósito: revalida o carrinho contra o saldo do novo local
  const trocarDeposito = (novoId: string) => {
    setDepositoId(novoId)
    setErro(null)
    setCarrinho((prev) => {
      const ajustado: ItemCarrinho[] = []
      const removidos: string[] = []
      for (const item of prev) {
        const prod = produtos.find((p) => p.id === item.produto_id)
        const disp = prod?.estoquePorDeposito[novoId] ?? 0
        if (disp <= 0) { removidos.push(item.nome); continue }
        if (item.serializado) {
          // IMEIs escolhidos eram do depósito anterior — zera para re-escolher no novo
          ajustado.push({ ...item, series: [], quantidade: 0, estoque_disponivel: disp })
        } else {
          ajustado.push({ ...item, quantidade: Math.min(item.quantidade, disp), estoque_disponivel: disp })
        }
      }
      if (removidos.length > 0) {
        const nome = depositos.find((d) => d.id === novoId)?.nome ?? 'novo depósito'
        setErro(`Removido(s) por falta de estoque em ${nome}: ${removidos.join(', ')}`)
      }
      return ajustado
    })
  }

  // Trocar de loja: aplica o depósito e a tabela padrão dela
  const trocarLoja = (novoLojaId: string) => {
    setLojaId(novoLojaId)
    trocarDeposito(depoDefaultDaLoja(novoLojaId))
    trocarTabela(tabelaVisivel(lojas.find((l) => l.id === novoLojaId)?.tabela_padrao_id))
  }

  const alterarQtd = (produto_id: string, delta: number) => {
    setErro(null)
    setCarrinho((prev) =>
      prev.map((i) => {
        if (i.produto_id !== produto_id) return i
        if (i.serializado) return i   // quantidade dirigida pelos IMEIs escolhidos
        const novaQtd = i.quantidade + delta
        if (novaQtd > i.estoque_disponivel) {
          setErro(`Estoque máximo disponível: ${i.estoque_disponivel} unidade(s).`)
          return i
        }
        const q = Math.max(1, novaQtd)
        // re-preço por faixa de quantidade (atacado); sem tabela/faixa, mantém o preço
        return { ...i, quantidade: q, preco_unitario: precoTabela(tabelaId, produto_id, q) ?? i.preco_unitario }
      })
    )
  }

  const remover = (produto_id: string) => {
    setErro(null)
    setCarrinho((prev) => prev.filter((i) => i.produto_id !== produto_id))
  }

  // Copiar "código - nome - preço" do produto para mandar no WhatsApp
  const copiarProduto = async (item: ItemCarrinho) => {
    const texto = [item.codigo, item.nome, formatBRL(item.preco_unitario)]
      .filter(Boolean)
      .join(' - ')
    try {
      await navigator.clipboard.writeText(texto)
      setCopiadoId(item.produto_id)
      setTimeout(() => setCopiadoId(null), 1500)
    } catch {
      setErro('Não foi possível copiar.')
    }
  }

  const subtotal = carrinho.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
  const totalItens = carrinho.reduce((s, i) => s + i.quantidade, 0)

  // Desconto por promoção aplicada em cada linha (resolve 'auto' = melhor desconto)
  const descontoPromoDetalhes = carrinho.flatMap((item) => {
    const promo = promoEfetiva(item)
    if (!promo) return []
    const valor = descontoDaPromo(promo, item.preco_unitario, item.quantidade, promo.tipo === 'progressivo' ? grupoTotalProg(promo.id) : undefined)
    if (valor <= 0) return []
    return [{ label: `${promo.nome} (${item.nome})`, valor }]
  })
  const descontoPromo = descontoPromoDetalhes.reduce((s, d) => s + d.valor, 0)

  const descontoBruto = descontoTipo === 'percent'
    ? subtotal * (parseFloat(desconto) || 0) / 100
    : parseFloat(desconto) || 0
  const descontoNum = Math.min(Math.max(0, descontoBruto), subtotal)
  const total = subtotal - descontoNum - descontoPromo

  // Helpers por forma de pagamento — o comportamento vem do TIPO, não do nome
  const nomeDaForma = (id: string) => formas.find((f) => f.id === id)?.nome ?? ''
  const tipoDaForma = (id: string) => formas.find((f) => f.id === id)?.tipo ?? ''
  const isCartaoForma = (id: string) => ['cartao_credito', 'cartao_debito'].includes(tipoDaForma(id))
  const isCreditoForma = (id: string) => tipoDaForma(id) === 'cartao_credito'
  const isDebitoForma = (id: string) => tipoDaForma(id) === 'cartao_debito'
  const isFiadoForma = (id: string) => tipoDaForma(id) === 'fiado'
  const isDinheiroForma = (id: string) => tipoDaForma(id) === 'dinheiro'

  const maquinaById = (id: string) => maquinas.find((m) => m.id === id)
  // máquina fixada pela forma (Etapa 1): cartão não pede máquina de novo no PDV
  const maquinaDaForma = (id: string) => formas.find((f) => f.id === id)?.maquina_id ?? ''
  const prazoDaForma = (id: string) => formas.find((f) => f.id === id)?.prazo_recebimento ?? 'a_vista'
  const taxaDoItem = (p: PagamentoItem): number => {
    const val = parseFloat(p.valor) || 0
    const maq = maquinaById(p.maquina)
    if (!maq || !isCartaoForma(p.forma_id) || val <= 0) return 0
    const pct = isDebitoForma(p.forma_id)
      ? maq.taxa_debito
      : (maq.taxas_credito[p.parcelas - 1] ?? 0)   // taxas_credito 0-indexed: [0]=1x
    return Math.round(val * pct) / 100
  }

  const novoPagamento = (): PagamentoItem => ({
    uid: String(Date.now() + Math.random()),
    forma_id: formas[0]?.id ?? '',
    valor: '',
    maquina: maquinaDaForma(formas[0]?.id ?? ''),
    parcelas: 1,
  })

  const totalPagoDistribuido = pagamentos.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0) + creditoAplicado
  const totalTaxasPg = pagamentos.reduce((s, p) => s + taxaDoItem(p), 0)
  const totalCobrado = total + totalTaxasPg
  const faltamPg = Math.max(0, total - totalPagoDistribuido)
  const excessoPg = Math.max(0, totalPagoDistribuido - total)
  const temDinheiro = pagamentos.some((p) => isDinheiroForma(p.forma_id))
  const trocoPg = temDinheiro && excessoPg > 0.005 ? excessoPg : 0
  const temFiado = pagamentos.some((p) => isFiadoForma(p.forma_id))

  // Auto-preenche o valor do pagamento com o total do carrinho (Isa 15:44):
  // enquanto for 1 forma só e o operador não digitou nada, o valor segue o total.
  useEffect(() => {
    if (!valorAuto || pagamentos.length !== 1) return
    const alvo = total > 0.005 ? Math.max(0, total - creditoAplicado).toFixed(2) : ''
    setPagamentos((prev) => (prev.length === 1 && prev[0].valor !== alvo ? [{ ...prev[0], valor: alvo }] : prev))
  }, [total, creditoAplicado, valorAuto, pagamentos.length])

  const exigeSenhaDesconto = descontoNum > 0 && !!lojaSel?.exige_senha_desconto

  // Valida e abre o resumo de conferência antes de gravar
  const abrirConfirmacao = async () => {
    if (carrinho.length === 0) { setErro('Adicione produtos ao carrinho.'); return }
    if (!depositoId) { setErro('Selecione a loja/depósito.'); return }
    if (!pagamentos.some((p) => p.forma_id)) { setErro('Selecione a forma de pagamento.'); return }
    if (faltamPg > 0.01) { setErro(`Faltam ${formatBRL(faltamPg)} para cobrir o total da venda.`); return }
    if (temFiado && !pessoaId) { setErro('Crédito Loja (Fiado) exige cliente selecionado.'); return }
    if (pagamentos.some((p) => isCartaoForma(p.forma_id) && !p.maquina)) {
      setErro('Selecione a máquina (TON ou Pagbank) para o(s) pagamento(s) em cartão.'); return
    }
    const semSerie = carrinho.find((i) => i.serializado && (i.series?.length ?? 0) === 0)
    if (semSerie) { setErro(`Escolha o(s) IMEI(s) do aparelho "${semSerie.nome}".`); return }
    if (exigeSenhaDesconto) {
      if (!senhaDesconto) { setErro('Este desconto exige a senha do gerente.'); return }
      const ok = await validarSenhaDesconto(lojaId, senhaDesconto)
      if (!ok) { setErro('Senha de desconto incorreta.'); return }
    }
    setErro(null)
    setMostrarConfirmacao(true)
  }

  // Salvar o carrinho como orçamento (pré-venda) sem finalizar
  const handleSalvarOrcamento = async () => {
    if (carrinho.length === 0) { setErro('Adicione produtos ao carrinho.'); return }
    setSalvandoOrc(true); setErro(null); setMsgOrc('')
    try {
      const token = await authToken()
      if (!token) { setErro('Sessão não encontrada. Recarregue a página (F5).'); return }
      await salvarOrcamentoPDV(token, {
        itens: carrinho.map(({ produto_id, nome, quantidade, preco_unitario }) => ({ produto_id, nome, quantidade, preco_unitario })),
        pessoa_id: pessoaId || null,
        desconto: descontoNum,
        observacoes,
        deposito_id: depositoId,
        tabela_preco_id: tabelas.some((t) => t.id === tabelaId) ? tabelaId : null,
        forma_pagamento_id: pagamentos[0]?.forma_id || null,
      })
      setCarrinho([])
      setPagamentos([{ uid: '1', forma_id: formas[0]?.id ?? '', valor: '', maquina: formas[0]?.maquina_id ?? '', parcelas: 1 }])
      setValorAuto(true); setPessoaId(''); setDesconto(''); setSenhaDesconto(''); setObservacoes(''); setBuscaCliente(''); setDescontoTipo('valor'); setCreditoAplicado(0); setSaldoCredito(0)
      setMsgOrc('✅ Orçamento salvo! Carregue de volta no F3 (Orçamento/Pedido) pra finalizar.')
      setTimeout(() => setMsgOrc(''), 6000)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar orçamento.')
    } finally {
      setSalvandoOrc(false)
    }
  }

  const handleFinalizar = async () => {
    setErro(null)
    setLoading(true)
    try {
      const token = await authToken()
      if (!token) {
        setErro('Sessão não encontrada. Recarregue a página (F5) e entre novamente.')
        setLoading(false)
        return
      }
      const result = await finalizarVenda(
        token,
        carrinho.map(({ produto_id, nome, quantidade, preco_unitario }) => ({ produto_id, nome, quantidade, preco_unitario })),
        pagamentos.map((p): PagamentoInput => ({
          forma_pagamento_id: p.forma_id,
          valor: parseFloat(p.valor) || 0,
          taxa: taxaDoItem(p),
          maquina: maquinaById(p.maquina)?.nome ?? '',   // grava o nome legível
          parcelas: p.parcelas,
          status: isFiadoForma(p.forma_id) ? 'pendente' : 'pago',
        })),
        pessoaId || null,
        descontoNum + descontoPromo,
        observacoes,
        depositoId,
        carrinho.flatMap((i) => (i.series ?? []).map((serie) => ({ produto_id: i.produto_id, serie }))),
        creditoAplicado,   // débito do crédito é atômico dentro do RPC (migration 2026-07-10)
        descontoNum,       // desconto MANUAL (para checar permissão 'venda_desconto')
      )
      if ('erro' in result) { setErro(result.erro); return }

      const snap = {
        numero: result.vendaNumero ?? null,
        itens: carrinho.map(({ codigo, nome, quantidade, preco_unitario }) => ({ codigo, nome, quantidade, preco_unitario })),
        pagamentos: pagamentos.map((p) => ({
          forma_nome: formas.find((f) => f.id === p.forma_id)?.nome ?? p.forma_id,
          valor: parseFloat(p.valor) || 0,
          taxa: taxaDoItem(p),
          parcelas: p.parcelas,
          status: isFiadoForma(p.forma_id) ? 'pendente' : 'pago',
        })),
        cliente: clienteSelecionado?.nome ?? null,
        clienteTelefone: clienteSelecionado?.telefone ?? null,
        clienteEndereco: (() => {
          const p = clienteSelecionado
          if (!p) return null
          const partes = [p.endereco, p.bairro, p.cidade && p.estado ? `${p.cidade}/${p.estado}` : (p.cidade ?? p.estado), p.cep].filter(Boolean)
          return partes.length > 0 ? partes.join(', ') : null
        })(),
        vendedor: result.vendedorNome || null,
        deposito: nomeDeposito,
        loja: lojaSel?.nome ?? null,
        lojaRazao: lojaSel?.razao_social ?? null,
        lojaCnpj: lojaSel?.cnpj ?? null,
        lojaIE: lojaSel?.inscricao_estadual ?? null,
        lojaEndereco: [
          [lojaSel?.endereco, lojaSel?.numero].filter(Boolean).join(', '),
          lojaSel?.complemento,
          lojaSel?.bairro,
          lojaSel?.cidade && lojaSel?.uf ? `${lojaSel.cidade}/${lojaSel.uf}` : (lojaSel?.cidade ?? lojaSel?.uf),
          lojaSel?.cep ? `CEP: ${lojaSel.cep}` : null,
        ].filter(Boolean).join(' - ') || null,
        lojaTelefone: lojaSel?.whatsapp ?? lojaSel?.telefone ?? null,
        lojaLogo: lojaSel?.logo_url ?? null,
        lojaTermos: lojaSel?.termos_venda ?? null,
        desconto: descontoNum + descontoPromo,
        horario: new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      }
      abrirCupom(snap, result.vendaId)
      setVendaConcluidaId(result.vendaId)
      setVendaTotal(result.total)
      setVendaSnapshot(snap)
      setMostrarConfirmacao(false)
      setCarrinho([])
      setPagamentos([{ uid: '1', forma_id: formas[0]?.id ?? '', valor: '', maquina: formas[0]?.maquina_id ?? '', parcelas: 1 }])
      setValorAuto(true)
      setPessoaId('')
      setDesconto('')
      setSenhaDesconto('')
      setObservacoes('')
      setBuscaCliente('')
      setDescontoTipo('valor')
      setCreditoAplicado(0)
      setSaldoCredito(0)
      // Atualiza o saldo local do depósito vendido sem router.refresh() (que dispara check de sessão)
      if (result.estoqueAtualizado) {
        const vendidoEm = depositoId
        setProdutos(prev => prev.map(p => {
          const novoSaldo = result.estoqueAtualizado[p.id]
          return novoSaldo !== undefined
            ? { ...p, estoquePorDeposito: { ...p.estoquePorDeposito, [vendidoEm]: novoSaldo } }
            : p
        }))
      }
    } catch (e) {
      setErro('Erro ao finalizar venda: ' + String(e))
    } finally {
      setLoading(false)
    }
  }

  // F3 — Busca Orçamento/Pedido
  const abrirOrcamentos = async () => {
    setMostrarOrcamentos(true)
    setBuscaOrcamento('')
    setCarregandoOrcamentos(true)
    try {
      setOrcamentos(await buscarPedidosAbertos(await authToken()))
    } catch {
      setErro('Não consegui carregar os orçamentos/pedidos.')
      setMostrarOrcamentos(false)
    } finally {
      setCarregandoOrcamentos(false)
    }
  }

  const carregarOrcamento = (pedido: PedidoResumo) => {
    if (carrinho.length > 0 && !window.confirm('Substituir o carrinho atual pelos itens deste orçamento?')) return
    const novosItens: ItemCarrinho[] = []
    const avisos: string[] = []
    for (const item of pedido.itens) {
      const prod = produtos.find((p) => p.id === item.produto_id)
      const disp = prod?.estoquePorDeposito[depositoId] ?? 0
      if (disp <= 0) { avisos.push(item.nome); continue }
      novosItens.push({
        produto_id: item.produto_id,
        nome: item.nome,
        codigo: item.codigo,
        quantidade: Math.min(item.quantidade, disp),
        preco_unitario: item.preco_unitario,
        estoque_disponivel: disp,
        promoSel: '',
      })
    }
    setCarrinho(novosItens)
    setMostrarOrcamentos(false)
    if (avisos.length > 0) setErro(`Sem estoque: ${avisos.join(', ')}`)
  }

  const orcamentosFiltrados = buscaOrcamento.trim()
    ? orcamentos.filter((o) =>
        o.id.slice(0, 8).toLowerCase().includes(buscaOrcamento.toLowerCase()) ||
        (o.pessoa_nome ?? '').toLowerCase().includes(buscaOrcamento.toLowerCase())
      )
    : orcamentos

  // F9 — Crediário
  const abrirCrediario = async () => {
    setMostrarCrediario(true)
    setBuscaCrediario('')
    setSelecionados(new Set())
    setCarregandoCrediario(true)
    try {
      setCrediarioItens(await buscarCrediario(await authToken()))
    } catch {
      setErro('Não consegui carregar o crediário.')
      setMostrarCrediario(false)
    } finally {
      setCarregandoCrediario(false)
    }
  }

  const handlePagarCrediario = async (ids: string[], forma: string) => {
    if (ids.length === 0) return
    setPagandoCrediario(true)
    setPagoCrediarioOk(false)
    try {
      await pagarLancamentos(await authToken(), ids, forma)
      setCrediarioItens((prev) => prev.filter((i) => !ids.includes(i.id)))
      setSelecionados(new Set())
      setRecebendoItem(null)
      setPagoCrediarioOk(true)
      setTimeout(() => setPagoCrediarioOk(false), 3000)
    } catch {
      setErro('Erro ao registrar pagamento do fiado.')
    } finally {
      setPagandoCrediario(false)
    }
  }

  const handleAbrirRecebimento = (item: CrediarioItem) => {
    setRecebendoItem(item)
    setFormaRecebimento('dinheiro')
    const restante = item.valor - (item.valor_pago ?? 0)
    setValorRecebido(restante.toFixed(2).replace('.', ','))
  }

  const handleConfirmarRecebimento = async () => {
    if (!recebendoItem) return
    setPagandoCrediario(true)
    try {
      const restante = recebendoItem.valor - (recebendoItem.valor_pago ?? 0)
      let valorNum = parseFloat(valorRecebido.replace(',', '.'))
      if (isNaN(valorNum) || valorNum <= 0) { setErro('Valor inválido.'); return }
      if (valorNum > restante) valorNum = restante
      const { quitado } = await registrarPagamentoParcial(await authToken(), recebendoItem.id, valorNum, formaRecebimento)
      if (quitado) {
        setCrediarioItens((prev) => prev.filter((i) => i.id !== recebendoItem.id))
      } else {
        setCrediarioItens((prev) => prev.map((i) =>
          i.id === recebendoItem.id ? { ...i, valor_pago: (i.valor_pago ?? 0) + valorNum } : i
        ))
      }
      setRecebendoItem(null)
      setPagoCrediarioOk(true)
      setTimeout(() => setPagoCrediarioOk(false), 3000)
    } catch {
      setErro('Erro ao registrar pagamento.')
    } finally {
      setPagandoCrediario(false)
    }
  }

  const handleVerVenda = async (vendaId: string) => {
    setCarregandoDetalhe(true)
    setDetalheVenda(null)
    try {
      const d = await buscarDetalheVenda(await authToken(), vendaId)
      setDetalheVenda(d)
    } catch {
      setErro('Não foi possível carregar os detalhes da venda.')
    } finally {
      setCarregandoDetalhe(false)
    }
  }

  const hoje = new Date().toISOString().split('T')[0]
  const codCrediario = (item: CrediarioItem) => {
    if (item.codigo) return `#${item.codigo}`
    if (item.venda_id) return `#${item.venda_id.slice(-6).toUpperCase()}`
    const m = item.descricao?.match(/#([a-f0-9]{8})/i)
    return m ? `#${m[1].toUpperCase()}` : '—'
  }
  const statusCrediario = (dataVenc: string | null) => {
    if (!dataVenc) return { label: 'Pendente', cor: 'text-gray-500' }
    return dataVenc < hoje
      ? { label: 'Vencido', cor: 'text-red-600' }
      : { label: 'A vencer', cor: 'text-green-600' }
  }

  const crediarioFiltrado = buscaCrediario.trim()
    ? crediarioItens.filter((i) =>
        (i.pessoa_nome ?? '').toLowerCase().includes(buscaCrediario.toLowerCase()) ||
        codCrediario(i).toLowerCase().includes(buscaCrediario.toLowerCase())
      )
    : crediarioItens

  const restante = (i: CrediarioItem) => i.valor - (i.valor_pago ?? 0)
  const totalDividas = crediarioItens.reduce((s, i) => s + restante(i), 0)
  const totalPagoCrediario = crediarioItens.reduce((s, i) => s + (i.valor_pago ?? 0), 0)
  const totalAtraso = crediarioItens.filter((i) => i.data_vencimento && i.data_vencimento < hoje).reduce((s, i) => s + restante(i), 0)
  const totalAVencer = crediarioItens.filter((i) => !i.data_vencimento || i.data_vencimento >= hoje).reduce((s, i) => s + restante(i), 0)
  const subtotalSelecionado = crediarioItens.filter((i) => selecionados.has(i.id)).reduce((s, i) => s + restante(i), 0)
  const todosVisivelSelecionados = crediarioFiltrado.length > 0 && crediarioFiltrado.every((i) => selecionados.has(i.id))

  // #9 — abrir o modal e carregar as últimas vendas
  const abrirVendas = async () => {
    setMostrarVendas(true)
    setCarregandoVendas(true)
    try {
      setVendas(await buscarVendas(await authToken(), 30))
    } catch {
      setErro('Não consegui carregar as vendas.')
      setMostrarVendas(false)
    } finally {
      setCarregandoVendas(false)
    }
  }

  const nomeCliente = (id: string | null) => pessoas.find((p) => p.id === id)?.nome ?? 'Cliente Final'
  const nomeFormaPg = (id: string | null) => formas.find((f) => f.id === id)?.nome ?? '—'

  const vendasFiltradas = buscaVenda.trim()
    ? vendas.filter((v) =>
        v.id.slice(0, 8).toLowerCase().includes(buscaVenda.toLowerCase()) ||
        nomeCliente(v.pessoa_id).toLowerCase().includes(buscaVenda.toLowerCase())
      )
    : vendas

  // Mantém as ações dos atalhos sempre atualizadas (sem closure stale)
  acaoF3Ref.current = () => {
    if (!mostrarConfirmacao && !mostrarVendas && !mostrarCrediario && !fichaAberta && !mostrarOrcamentos) abrirOrcamentos()
  }
  acaoF4Ref.current = () => {
    if (mostrarConfirmacao || mostrarVendas || mostrarCrediario || fichaAberta || mostrarOrcamentos) return
    if (carrinho.length === 0) return
    const ultimo = carrinho[carrinho.length - 1]
    const input = qtdRefs.current.get(ultimo.produto_id)
    if (input) { input.focus(); input.select() }
  }
  acaoF1Ref.current = () => {
    if (mostrarConfirmacao || mostrarVendas || mostrarCrediario || fichaAberta || mostrarOrcamentos) return
    setFichaAberta(true)
    // Se já há busca ativa no PDV, pré-seleciona o 1º resultado na ficha
    if (produtosFiltrados.length > 0) {
      setFichaSel(produtosFiltrados[0])
      setBuscaFicha(busca)
    }
    setTimeout(() => buscaFichaRef.current?.focus(), 50)
  }
  acaoF8Ref.current = () => {
    if (fichaAberta || mostrarOrcamentos) return
    if (mostrarConfirmacao) { if (!loading) handleFinalizar() }
    else if (!mostrarVendas && !mostrarCrediario) abrirConfirmacao()
  }
  acaoF9Ref.current = () => {
    if (!mostrarConfirmacao && !mostrarVendas && !mostrarCrediario && !fichaAberta && !mostrarOrcamentos) abrirCrediario()
  }
  acaoEscRef.current = () => {
    if (fichaAberta) { fecharFicha(); return }
    if (mostrarOrcamentos) { setMostrarOrcamentos(false); return }
    if (mostrarConfirmacao) setMostrarConfirmacao(false)
    else if (mostrarVendas) setMostrarVendas(false)
    else if (mostrarCrediario) setMostrarCrediario(false)
  }

  function abrirCupom(snap: NonNullable<typeof vendaSnapshot>, vendaId: string) {
    const idCurto = vendaId.replace(/-/g, '').slice(0, 8).toUpperCase()
    const win = window.open('', '_blank', 'width=420,height=700')
    if (!win) return

    const brl = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',')
    const totalItens = snap.itens.reduce((s, i) => s + i.quantidade, 0)
    const subtotal   = snap.itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
    const totalTaxas = snap.pagamentos.reduce((s, p) => s + p.taxa, 0)
    const valorTotal = subtotal - snap.desconto + totalTaxas
    const numeroLabel = snap.numero != null ? String(snap.numero) : idCurto

    const rowItem = (i: typeof snap.itens[0]) => {
      const desc = i.codigo ? `${i.codigo} - ${i.nome}` : i.nome
      return `<tr>
        <td style="word-break:break-word;max-width:130px">${desc}</td>
        <td style="text-align:right;white-space:nowrap">${brl(i.preco_unitario)}</td>
        <td style="text-align:center">UN</td>
        <td style="text-align:center">${i.quantidade}</td>
        <td style="text-align:right;white-space:nowrap">${brl(i.quantidade * i.preco_unitario)}</td>
      </tr>`
    }

    const rowPag = (p: typeof snap.pagamentos[0]) => {
      const label = `${p.forma_nome}${p.parcelas > 1 ? ` ${p.parcelas}x` : ''}${p.status === 'pendente' ? ' (FIADO)' : ''}`
      const total = p.valor + p.taxa
      return `<tr>
        <td>${label}</td>
        <td></td>
        <td style="text-align:right;white-space:nowrap">${brl(total)}</td>
      </tr>`
    }

    const logoUrl = window.location.origin + '/logo-transparent.png'
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Comprovante #${numeroLabel}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: monospace; font-size: 11px; margin: 0; padding: 12px; max-width: 320px; }
      .bold { font-weight: bold; }
      .sep { border: none; border-top: 1px dashed #000; margin: 6px 0; }
      .row { display: flex; justify-content: space-between; margin: 2px 0; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      th { border-bottom: 1px dashed #000; padding: 2px 0; text-align: left; }
      td { padding: 2px 0; vertical-align: top; }
      p { margin: 1px 0; text-align: center; }
      @media print { body { padding: 0; } }
    </style></head><body>

    <div style="text-align:center;margin-bottom:4px">
      <img src="${snap.lojaLogo || logoUrl}" style="max-width:160px;max-height:60px;object-fit:contain" />
    </div>
    <p class="bold">${snap.lojaRazao || snap.loja || 'TecnoCell'}</p>
    ${snap.lojaCnpj || snap.lojaIE ? `<p>${snap.lojaCnpj ? `CNPJ: ${snap.lojaCnpj}` : ''}${snap.lojaCnpj && snap.lojaIE ? ' &nbsp; ' : ''}${snap.lojaIE ? `IE: ${snap.lojaIE}` : ''}</p>` : ''}
    ${snap.lojaEndereco ? `<p>${snap.lojaEndereco}</p>` : ''}
    ${snap.lojaTelefone ? `<p>Tel: ${snap.lojaTelefone}</p>` : ''}

    <hr class="sep">
    <p class="bold" style="font-size:13px">COMPROVANTE DE VENDA</p>
    <p>&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt; SEM VALOR FISCAL &lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</p>

    <hr class="sep">
    <p class="bold">Itens da Venda</p>
    <hr class="sep">
    <table>
      <thead>
        <tr>
          <th>Descrição</th>
          <th style="text-align:right">Vlr. Unit.</th>
          <th style="text-align:center">Un.</th>
          <th style="text-align:center">Qtd.</th>
          <th style="text-align:right">Vlr. Total</th>
        </tr>
      </thead>
      <tbody>${snap.itens.map(rowItem).join('')}</tbody>
    </table>

    <hr class="sep">
    <div class="row"><span>QTD. TOTAL DE ITENS</span><span>${totalItens}</span></div>
    ${snap.desconto > 0 ? `<div class="row"><span>DESCONTO</span><span>-${brl(snap.desconto)}</span></div>` : ''}
    <div class="row bold"><span>VALOR TOTAL</span><span>${brl(valorTotal)}</span></div>
    <div class="row"><span>VALOR A PAGAR</span><span>${brl(valorTotal)}</span></div>

    <hr class="sep">
    <table>
      <thead>
        <tr>
          <th>FORMA DE PAGAMENTO</th>
          <th></th>
          <th style="text-align:right">Valor Pago (R$)</th>
        </tr>
      </thead>
      <tbody>${snap.pagamentos.map(rowPag).join('')}</tbody>
    </table>

    <hr class="sep">
    <p class="bold" style="font-size:13px">VENDA NÚMERO ${numeroLabel}</p>
    <p>EMISSÃO EM ${snap.horario}</p>
    ${snap.loja ? `<p class="bold">${snap.loja}</p>` : ''}
    <p>${snap.deposito}</p>
    ${snap.vendedor ? `<p>Vendedor(a): ${snap.vendedor}</p>` : ''}
    <p class="bold">CONSUMIDOR</p>
    ${snap.cliente ? `<p>${snap.cliente}</p>` : '<p>CONSUMIDOR FINAL</p>'}
    ${snap.clienteEndereco ? `<p>${snap.clienteEndereco}</p>` : ''}

    <hr class="sep">
    ${snap.lojaTermos ? `<p style="font-size:9px;text-align:center;white-space:pre-wrap">${snap.lojaTermos.replace(/</g, '&lt;')}</p><hr class="sep">` : ''}
    <p>Obrigado pela preferência!</p>
    <p style="margin-top:4px">www.tecnocell.com.br</p>

    </body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 400)
  }

  function imprimirCupom() {
    if (!vendaSnapshot || !vendaConcluidaId) return
    abrirCupom(vendaSnapshot, vendaConcluidaId)
  }

  function textoWhatsApp() {
    if (!vendaSnapshot || !vendaConcluidaId) return ''
    const snap = vendaSnapshot
    const id = vendaConcluidaId.slice(0, 8).toUpperCase()
    const numero = snap.numero != null ? String(snap.numero) : id
    const linhas = [
      `*TecnoCell — ${snap.loja ?? snap.deposito}*`,
      `Venda #${numero} | ${snap.horario}`,
      snap.vendedor ? `Vendedor(a): ${snap.vendedor}` : '',
      snap.cliente ? `Cliente: ${snap.cliente}` : '',
      snap.clienteEndereco ? snap.clienteEndereco : '',
      '',
      '*Itens:*',
      ...snap.itens.map((i) => `• ${i.codigo ? i.codigo + ' - ' : ''}${i.nome} ${i.quantidade}x = R$ ${(i.quantidade * i.preco_unitario).toFixed(2).replace('.', ',')}`),
      '',
      snap.desconto > 0 ? `Desconto: -R$ ${snap.desconto.toFixed(2).replace('.', ',')}` : '',
      `*Total: R$ ${vendaTotal.toFixed(2).replace('.', ',')}*`,
      '',
      '*Forma de pagamento:*',
      ...snap.pagamentos.map((p) => `• ${p.forma_nome}${p.parcelas > 1 ? ` ${p.parcelas}x` : ''}${p.status === 'pendente' ? ' (FIADO)' : ''}: R$ ${(p.valor + p.taxa).toFixed(2).replace('.', ',')}`),
      '',
      '_Obrigado pela preferência!_',
    ].filter(Boolean).join('\n')
    return linhas
  }

  function CopiarWhatsAppBtn({ texto }: { texto: string }) {
    const [copiado, setCopiado] = useState(false)
    return (
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(texto)
          setCopiado(true)
          setTimeout(() => setCopiado(false), 2500)
        }}
        className="flex-1 rounded-xl border border-green-300 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700 hover:bg-green-100 transition"
      >
        {copiado ? '✅ Copiado!' : '💬 Copiar p/ WhatsApp'}
      </button>
    )
  }

  if (vendaConcluidaId) {
    const snap = vendaSnapshot
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Cabeçalho */}
          <div className="bg-green-50 border-b border-green-100 px-6 py-5 text-center">
            <div className="text-4xl mb-2">✓</div>
            <h3 className="text-xl font-bold text-gray-900">Venda Concluída!</h3>
            <p className="text-sm text-gray-500 mt-1">
              Venda #{snap?.numero != null ? snap.numero : vendaConcluidaId.slice(0, 8).toUpperCase()}
            </p>
          </div>
          {/* Corpo do cupom */}
          {snap && (
            <div className="px-6 py-4 font-mono text-sm space-y-1">
              <div className="flex justify-between text-xs text-gray-400 mb-2">
                <span>{snap.loja ?? snap.deposito}{snap.lojaCnpj ? ` · CNPJ ${snap.lojaCnpj}` : ''}</span>
                <span>{snap.horario}</span>
              </div>
              {snap.vendedor && (
                <p className="text-xs text-gray-600">Vendedor(a): <strong>{snap.vendedor}</strong></p>
              )}
              {snap.cliente && (
                <p className="text-xs text-gray-600 mb-2">Cliente: <strong>{snap.cliente}</strong></p>
              )}
              <div className="border-t border-dashed border-gray-300 pt-2 space-y-1">
                {snap.itens.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-xs">
                    <span className="truncate max-w-[180px]">{item.quantidade}x {item.nome}</span>
                    <span className="ml-2 shrink-0">{formatBRL(item.quantidade * item.preco_unitario)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-dashed border-gray-300 pt-2 space-y-1">
                {snap.desconto > 0 && (
                  <div className="flex justify-between text-xs text-red-500">
                    <span>Desconto</span>
                    <span>-{formatBRL(snap.desconto)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base">
                  <span>TOTAL</span>
                  <span className="text-green-600">{formatBRL(vendaTotal)}</span>
                </div>
              </div>
              <div className="border-t border-dashed border-gray-300 pt-2 space-y-1">
                {snap.pagamentos.map((p, idx) => (
                  <div key={idx}>
                    <div className="flex justify-between text-xs">
                      <span>{p.forma_nome}{p.parcelas > 1 ? ` ${p.parcelas}x` : ''}{p.status === 'pendente' ? ' (FIADO)' : ''}</span>
                      <span>{formatBRL(p.valor + p.taxa)}</span>
                    </div>
                    {p.taxa > 0 && (
                      <div className="flex justify-between text-[10px] text-gray-400 pl-2">
                        <span>taxa</span><span>{formatBRL(p.taxa)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Ações */}
          <div className="px-6 pb-6 flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                onClick={imprimirCupom}
                className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                🖨️ Imprimir
              </button>
              <CopiarWhatsAppBtn texto={textoWhatsApp()} />
            </div>
            <button
              onClick={() => { setVendaConcluidaId(null); setVendaSnapshot(null) }}
              className="w-full rounded-xl bg-blue-600 px-8 py-3 font-semibold text-white hover:bg-blue-700 transition"
            >
              Nova Venda
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* Coluna esquerda — busca + carrinho */}
      <div className="space-y-4">
        {/* Barra de ações */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={abrirVendas}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition shadow-sm"
          >
            🔍 Buscar Vendas
          </button>
        </div>

        {/* Seletores de loja, depósito e tabela de preço */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide shrink-0">Loja</label>
            <select
              value={lojaId}
              onChange={(e) => trocarLoja(e.target.value)}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {lojas.length === 0 && <option value="">Nenhuma loja</option>}
              {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide shrink-0">Estoque</label>
            <select
              value={depositoId}
              onChange={(e) => trocarDeposito(e.target.value)}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {depositosDaLoja.length === 0 && <option value="">Sem depósito nesta loja</option>}
              {depositosDaLoja.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide shrink-0">Tabela</label>
            <select
              value={tabelaId}
              onChange={(e) => trocarTabela(e.target.value)}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Preço Padrão</option>
              {tabelas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>
        </div>

        {/* Cliente — compacto, no topo */}
        <div className="relative rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
          {clienteSelecionado ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 shrink-0">Cliente</span>
                <span className="font-medium text-gray-800">👤 {clienteSelecionado.nome}</span>
                {clienteSelecionado.cpf_cnpj && <span className="text-xs text-gray-400">{clienteSelecionado.cpf_cnpj}</span>}
                <button type="button" onClick={() => { setPessoaId(''); setBuscaCliente(''); setCreditoAplicado(0) }}
                  className="ml-auto text-xs font-medium text-red-400 hover:text-red-600">✕</button>
              </div>
              {saldoCredito > 0.01 && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-2.5 py-1.5">
                  <span className="text-xs text-green-700 font-medium">🏦 Saldo em conta: {formatBRL(saldoCredito)}</span>
                  {creditoAplicado === 0 ? (
                    <button type="button"
                      onClick={() => setCreditoAplicado(Math.min(saldoCredito, total > 0 ? total : saldoCredito))}
                      className="ml-auto rounded-md bg-green-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-green-700 transition">
                      Usar →
                    </button>
                  ) : (
                    <span className="ml-auto text-xs font-bold text-green-700">-{formatBRL(creditoAplicado)} aplicado</span>
                  )}
                  {creditoAplicado > 0 && (
                    <button type="button" onClick={() => setCreditoAplicado(0)}
                      className="text-xs text-red-400 hover:text-red-600">✕</button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 shrink-0">Cliente</span>
              <span className="text-sm text-gray-500 shrink-0">Cliente Final ·</span>
              <input
                value={buscaCliente}
                onChange={(e) => setBuscaCliente(e.target.value)}
                placeholder="buscar por nome ou CPF..."
                className="flex-1 min-w-0 border-none bg-transparent text-sm focus:outline-none placeholder:text-gray-400"
              />
            </div>
          )}
          {clientesFiltrados.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
              {clientesFiltrados.map((p) => (
                <button key={p.id} type="button"
                  onClick={() => {
                    setPessoaId(p.id); setBuscaCliente('')
                    // aplica a tabela de preço padrão do cliente, se tiver
                    if (p.tabela_preco_id && tabelas.some((t) => t.id === p.tabela_preco_id)) trocarTabela(p.tabela_preco_id)
                  }}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-sm hover:bg-blue-50 transition text-left">
                  <span className="font-medium text-gray-800">{p.nome}</span>
                  {p.cpf_cnpj && <span className="text-xs text-gray-400">{p.cpf_cnpj}</span>}
                </button>
              ))}
            </div>
          )}
          {buscaCliente.trim().length >= 1 && clientesFiltrados.length === 0 && (
            <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs text-gray-400 shadow-lg">
              {buscandoClientes ? 'Buscando…' : 'Nenhum cliente encontrado.'}
            </div>
          )}
        </div>

        <div className="relative">
          <input
            ref={buscaRef}
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setErro(null) }}
            placeholder="Buscar produto por nome ou código...  (F2)"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          {produtosFiltrados.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
              {produtosFiltrados.map((p) => {
                const disp = saldoNoDeposito(p)
                return (
                <div key={p.id} className="flex items-center border-b border-gray-50 last:border-b-0">
                  <label
                    className="flex shrink-0 cursor-pointer items-center pl-3 pr-1"
                    title="Marcar pra copiar o preço"
                  >
                    <input
                      type="checkbox"
                      checked={selCopia.has(p.id)}
                      onChange={() => marcarCopia(p.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => adicionarAoCarrinho(p)}
                    className="flex flex-1 items-center justify-between px-3 py-3 text-sm hover:bg-blue-50 transition text-left min-w-0"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 truncate">
                        {p.codigo && <span className="mr-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-500 tabular-nums align-middle">{p.codigo}</span>}
                        {p.nome}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {p.marca && <span>{p.marca} · </span>}
                        {/* estoque em TODAS as lojas — o depósito atual fica sublinhado */}
                        {depositosReais.map((d, i) => {
                          const q = p.estoquePorDeposito[d.id] ?? 0
                          return (
                            <span key={d.id}>
                              {i > 0 && ' · '}
                              <span className={`${d.id === depositoId ? 'underline decoration-dotted underline-offset-2 ' : ''}${q > 0 ? 'text-green-600 font-medium' : 'text-gray-300'}`}>
                                {d.nome} {q}
                              </span>
                            </span>
                          )
                        })}
                        {p.prateleira && <span className="text-blue-600 font-medium"> · 📦 {p.prateleira}</span>}
                      </p>
                    </div>
                    <span className={`font-semibold ml-4 shrink-0 ${disp <= 0 ? 'text-gray-300' : 'text-green-600'}`}>
                      {formatBRL(precoDoProduto(p))}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFichaAberta(true); setFichaSel(p); setBuscaFicha(p.nome) }}
                    title="Ver ficha do produto (F1)"
                    className="shrink-0 px-3 py-3 text-gray-300 hover:text-blue-500 transition text-base leading-none"
                  >
                    ℹ
                  </button>
                </div>
                )
              })}
              <button
                type="button"
                onClick={copiarPrecos}
                className="flex w-full items-center justify-center gap-2 border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 transition"
              >
                {copiado ? '✓ Copiado!' : selCopia.size > 0 ? `📋 Copiar ${selCopia.size} marcada${selCopia.size > 1 ? 's' : ''}` : '📋 Copiar todas (ou marque algumas acima)'}
              </button>
            </div>
          )}
          {busca.trim().length >= 1 && produtosFiltrados.length === 0 && (
            <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-400 shadow-lg">
              {buscandoProdutos ? 'Buscando…' : 'Nenhum produto encontrado.'}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          {carrinho.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-gray-400">
              Nenhum item no carrinho.<br />Busque um produto acima.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Produto</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Qtd</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Unit.</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {carrinho.map((item) => (
                  <tr key={item.produto_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-800">
                        {item.codigo && <span className="text-gray-400 font-normal">{item.codigo} · </span>}{item.nome}
                      </p>
                      <p className="text-xs text-gray-400">
                        Disponível: {item.estoque_disponivel}
                        {item.prateleira && <span className="text-blue-600 font-medium"> · 📦 {item.prateleira}</span>}
                      </p>
                      {(promosPorProduto[item.produto_id]?.length ?? 0) > 0 && (() => {
                        const promoAtual = promoEfetiva(item)
                        return (
                          <select
                            value={item.promoSel}
                            onChange={(e) => trocarPromo(item.produto_id, e.target.value)}
                            className={`mt-1.5 rounded-md border px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400 ${
                              promoAtual ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-gray-200 bg-white text-gray-500'
                            }`}
                          >
                            <option value="auto">🏷️ Melhor desconto</option>
                            {promosPorProduto[item.produto_id].map((p) => (
                              <option key={p.id} value={p.id}>{labelPromo(p)}</option>
                            ))}
                            <option value="">Sem promoção</option>
                          </select>
                        )
                      })()}
                      {item.serializado && (() => {
                        const disp = seriesDisponiveis(item.produto_id)
                        const sel = item.series ?? []
                        return (
                          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2 space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="Bipe o IMEI + Enter"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') { e.preventDefault(); const el = e.target as HTMLInputElement; biparSerie(item.produto_id, el.value); el.value = '' }
                                }}
                                className="flex-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                              />
                              <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[11px] font-semibold text-white whitespace-nowrap">{sel.length} escolhido{sel.length === 1 ? '' : 's'}</span>
                            </div>
                            {disp.length === 0 ? (
                              <p className="text-[11px] text-amber-700">Nenhum IMEI em estoque neste depósito.</p>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {disp.map((s) => {
                                  const on = sel.includes(s)
                                  return (
                                    <button key={s} type="button" onClick={() => toggleSerie(item.produto_id, s)}
                                      className={`rounded-full border px-2 py-0.5 text-[11px] font-mono transition ${on ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100'}`}>
                                      {on ? '✓ ' : ''}{s}
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      {item.serializado ? (
                        <div className="text-center text-sm font-semibold text-gray-900">{item.quantidade}</div>
                      ) : (
                      <div className="flex items-center justify-center gap-1.5">
                        <button type="button" onClick={() => alterarQtd(item.produto_id, -1)}
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs font-bold">−</button>
                        <input
                          ref={(el) => { if (el) qtdRefs.current.set(item.produto_id, el); else qtdRefs.current.delete(item.produto_id) }}
                          type="number"
                          min="1"
                          max={item.estoque_disponivel}
                          value={item.quantidade}
                          onChange={(e) => definirQtd(item.produto_id, e.target.value)}
                          className="w-12 rounded-lg border border-gray-200 px-1 py-0.5 text-center text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button type="button" onClick={() => alterarQtd(item.produto_id, 1)}
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs font-bold">+</button>
                      </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600">{formatBRL(item.preco_unitario)}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                      {formatBRL(item.quantidade * item.preco_unitario)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-3">
                        <button type="button" onClick={() => copiarProduto(item)}
                          title="Copiar produto para o WhatsApp"
                          className={`transition text-sm ${copiadoId === item.produto_id ? 'text-green-600' : 'text-gray-400 hover:text-blue-600'}`}>
                          {copiadoId === item.produto_id ? '✓' : '📋'}
                        </button>
                        <button type="button" onClick={() => remover(item.produto_id)}
                          className="text-red-400 hover:text-red-600 transition text-xs">✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Coluna direita — totais + pagamento */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-800">Resumo da Venda</h3>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Qtd. total de itens</span>
              <span className="font-semibold">{totalItens}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{formatBRL(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-gray-600">
              <div className="flex items-center gap-2">
                <span>Desconto</span>
                <div className="flex overflow-hidden rounded-md border border-gray-200 text-xs">
                  <button type="button" onClick={() => setDescontoTipo('valor')}
                    className={`px-2 py-0.5 transition ${descontoTipo === 'valor' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>R$</button>
                  <button type="button" onClick={() => setDescontoTipo('percent')}
                    className={`px-2 py-0.5 transition ${descontoTipo === 'percent' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>%</button>
                </div>
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
                placeholder={descontoTipo === 'percent' ? '0%' : '0,00'}
                className="w-24 rounded-lg border border-gray-200 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {descontoTipo === 'percent' && descontoNum > 0 && (
              <div className="flex justify-between text-xs text-gray-400">
                <span>Desconto aplicado</span>
                <span>− {formatBRL(descontoNum)}</span>
              </div>
            )}
            {descontoNum > 0 && descontoNum >= subtotal * 0.5 && (
              <p className="text-xs text-yellow-600">Desconto acima de 50% — confirme antes de finalizar.</p>
            )}
            {exigeSenhaDesconto && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5">
                <span className="text-xs font-medium text-amber-700">🔒 Senha do gerente</span>
                <input
                  type="password"
                  value={senhaDesconto}
                  onChange={(e) => setSenhaDesconto(e.target.value)}
                  placeholder="senha"
                  autoComplete="off"
                  className="w-28 rounded-lg border border-amber-300 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            )}
            {descontoPromoDetalhes.map((d, i) => (
              <div key={i} className="flex justify-between text-xs text-orange-600">
                <span>🏷️ {d.label}</span>
                <span>− {formatBRL(d.valor)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-gray-100 pt-2 text-lg font-bold text-gray-900">
              <span>Total</span>
              <span className="text-green-600">{formatBRL(totalCobrado)}</span>
            </div>
          </div>

          <div className="space-y-3 border-t border-gray-100 pt-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">
                Pagamentos <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                {pagamentos.map((p) => (
                  <div key={p.uid} className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={p.forma_id}
                        onChange={(e) => setPagamentos((prev) => {
                          // ao escolher a forma, já preenche o valor com o que falta (se estiver vazio)
                          const outros = prev.filter((x) => x.uid !== p.uid).reduce((s, x) => s + (parseFloat(x.valor) || 0), 0)
                          const restante = total - outros
                          return prev.map((x) =>
                            x.uid === p.uid
                              ? {
                                  ...x,
                                  forma_id: e.target.value,
                                  maquina: maquinaDaForma(e.target.value),
                                  parcelas: 1,
                                  valor: (!x.valor || parseFloat(x.valor) === 0) && restante > 0 ? restante.toFixed(2) : x.valor,
                                }
                              : x
                          )
                        })}
                        className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {formas.map((f) => <option key={f.id} value={f.id}>{iconeForma(f.nome)} {f.nome}</option>)}
                      </select>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={p.valor}
                          onChange={(e) => { setValorAuto(false); setPagamentos((prev) => prev.map((x) =>
                            x.uid === p.uid ? { ...x, valor: e.target.value } : x
                          )) }}
                          onFocus={() => {
                            if (!p.valor) {
                              const outros = pagamentos.filter((x) => x.uid !== p.uid).reduce((s, x) => s + (parseFloat(x.valor) || 0), 0)
                              const restante = total - outros
                              if (restante > 0) setPagamentos((prev) => prev.map((x) =>
                                x.uid === p.uid ? { ...x, valor: restante.toFixed(2) } : x
                              ))
                            }
                          }}
                          placeholder="0,00"
                          className="w-28 rounded-lg border border-gray-200 bg-white pl-7 pr-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      {pagamentos.length > 1 && (
                        <button type="button"
                          onClick={() => setPagamentos((prev) => prev.filter((x) => x.uid !== p.uid))}
                          className="shrink-0 text-xs text-red-400 hover:text-red-600 transition">✕</button>
                      )}
                    </div>

                    {prazoDaForma(p.forma_id) !== 'a_vista' && (
                      <p className="text-[11px] text-gray-400">Recebimento: {labelPrazo(prazoDaForma(p.forma_id))}</p>
                    )}

                    {isCartaoForma(p.forma_id) && (
                      <div className="space-y-2">
                        {/* máquina só é escolhida aqui quando a forma NÃO tem uma fixada */}
                        {!maquinaDaForma(p.forma_id) && (
                          <div className="flex gap-2 flex-wrap">
                            {maquinas.length === 0 && (
                              <span className="text-xs text-gray-400">Nenhuma máquina cadastrada (Cadastros → Máquinas de Cartão)</span>
                            )}
                            {maquinas.map((m) => (
                              <button key={m.id} type="button"
                                onClick={() => setPagamentos((prev) => prev.map((x) =>
                                  x.uid === p.uid ? { ...x, maquina: m.id, parcelas: 1 } : x
                                ))}
                                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                                  p.maquina === m.id ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                }`}>
                                {m.nome}
                              </button>
                            ))}
                          </div>
                        )}
                        {isCreditoForma(p.forma_id) && p.maquina && (
                          <div className="grid grid-cols-5 gap-1">
                            {Array.from({ length: maquinaById(p.maquina)?.max_parcelas ?? 1 }, (_, i) => i + 1).map((n) => (
                              <button key={n} type="button"
                                onClick={() => setPagamentos((prev) => prev.map((x) =>
                                  x.uid === p.uid ? { ...x, parcelas: n } : x
                                ))}
                                className={`rounded-lg py-1 text-xs font-semibold transition ${
                                  p.parcelas === n ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                }`}>
                                {n}x
                              </button>
                            ))}
                          </div>
                        )}
                        {p.maquina && (
                          <div className="flex justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                            <span>{isCreditoForma(p.forma_id) ? `${p.parcelas}x` : 'Débito'} · {maquinaById(p.maquina)?.nome ?? ''}</span>
                            <span className="font-semibold">+ {formatBRL(taxaDoItem(p))}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                <button type="button"
                  onClick={() => setPagamentos((prev) => [...prev, novoPagamento()])}
                  className="w-full rounded-xl border border-dashed border-gray-300 py-2 text-xs font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 transition">
                  + Adicionar outra forma
                </button>
              </div>
            </div>

            {/* Resumo multi-pagamento */}
            {totalPagoDistribuido > 0 && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 space-y-1 text-xs">
                {totalTaxasPg > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>Taxa(s) cartão</span>
                    <span>+ {formatBRL(totalTaxasPg)}</span>
                  </div>
                )}
                {faltamPg > 0.01 && (
                  <div className="flex justify-between font-semibold text-red-600">
                    <span>Faltam</span>
                    <span>{formatBRL(faltamPg)}</span>
                  </div>
                )}
                {trocoPg > 0.005 && (
                  <div className="flex justify-between font-semibold text-green-700">
                    <span>Troco (dinheiro)</span>
                    <span>{formatBRL(trocoPg)}</span>
                  </div>
                )}
                {temFiado && !pessoaId && (
                  <p className="font-medium text-orange-600">⚠ Fiado exige cliente selecionado</p>
                )}
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Observações</label>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Opcional..."
              />
            </div>
          </div>

          <button
            type="button"
            onClick={abrirConfirmacao}
            disabled={carrinho.length === 0 || loading}
            className="w-full rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50 transition"
          >
            Finalizar Venda — {formatBRL(totalCobrado)}
          </button>

          {carrinho.length > 0 && (
            <button
              type="button"
              onClick={handleSalvarOrcamento}
              disabled={salvandoOrc}
              className="w-full rounded-xl border-2 border-blue-200 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50 transition"
            >
              {salvandoOrc ? 'Salvando...' : '📋 Salvar como orçamento (finalizar depois)'}
            </button>
          )}

          {msgOrc && (
            <p className="rounded-xl bg-green-50 border border-green-200 px-3 py-2 text-center text-xs font-medium text-green-700">{msgOrc}</p>
          )}

          {carrinho.length > 0 && (
            <button
              type="button"
              onClick={() => { setCarrinho([]); setErro(null) }}
              className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50 transition"
            >
              Limpar Carrinho
            </button>
          )}
        </div>
      </div>

      {/* Mapeamento de atalhos — rodapé do PDV */}
      <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs text-gray-500">
          <span className="font-semibold uppercase tracking-wide text-gray-400">⌨ Atalhos</span>
          <span><kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">F1</kbd> Ficha do produto</span>
          <span><kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">F2</kbd> Buscar produto</span>
          <span><kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">F3</kbd> Orçamento/Pedido</span>
          <span><kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">F4</kbd> Mudar quantidade</span>
          <span><kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">F8</kbd> Finalizar venda</span>
          <span><kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">F9</kbd> Crediário</span>
          <span><kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">Esc</kbd> Fechar</span>
          <a href="/painel/devolucoes" className="ml-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 transition">↩ Devoluções</a>
        </div>
      </div>

      {/* Modal de conferência da venda */}
      {mostrarConfirmacao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="text-lg font-bold text-gray-900">Confira a venda</h3>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-4 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Cliente</span>
                <span className="font-medium text-gray-800">{clienteSelecionado?.nome ?? 'Cliente Final'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Loja</span>
                <span className="font-medium text-gray-800">{nomeDeposito}</span>
              </div>

              <div className="border-t border-gray-100 pt-3 space-y-1.5">
                {carrinho.map((item) => (
                  <div key={item.produto_id} className="flex justify-between">
                    <span className="text-gray-700">{item.quantidade}x {item.nome}</span>
                    <span className="font-medium text-gray-800">{formatBRL(item.quantidade * item.preco_unitario)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-gray-100 pt-3 space-y-1.5">
                {pagamentos.map((p) => {
                  const taxa = taxaDoItem(p)
                  const val = parseFloat(p.valor) || 0
                  return (
                    <div key={p.uid} className="flex justify-between">
                      <span className="text-gray-500">
                        {iconeForma(nomeDaForma(p.forma_id))} {nomeDaForma(p.forma_id)}
                        {isCreditoForma(p.forma_id) && p.maquina && p.parcelas > 1 && (
                          <span className="ml-1 text-xs">· {p.parcelas}x</span>
                        )}
                        {isFiadoForma(p.forma_id) && (
                          <span className="ml-1 text-xs text-orange-600">· A Receber</span>
                        )}
                      </span>
                      <span className="font-medium text-gray-800">
                        {formatBRL(val)}{taxa > 0 && <span className="ml-1 text-xs text-amber-600">+{formatBRL(taxa)}</span>}
                      </span>
                    </div>
                  )
                })}
                {descontoNum > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Desconto</span>
                    <span>− {formatBRL(descontoNum)}</span>
                  </div>
                )}
                {trocoPg > 0.005 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Troco (dinheiro)</span>
                    <span>{formatBRL(trocoPg)}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between border-t border-gray-100 pt-3 text-lg font-bold text-gray-900">
                <span>Total</span>
                <span className="text-green-600">{formatBRL(totalCobrado)}</span>
              </div>
            </div>

            <div className="flex gap-3 border-t border-gray-100 px-6 py-4">
              <button type="button" onClick={() => setMostrarConfirmacao(false)} disabled={loading}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50">
                Voltar
              </button>
              <button type="button" onClick={handleFinalizar} disabled={loading}
                className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-green-700 transition disabled:opacity-50">
                {loading ? 'Processando...' : 'Confirmar venda'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Crediário (F9) */}
      {mostrarCrediario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-lg font-bold text-gray-900">Crediário — A Receber (Fiado)</h3>
              <button type="button" onClick={() => setMostrarCrediario(false)}
                className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
            </div>

            {/* Filtros */}
            <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-3">
              <input
                value={buscaCrediario}
                onChange={(e) => setBuscaCrediario(e.target.value)}
                placeholder="Buscar por cliente ou código da venda..."
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {buscaCrediario && (
                <button type="button" onClick={() => setBuscaCrediario('')}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 transition">
                  Limpar
                </button>
              )}
            </div>

            {/* Cards de resumo */}
            {crediarioItens.length > 0 && (
              <div className="grid grid-cols-5 divide-x divide-gray-100 border-b border-gray-100">
                {[
                  { label: 'Saldo devedor', valor: totalDividas, cor: 'text-gray-900' },
                  { label: 'Já pago (parcial)', valor: totalPagoCrediario, cor: 'text-green-600' },
                  { label: 'Em atraso', valor: totalAtraso, cor: 'text-red-600' },
                  { label: 'A vencer', valor: totalAVencer, cor: 'text-gray-700' },
                  { label: 'Selecionado p/ cobrar', valor: subtotalSelecionado, cor: 'text-blue-700' },
                ].map(({ label, valor, cor }) => (
                  <div key={label} className="px-5 py-3 text-center">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
                    <p className={`mt-0.5 text-base font-bold ${cor}`}>{formatBRL(valor)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Tabela */}
            <div className="flex-1 overflow-y-auto">
              {carregandoCrediario ? (
                <p className="py-14 text-center text-sm text-gray-400">Carregando...</p>
              ) : crediarioFiltrado.length === 0 ? (
                <p className="py-14 text-center text-sm text-gray-400">
                  {crediarioItens.length === 0 ? 'Nenhum fiado em aberto. 🎉' : 'Nenhum resultado para o filtro.'}
                </p>
              ) : (
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="text-left text-xs font-semibold uppercase text-gray-500">
                      <th className="px-4 py-3">
                        <input type="checkbox"
                          checked={todosVisivelSelecionados}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelecionados(new Set(crediarioFiltrado.map((i) => i.id)))
                            } else {
                              setSelecionados(new Set())
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                      </th>
                      <th className="px-2 py-3">Ações</th>
                      <th className="px-4 py-3">Cód Venda</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Pago</th>
                      <th className="px-4 py-3 text-right">Restante</th>
                      <th className="px-4 py-3">Vencimento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {crediarioFiltrado.map((item) => {
                      const st = statusCrediario(item.data_vencimento)
                      const sel = selecionados.has(item.id)
                      return (
                        <tr key={item.id} className={`hover:bg-gray-50 ${sel ? 'bg-blue-50' : ''}`}>
                          <td className="px-4 py-3">
                            <input type="checkbox" checked={sel}
                              onChange={(e) => setSelecionados((prev) => {
                                const next = new Set(prev)
                                e.target.checked ? next.add(item.id) : next.delete(item.id)
                                return next
                              })}
                              className="rounded border-gray-300"
                            />
                          </td>
                          <td className="px-2 py-3">
                            <button
                              type="button"
                              onClick={() => handleAbrirRecebimento(item)}
                              title="Registrar recebimento"
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 transition text-sm font-bold">
                              $
                            </button>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">
                            {item.venda_id ? (
                              <button
                                type="button"
                                onClick={() => handleVerVenda(item.venda_id!)}
                                className="text-blue-600 hover:text-blue-800 hover:underline font-semibold transition"
                                title="Ver detalhes da venda"
                              >
                                {codCrediario(item)}
                              </button>
                            ) : (
                              <span className="text-gray-500">{codCrediario(item)}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-800">{item.pessoa_nome ?? <span className="text-gray-400 italic">—</span>}</td>
                          <td className={`px-4 py-3 font-semibold ${st.cor}`}>{st.label}</td>
                          <td className="px-4 py-3 text-right text-gray-500">{formatBRL(item.valor)}</td>
                          <td className="px-4 py-3 text-right text-green-600 font-medium">{item.valor_pago > 0 ? formatBRL(item.valor_pago) : '—'}</td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900">{formatBRL(item.valor - (item.valor_pago ?? 0))}</td>
                          <td className="px-4 py-3 text-gray-500">
                            {item.data_vencimento
                              ? (() => { const s = item.data_vencimento; const d = new Date(s.length === 10 ? s + 'T12:00:00' : s); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR') })()
                              : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Rodapé simples — só totais + feedback */}
            <div className="border-t border-gray-100 px-6 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Total em aberto</span>
                <span className="font-bold text-gray-900">{formatBRL(totalDividas)}</span>
              </div>
              {pagoCrediarioOk && (
                <p className="mt-2 text-center text-sm font-medium text-green-600">✓ Pagamento registrado com sucesso.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Receber Pagamento (por linha) */}
      {recebendoItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">Registrar Recebimento</h3>
                <p className="text-xs text-gray-500 mt-0.5">{recebendoItem.pessoa_nome ?? 'Cliente não identificado'}</p>
              </div>
              <button type="button" onClick={() => setRecebendoItem(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Valor em aberto */}
              <div className="rounded-xl bg-gray-50 px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-gray-500">Valor em aberto</span>
                <span className="font-bold text-gray-900">{formatBRL(recebendoItem.valor)}</span>
              </div>

              {/* Valor a receber (editável) */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Valor recebido
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={valorRecebido}
                    onChange={(e) => setValorRecebido(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 py-3 pl-9 pr-4 text-right text-lg font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Forma de pagamento */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Forma de recebimento
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: 'dinheiro', l: '💵 Dinheiro' },
                    { v: 'pix',      l: '💠 PIX' },
                    { v: 'debito',   l: '💳 Débito' },
                    { v: 'credito',  l: '💳 Crédito' },
                  ].map((op) => (
                    <button
                      key={op.v}
                      type="button"
                      onClick={() => setFormaRecebimento(op.v)}
                      className={`rounded-xl border py-2.5 text-sm font-semibold transition ${formaRecebimento === op.v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                    >
                      {op.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Botão confirmar */}
              <button
                type="button"
                disabled={pagandoCrediario}
                onClick={handleConfirmarRecebimento}
                className="w-full rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 transition disabled:opacity-50"
              >
                {pagandoCrediario
                  ? 'Registrando...'
                  : `Confirmar — ${valorRecebido ? `R$ ${valorRecebido}` : formatBRL(recebendoItem.valor)}`}
              </button>

              {/* Histórico de pagamentos */}
              {(recebendoItem.historico_pagamentos ?? []).length > 0 && (
                <div className="mt-1">
                  <p className="text-xs font-semibold uppercase text-gray-400 tracking-wide mb-2">Histórico de pagamentos</p>
                  <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                    {(recebendoItem.historico_pagamentos ?? []).map((h, idx) => {
                      const d = new Date(h.data)
                      const formaLabel: Record<string, string> = { dinheiro: '💵 Dinheiro', pix: '💠 PIX', debito: '💳 Débito', credito: '💳 Crédito' }
                      return (
                        <div key={idx} className="flex items-center justify-between px-3 py-2 bg-white">
                          <div>
                            <span className="text-xs text-gray-500">{formaLabel[h.forma] ?? h.forma}</span>
                            <span className="ml-2 text-xs text-gray-400">
                              {isNaN(d.getTime()) ? h.data : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                              {' '}
                              {isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-green-600">{formatBRL(h.valor)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalhe da Venda */}
      {(detalheVenda || carregandoDetalhe) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-lg font-bold text-gray-900">
                {detalheVenda ? `Venda ${detalheVenda.numero ? `#${detalheVenda.numero}` : ''}` : 'Carregando...'}
              </h3>
              <button type="button" onClick={() => setDetalheVenda(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            {carregandoDetalhe && <p className="py-16 text-center text-sm text-gray-400">Carregando...</p>}

            {detalheVenda && (
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                {/* Cabeçalho */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Data / Hora</p>
                    <p className="font-semibold text-gray-900">
                      {new Date(detalheVenda.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Vendedor</p>
                    <p className="font-semibold text-gray-900">{detalheVenda.vendedor_nome ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Depósito</p>
                    <p className="font-semibold text-gray-900">{detalheVenda.deposito_nome ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Forma de Pagamento</p>
                    <p className="font-semibold text-gray-900">{detalheVenda.forma_pagamento_nome ?? '—'}</p>
                  </div>
                </div>

                {/* Produtos */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Itens</p>
                  <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                    {detalheVenda.itens.length === 0 ? (
                      <p className="py-4 text-center text-sm text-gray-400">Sem itens</p>
                    ) : detalheVenda.itens.map((it, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{it.nome}</p>
                          <p className="text-xs text-gray-500">{it.quantidade}x · {formatBRL(it.preco_unitario)} cada</p>
                        </div>
                        <p className="text-sm font-bold text-gray-900">{formatBRL(it.total_item)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totais */}
                <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {detalheVenda.desconto > 0 && (
                    <div className="flex justify-between px-4 py-2 text-sm">
                      <span className="text-gray-500">Desconto</span>
                      <span className="text-red-600">- {formatBRL(detalheVenda.desconto)}</span>
                    </div>
                  )}
                  <div className="flex justify-between px-4 py-3 text-sm font-bold">
                    <span>Total</span>
                    <span className="text-green-700">{formatBRL(detalheVenda.total)}</span>
                  </div>
                </div>

                {detalheVenda.observacoes && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Observações</p>
                    <p className="text-sm text-gray-700 italic">{detalheVenda.observacoes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Buscar Vendas (#9) */}
      {mostrarVendas && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-lg font-bold text-gray-900">Buscar Vendas</h3>
              <button type="button" onClick={() => setMostrarVendas(false)}
                className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
            </div>

            <div className="border-b border-gray-100 px-6 py-3">
              <input
                value={buscaVenda}
                onChange={(e) => setBuscaVenda(e.target.value)}
                placeholder="Filtrar por código ou cliente..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {carregandoVendas ? (
                <p className="py-10 text-center text-sm text-gray-400">Carregando...</p>
              ) : vendasFiltradas.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">Nenhuma venda encontrada.</p>
              ) : (
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase text-gray-400">
                      <th className="pb-2 pr-3">Código</th>
                      <th className="pb-2 pr-3">Data</th>
                      <th className="pb-2 pr-3">Cliente</th>
                      <th className="pb-2 pr-3">Pagamento</th>
                      <th className="pb-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {vendasFiltradas.map((v) => (
                      <tr key={v.id} className="hover:bg-gray-50">
                        <td className="py-2.5 pr-3 font-mono text-xs text-gray-500">{v.id.slice(0, 8).toUpperCase()}</td>
                        <td className="py-2.5 pr-3 text-gray-600">
                          {new Date(v.created_at).toLocaleDateString('pt-BR')}{' '}
                          <span className="text-gray-400">{new Date(v.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-gray-800">{nomeCliente(v.pessoa_id)}</td>
                        <td className="py-2.5 pr-3 text-gray-600">{nomeFormaPg(v.forma_pagamento_id)}</td>
                        <td className="py-2.5 text-right font-semibold text-gray-900">{formatBRL(v.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="border-t border-gray-100 px-6 py-3 text-right">
              <button type="button" onClick={() => setMostrarVendas(false)}
                className="rounded-xl border border-gray-200 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Consultar Produtos (F1 / botão ℹ) — busca própria + ficha rica */}
      {fichaAberta && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h3 className="text-base font-bold text-gray-900">Consultar Produtos</h3>
              <button type="button" onClick={fecharFicha}
                className="text-lg leading-none text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Busca própria do modal */}
              <div className="relative">
                <label className="mb-1 block text-xs font-medium text-gray-500">Selecione o produto</label>
                <input
                  ref={buscaFichaRef}
                  value={buscaFicha}
                  onChange={(e) => { setBuscaFicha(e.target.value); setFichaSel(null) }}
                  placeholder="Buscar por nome ou código..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {!fichaSel && buscaFicha.length >= 1 && fichaFiltrados.length > 0 && (
                  <div className="absolute left-0 right-0 z-10 mt-1 max-h-60 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {fichaFiltrados.map((p) => (
                      <button key={p.id} type="button"
                        onMouseDown={(e) => { e.preventDefault(); setFichaSel(p); setBuscaFicha(p.nome) }}
                        className="block w-full border-b border-gray-50 px-3 py-2 text-left text-sm last:border-0 hover:bg-blue-50">
                        <span className="font-medium text-gray-800">{p.nome}</span>
                        {p.codigo && <span className="text-gray-400"> · {p.codigo}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Ficha rica do produto selecionado */}
              {fichaSel && (
                <div className="space-y-3">
                  <div className="flex gap-4">
                    <div className="shrink-0">
                      {fichaSel.imagem_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fichaSel.imagem_url} alt={fichaSel.nome}
                          className="h-28 w-28 rounded-lg border border-gray-100 bg-gray-50 object-contain" />
                      ) : (
                        <div className="flex h-28 w-28 items-center justify-center rounded-lg border border-gray-100 bg-gray-50 text-4xl text-gray-200">📦</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold leading-snug text-gray-900">{fichaSel.nome}</h4>
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        <div>
                          <span className="text-gray-400">Código</span>
                          <p className="font-medium text-gray-700">{fichaSel.codigo || '—'}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Marca</span>
                          <p className="font-medium text-gray-700">{fichaSel.marca || '—'}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Categoria</span>
                          <p className="font-medium text-gray-700">{fichaSel.categoria || '—'}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Preço de venda</span>
                          <p className="font-bold text-green-600">{formatBRL(precoDoProduto(fichaSel))}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="mb-1 text-xs font-medium text-gray-500">Saldo por depósito</p>
                    <div className="divide-y divide-gray-50 rounded-lg border border-gray-100">
                      {depositos.map((d) => {
                        const qtd = fichaSel.estoquePorDeposito[d.id] ?? 0
                        const atual = d.id === depositoId
                        return (
                          <div key={d.id} className={`flex justify-between px-3 py-1.5 text-sm ${atual ? 'bg-blue-50/60' : ''}`}>
                            <span className="text-gray-600">{d.nome}{atual && ' (atual)'}</span>
                            <span className={qtd > 0 ? 'font-semibold text-gray-800' : 'text-gray-300'}>
                              {qtd > 0 ? `${qtd} un.` : '—'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {fichaSel.descricao && (
                    <p className="text-xs leading-relaxed text-gray-500">{fichaSel.descricao}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 border-t border-gray-100 px-5 py-3">
              <button type="button"
                onClick={() => { setFichaSel(null); setBuscaFicha(''); buscaFichaRef.current?.focus() }}
                className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                Limpar
              </button>
              <button type="button" onClick={fecharFicha}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                Fechar
              </button>
              <button
                type="button"
                onClick={() => { if (fichaSel) { adicionarAoCarrinho(fichaSel); fecharFicha() } }}
                disabled={!fichaSel || (fichaSel.estoquePorDeposito[depositoId] ?? 0) <= 0}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition disabled:opacity-40"
              >
                + Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal F3 — Buscar Orçamentos e Pedidos */}
      {mostrarOrcamentos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-lg font-bold text-gray-900">Buscar Orçamentos e Pedidos</h3>
              <button type="button" onClick={() => setMostrarOrcamentos(false)}
                className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
            </div>

            <div className="border-b border-gray-100 px-6 py-3">
              <input
                value={buscaOrcamento}
                onChange={(e) => setBuscaOrcamento(e.target.value)}
                placeholder="Filtrar por código ou cliente..."
                autoFocus
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {carregandoOrcamentos ? (
                <p className="py-10 text-center text-sm text-gray-400">Carregando...</p>
              ) : orcamentosFiltrados.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">
                  {orcamentos.length === 0 ? 'Nenhum orçamento ou pedido em aberto.' : 'Nenhum resultado.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {orcamentosFiltrados.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => carregarOrcamento(o)}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-left hover:border-blue-300 hover:bg-blue-50 transition"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-gray-500">{o.id.slice(0, 8).toUpperCase()}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            o.tipo === 'orcamento' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {o.tipo === 'orcamento' ? 'Orçamento' : 'Pedido'}
                          </span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{o.status}</span>
                        </div>
                        <span className="font-bold text-green-600 text-sm">{formatBRL(o.total)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>👤 {o.pessoa_nome ?? 'Cliente Final'}</span>
                        <span>{new Date(o.created_at).toLocaleDateString('pt-BR')}</span>
                      </div>
                      {o.itens.length > 0 && (
                        <p className="mt-1.5 text-xs text-gray-400 truncate">
                          {o.itens.map((i) => `${i.quantidade}x ${i.nome}`).join(' · ')}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 px-6 py-3 text-right">
              <button type="button" onClick={() => setMostrarOrcamentos(false)}
                className="rounded-xl border border-gray-200 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast de aviso — discreto, canto inferior direito, some sozinho */}
      {erro && (
        <div className="fixed bottom-6 right-6 z-50 flex items-start gap-3 rounded-xl bg-red-600 px-4 py-3 shadow-lg max-w-xs">
          <span className="text-sm font-medium text-white">{erro}</span>
          <button type="button" onClick={() => setErro(null)}
            className="ml-1 text-red-200 hover:text-white text-sm leading-none">✕</button>
        </div>
      )}
    </div>
  )
}
