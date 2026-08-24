'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { formatBRL, hojeSP } from '@/lib/utils'
import { labelPrazo } from '@/lib/formas-pagamento'
import { createClient } from '@/lib/supabase/client'
import { Spinner } from '@/components/Spinner'
import { finalizarVenda, salvarOrcamentoPDV, buscarItensTabela, buscarProdutosPDV, carregarCatalogoPDV, buscarClientesPDV, carregarClientesPDV, buscarFiadoCliente, buscarVendas, buscarCrediario, pagarLancamentos, registrarPagamentoParcial, registrarPagamentoMisto, aplicarDescontoCrediario, buscarPedidosAbertos, buscarDetalheVenda, buscarCupomVenda, validarSenhaDesconto, type VendaResumo, type PagamentoInput, type CrediarioItem, type PedidoResumo, type DetalheVenda } from './actions'
import { criarClientePDV } from '../clientes/actions'
import { buscarOSPorNumero, receberOS } from '../os/actions'
import { PoliticaCadastro } from '../clientes/politica'
import { rotulaRotina } from '@/lib/rotina-pagamento'
import { badgeTabela } from '@/lib/badge-tabela'

// "Desconto" aparece junto das formas de recebimento porque é ali que a Duda procura,
// mas NÃO é forma de pagamento: não entra dinheiro, ele abate a dívida. Id falso pra
// não colidir com nenhuma forma real do banco.
const DESCONTO_ID = '__desconto__'
import { buscarSaldoCredito } from '@/app/painel/creditos/actions'
import type { PromoInfo } from './page'
import { CampoDinheiro } from '@/components/CampoDinheiro'

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

// Pré-carregamento por GET (não por server action). O Next serializa server actions,
// então o catálogo/clientes do mount prendiam na fila tudo que a menina fizesse nos
// primeiros segundos (o F9 custava 7,6s em vez de 2,5s). GET roda em paralelo.
async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, {
    headers: { authorization: 'Bearer ' + (await authToken()) },
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json() as Promise<T>
}

function iconeForma(nome: string) {
  const n = nome.toLowerCase()
  if (n.includes('pix')) return '💠'
  if (n.includes('dinheiro')) return '💵'
  if (n.includes('fiado') || n.includes('crédito loja') || n.includes('credito loja')) return '🤝'
  // antes do cartão: "Vale Crédito" contém "crédito" e cairia como 💳
  if (n.includes('vale')) return '🎟️'
  if (n.includes('débito') || n.includes('debito') || n.includes('crédito') || n.includes('credito')) return '💳'
  return '•'
}

interface Produto {
  id: string
  nome: string
  preco: number
  preco_custo?: number | null   // usado só pra avisar venda abaixo do custo
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
  loja_id: string | null
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
  nao_vender?: boolean | null
  nao_vender_motivo?: string | null
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
  preco_custo?: number | null // pra avisar quando o item sai abaixo do custo
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
  /** Tabelas que algum cliente realmente usa — só essas entram no pré-carregamento. */
  tabelasUsadas?: string[]
  promosPorProduto: Record<string, PromoInfo[]>
  seriesPorProduto: Record<string, Record<string, string[]>>  // produto_id → deposito_id → [IMEIs em_estoque]
  depositoInicial?: string   // depósito padrão do usuário (config PDV do perfil)
}

export function PDVClient({ produtos: produtosIniciais, formas, pessoas: pessoasIniciais, depositos, lojas, maquinas, tabelas, precosPorTabela, tabelasUsadas = [], promosPorProduto, seriesPorProduto: seriesIniciais, depositoInicial }: Props) {
  // produtos/pessoas/IMEIs viram CACHE acumulável: começam vazios (não vêm mais no HTML)
  // e vão sendo preenchidos pela busca sob demanda. Os `.find()` do carrinho leem daqui,
  // e como só entra no carrinho o que veio da busca, o item sempre está no cache.
  const [produtos, setProdutos] = useState(produtosIniciais)
  const [pessoas, setPessoas] = useState(pessoasIniciais)
  const [seriesPorProduto, setSeriesPorProduto] = useState(seriesIniciais)
  const [buscandoProdutos, setBuscandoProdutos] = useState(false)
  const [buscandoClientes, setBuscandoClientes] = useState(false)
  const [busca, setBusca] = useState('')
  const [buscaSel, setBuscaSel] = useState(0)  // linha destacada no dropdown (teclado ↑↓)
  const [copiado, setCopiado] = useState(false)
  const [selCopia, setSelCopia] = useState<Set<string>>(new Set())  // peças marcadas pra copiar preço
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [pagamentos, setPagamentos] = useState<PagamentoItem[]>([
    { uid: '1', forma_id: '', valor: '', maquina: '', parcelas: 1 },
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

  // Receber OS no PDV (Opção B) — reusa a ação segura receberOS (não mexe no carrinho)
  const [mostrarReceberOS, setMostrarReceberOS] = useState(false)
  const [osNumInput, setOsNumInput] = useState('')
  const [osReceb, setOsReceb] = useState<{ id: string; numero: number; pessoa_nome: string | null; equipamento: string | null; total: number; recebido_em: string | null } | null>(null)
  const [buscandoOS, setBuscandoOS] = useState(false)
  const [formaOSReceb, setFormaOSReceb] = useState('')
  const [recebendoOS, setRecebendoOS] = useState(false)
  const [msgOSReceb, setMsgOSReceb] = useState('')
  const buscarOS = async () => {
    const n = parseInt(osNumInput, 10)
    if (!n) return
    setBuscandoOS(true); setMsgOSReceb(''); setOsReceb(null)
    const os = await buscarOSPorNumero(n)
    setBuscandoOS(false)
    if (!os) setMsgOSReceb('OS não encontrada.')
    else if (os.recebido_em) { setOsReceb(os); setMsgOSReceb('Esta OS já foi recebida.') }
    else { setOsReceb(os); setFormaOSReceb(formasRecebimento.find((f) => f.tipo === 'dinheiro')?.nome ?? formasRecebimento[0]?.nome ?? '') }
  }
  const confirmarReceberOS = async () => {
    if (!osReceb || osReceb.recebido_em) return
    setRecebendoOS(true); setMsgOSReceb('')
    const r = await receberOS(osReceb.id, formaOSReceb, lojaId)
    setRecebendoOS(false)
    if (r.ok) { setMsgOSReceb('✓ Recebido!'); setOsReceb({ ...osReceb, recebido_em: new Date().toISOString() }) }
    else setMsgOSReceb(r.erro ?? 'Erro ao receber.')
  }
  const [crediarioItens, setCrediarioItens] = useState<CrediarioItem[]>([])
  const [carregandoCrediario, setCarregandoCrediario] = useState(false)
  const [buscaCrediario, setBuscaCrediario] = useState('')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [pagandoCrediario, setPagandoCrediario] = useState(false)
  const [pagoCrediarioOk, setPagoCrediarioOk] = useState(false)
  // forma escolhida pra quitar VÁRIAS notas de uma vez (Isa: "quitar todas de uma vez só")
  const [formaQuitar, setFormaQuitar] = useState('')
  const [detalheVenda, setDetalheVenda] = useState<DetalheVenda | null>(null)
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false)
  // Modal de recebimento por linha
  const [recebendoItem, setRecebendoItem] = useState<CrediarioItem | null>(null)
  const [formaRecebimento, setFormaRecebimento] = useState<string>('')  // forma_id da forma escolhida
  const [parcelasRecebimento, setParcelasRecebimento] = useState(1)
  const [valorRecebido, setValorRecebido] = useState<string>('')
  const [motivoDesconto, setMotivoDesconto] = useState('')
  // Recebimento MISTO — quitar um fiado com várias formas (dinheiro + Pix…) de uma vez.
  // Cada linha é { forma_id, valor }. Vazio/off = fluxo simples de uma forma só.
  const [modoMistoReceb, setModoMistoReceb] = useState(false)
  const [linhasMisto, setLinhasMisto] = useState<{ formaId: string; valor: string }[]>([])
  // Visão do crediário: por venda (lista de fiados) ou POR PESSOA (quem deve, quanto,
  // limite e o combinado de pagamento) — pedido do Vitor
  const [visaoCrediario, setVisaoCrediario] = useState<'vendas' | 'pessoas'>('vendas')
  const [infoPessoas, setInfoPessoas] = useState<Record<string, { limite: number; rotina: string | null }>>({})
  // F3 — Busca Orçamento/Pedido
  const [mostrarOrcamentos, setMostrarOrcamentos] = useState(false)
  const [orcamentos, setOrcamentos] = useState<PedidoResumo[]>([])
  const [carregandoOrcamentos, setCarregandoOrcamentos] = useState(false)
  const [buscaOrcamento, setBuscaOrcamento] = useState('')

  // F1 — Consultar Produtos (modal com busca própria + ficha rica)
  const [fichaAberta, setFichaAberta] = useState(false)
  const [fichaSel, setFichaSel] = useState<Produto | null>(null)
  const [buscaFicha, setBuscaFicha] = useState('')

  // Novo cliente pelo PDV (cadastro rápido com política + RG + foto opcional)
  const [mostrarNovoCliente, setMostrarNovoCliente] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoCpf, setNovoCpf] = useState('')
  const [novoRg, setNovoRg] = useState('')
  const [novoTel, setNovoTel] = useState('')
  const [novoTabela, setNovoTabela] = useState('')
  const [novoFoto, setNovoFoto] = useState<File | null>(null)
  const [novoFotoPreview, setNovoFotoPreview] = useState<string | null>(null)
  const [novoEmail, setNovoEmail] = useState('')
  const [novoNasc, setNovoNasc] = useState('')
  const [novoCep, setNovoCep] = useState('')
  const [novoUf, setNovoUf] = useState('')
  const [novoLogradouro, setNovoLogradouro] = useState('')
  const [novoNumero, setNovoNumero] = useState('')
  const [novoCidade, setNovoCidade] = useState('')
  const [novoBairro, setNovoBairro] = useState('')
  const [novoComplemento, setNovoComplemento] = useState('')
  const [buscandoCepNovo, setBuscandoCepNovo] = useState(false)
  const [salvandoNovoCliente, setSalvandoNovoCliente] = useState(false)

  // Crédito do cliente. NÃO existe estado "creditoAplicado" separado: o vale é uma LINHA
  // de pagamento como qualquer outra (dá pra escolher no dropdown, editar o valor, ter
  // várias). O quanto foi aplicado é derivado dessas linhas mais abaixo. Ter o vale em
  // dois lugares (estado + linha) foi a origem de uma fila de bugs: sumia do dropdown,
  // o auto-preenchimento não descontava, a conferência não fechava.
  const [saldoCredito, setSaldoCredito] = useState(0)
  const [fiadoCliente, setFiadoCliente] = useState<{ limite: number; devendo: number; disponivel: number } | null>(null)

  const qtdRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  // Busca saldo de crédito ao selecionar cliente
  useEffect(() => {
    // Trocar de cliente (ou limpar) tira as linhas de vale do anterior — senão o
    // crédito do cliente A ficava "aplicado" na venda do cliente B.
    setPagamentos((prev) => {
      const semVale = prev.filter((p) => formas.find((f) => f.id === p.forma_id)?.tipo !== 'vale_credito')
      return semVale.length > 0 ? semVale : [{ uid: '1', forma_id: '', valor: '', maquina: '', parcelas: 1 }]
    })
    if (!pessoaId) { setSaldoCredito(0); setFiadoCliente(null); return }
    authToken().then((t) => {
      if (!t) return
      buscarSaldoCredito(t, pessoaId).then(({ saldo }) => setSaldoCredito(saldo)).catch(() => {})
      buscarFiadoCliente(t, pessoaId).then(setFiadoCliente).catch(() => {})
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

  // Avisa antes de fechar/recarregar a aba se há venda em andamento (evita perder o carrinho)
  useEffect(() => {
    if (carrinho.length === 0) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [carrinho.length])

  // PRÉ-CARREGA o catálogo inteiro (leve) UMA vez ao abrir o PDV → busca 100% LOCAL,
  // instantânea, sem rede por tecla. A busca on-demand abaixo vira só reforço (séries/frescor).
  const [catalogoPronto, setCatalogoPronto] = useState(false)
  useEffect(() => {
    let vivo = true
    // Cache do catálogo no PRÓPRIO PC (localStorage, sobrevive a fechar o navegador/PC).
    // São sempre as mesmas máquinas → o PDV reabre instantâneo. O estoque continua
    // sendo revalidado em background (e o finalizar_venda valida no servidor), então
    // não há risco de vender item errado — o cache é só pra vitrine/busca instantânea.
    const CHAVE = 'pdv_catalogo_v1'
    const VALIDADE = 7 * 24 * 3600 * 1000 // ignora cache com +7 dias (evita 1º paint super velho)
    // 1) cache local → busca instantânea já na abertura (enquanto atualiza no fundo)
    try {
      const bruto = localStorage.getItem(CHAVE)
      if (bruto) {
        const { t, produtos } = JSON.parse(bruto) as { t: number; produtos: unknown[] }
        if (Array.isArray(produtos) && produtos.length && Date.now() - (t || 0) < VALIDADE) {
          mesclarProdutos(produtos as Parameters<typeof mesclarProdutos>[0], {}); setCatalogoPronto(true)
        }
      }
    } catch { /* ignore */ }
    // 2) sempre traz o catálogo fresco em background e recacheia (frescor do estoque)
    ;(async () => {
      try {
        const cat = await getJSON<Awaited<ReturnType<typeof carregarCatalogoPDV>>>('/api/pdv/catalogo')
        if (vivo && cat.length) {
          mesclarProdutos(cat, {}); setCatalogoPronto(true)
          try { localStorage.setItem(CHAVE, JSON.stringify({ t: Date.now(), produtos: cat })) } catch { /* quota — segue sem cache */ }
        }
      } catch { /* silencioso — cai na busca on-demand */ }
    })()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Busca de produto SOB DEMANDA (debounce 250ms) — alimenta o cache; a vitrine
  // (produtosFiltrados) continua filtrando o cache pelo termo. Vale pra busca principal e a do F1.
  useEffect(() => {
    // modal F1 aberto usa a busca dele; senão a busca principal
    const termo = (fichaAberta ? buscaFicha : busca).trim()
    if (termo.length < 1) { setBuscandoProdutos(false); return }
    // com o catálogo local, o resultado já é instantâneo — não mostra "buscando";
    // o on-demand ainda roda só pra trazer as séries (IMEIs) dos serializados.
    if (!catalogoPronto) setBuscandoProdutos(true)
    let vivo = true
    const t = setTimeout(async () => {
      try {
        const { produtos: achados, series } = await buscarProdutosPDV(await authToken(), termo)
        if (vivo) mesclarProdutos(achados, series)
      } catch { /* silencioso */ }
      finally { if (vivo) setBuscandoProdutos(false) }
    }, catalogoPronto ? 500 : 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [busca, buscaFicha, fichaAberta, mesclarProdutos, catalogoPronto])

  // PRÉ-CARREGA TODOS os clientes (leve) ao abrir o PDV → busca de cliente 100% LOCAL,
  // instantânea. Antes ia ao servidor a cada tecla ("Buscando..." travado). Mesmo
  // padrão do catálogo: cache no PC (localStorage) + revalida em background.
  const [clientesProntos, setClientesProntos] = useState(false)
  useEffect(() => {
    let vivo = true
    const CHAVE = 'pdv_clientes_v1'
    const VALIDADE = 7 * 24 * 3600 * 1000
    const mesclar = (novos: Pessoa[]) => setPessoas((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]))
      for (const p of novos) map.set(p.id, p)
      return Array.from(map.values())
    })
    try {
      const bruto = localStorage.getItem(CHAVE)
      if (bruto) {
        const { t, clientes } = JSON.parse(bruto) as { t: number; clientes: Pessoa[] }
        if (Array.isArray(clientes) && clientes.length && Date.now() - (t || 0) < VALIDADE) {
          mesclar(clientes); setClientesProntos(true)
        }
      }
    } catch { /* ignore */ }
    ;(async () => {
      try {
        const cli = await getJSON<Awaited<ReturnType<typeof carregarClientesPDV>>>('/api/pdv/clientes')
        if (vivo && cli.length) {
          mesclar(cli); setClientesProntos(true)
          try { localStorage.setItem(CHAVE, JSON.stringify({ t: Date.now(), clientes: cli })) } catch { /* quota */ }
        }
      } catch { /* cai na busca on-demand */ }
    })()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Busca de cliente — com todos os clientes locais, a vitrine já filtra instantâneo.
  // O servidor vira só REFORÇO (pega cadastro novo feito noutra máquina); sem "Buscando..."
  // travando, e só dispara se o cache ainda não carregou ou não achou nada local.
  useEffect(() => {
    const termo = buscaCliente.trim()
    if (termo.length < 1) { setBuscandoClientes(false); return }
    // já tem tudo local → não mostra "buscando" nem vai ao servidor por tecla
    if (clientesProntos) { setBuscandoClientes(false); return }
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
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
  }, [buscaCliente, clientesProntos])

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
      else if (e.key === 'F7') { e.preventDefault(); window.location.href = '/painel/devolucoes' }  // acesso rápido à devolução
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
  // PDV em 2 etapas (pedido da Isa): 'venda' = monta o carrinho/cliente/tabela;
  // 'pagamento' = tela cheia com os botões de forma (a forma sai da 1ª tela).
  const [etapa, setEtapa] = useState<'venda' | 'pagamento'>('venda')
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
  // Formas mostradas no PDV: sem loja aparecem sempre; com loja, só na loja delas.
  // (Isa 29/07 — evita escolher "PIX Teresópolis" no caixa de Petrópolis.)
  //
  // O Vale Crédito (FP_VALE) entra aqui como forma normal — no grid E no dropdown das
  // linhas — mas SÓ quando o cliente tem saldo: sem saldo é um botão morto que só gera
  // "por que não deixa clicar". Na hora de finalizar, as linhas de vale são separadas e
  // viram o parâmetro de crédito do RPC (ver handleFinalizar).
  //
  // Marketplace (FP_MERCADOLIVRE) nunca aparece aqui: é dinheiro que o Mercado Livre já
  // recebeu por fora, gravado só pelo webhook (ver app/api/integracoes/mercado-livre/webhook).
  // Se aparecesse no grid, o caixa podia marcar uma venda de balcão como "paga pelo Mercado
  // Livre" sem receber nada de verdade — a venda fecha como paga, conta como faturamento e
  // não aparece na gaveta pra ninguém notar a falta.
  const formasVisiveis = formas.filter((f) =>
    (!f.loja_id || f.loja_id === lojaId) && (f.tipo !== 'vale_credito' || saldoCredito > 0.01) && f.tipo !== 'marketplace')
  // Formas que servem pra RECEBER (fiado, OS). Fora: fiado (receber fiado com fiado não
  // faz sentido) e vale (abate saldo do cliente numa venda, não é dinheiro entrando num
  // recebimento — e escolhê-lo lá não debitaria saldo nenhum).
  const formasRecebimento = formasVisiveis.filter((f) => f.tipo !== 'fiado' && f.tipo !== 'vale_credito')
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
  // Caixa da loja aberto? (Isa: só vender com caixa aberto) — re-checa ao trocar de loja
  const [caixaAberto, setCaixaAberto] = useState(true)   // true até checar (evita piscar bloqueio)
  useEffect(() => {
    if (!lojaId) return
    let vivo = true
    getJSON<{ aberto: boolean }>('/api/pdv/caixa-aberto?loja=' + encodeURIComponent(lojaId))
      .then(({ aberto }) => { if (vivo) setCaixaAberto(aberto) })
      .catch(() => {})
    return () => { vivo = false }
  }, [lojaId])
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

  // Prioridade de estoque na busca (pedido da Isa): 1º tem na loja atual,
  // 2º não tem aqui mas tem na outra loja, 3º sem estoque em lugar nenhum.
  const idsDepLojaAtual = depositosDaLoja.map((d) => d.id)
  const saldoNaLojaAtual = (p: Produto) => idsDepLojaAtual.reduce((s, id) => s + (p.estoquePorDeposito[id] ?? 0), 0)
  const saldoOutrasLojas = (p: Produto) => depositosReais.reduce((s, d) => s + (d.loja_id === lojaId ? 0 : (p.estoquePorDeposito[d.id] ?? 0)), 0)
  const prioridadeEstoque = (p: Produto) => (saldoNaLojaAtual(p) > 0 ? 0 : saldoOutrasLojas(p) > 0 ? 1 : 2)
  const ordenarPorEstoque = (lista: Produto[]) =>
    [...lista].sort((a, b) => prioridadeEstoque(a) - prioridadeEstoque(b) || a.nome.localeCompare(b.nome))

  // Índice de busca PRÉ-NORMALIZADO (sem acento), computado 1x quando o catálogo muda —
  // evita recomputar a normalização de ~8 mil produtos a cada tecla (o que travava a busca).
  const indiceNorm = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of produtos) m.set(p.id, semAcento(`${p.nome} ${p.codigo ?? ''} ${p.marca ?? ''}`))
    return m
  }, [produtos])
  const filtrarProdutos = (termo: string, limite: number) => {
    const palavras = semAcento(termo).split(/\s+/).filter(Boolean)
    if (!palavras.length) return []
    const achados = produtos.filter((p) => {
      const alvo = indiceNorm.get(p.id) ?? ''
            return palavras.every((w) => alvo.includes(w)) && saldoNoDeposito(p) > 0
    })
    return ordenarPorEstoque(achados).slice(0, limite)
  }

  const produtosFiltrados = busca.trim().length >= 1 ? filtrarProdutos(busca, 40) : []
  // Busca interna do modal Consultar Produtos (F1)
  const fichaFiltrados = buscaFicha.trim().length >= 1 ? filtrarProdutos(buscaFicha, 40) : []

  // trocar a busca zera as peças marcadas (evita marcar de uma busca e copiar de outra)
  // e volta o destaque do teclado pro topo
  useEffect(() => { setSelCopia(new Set()); setBuscaSel(0) }, [busca])
  // rola a linha destacada (↑↓) pra dentro da área visível do dropdown
  const linhaAtivaRef = useRef<HTMLDivElement>(null)
  useEffect(() => { linhaAtivaRef.current?.scrollIntoView({ block: 'nearest' }) }, [buscaSel])
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
        preco_custo: p.preco_custo ?? null,
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
  // Promoção só vale se não tiver restrição de tabela OU a tabela atual estiver na
  // lista. tabelaId '' = Preço Padrão → promoção restrita a tabelas não aplica nele.
  const promoValeNaTabela = (p: PromoInfo) => !p.tabelas || p.tabelas.length === 0 || p.tabelas.includes(tabelaId)
  const promosDoProduto = (produtoId: string) => (promosPorProduto[produtoId] ?? []).filter(promoValeNaTabela)

  const grupoTotalProg = (promoId: string) =>
    carrinho.reduce((s, i) => s + (promosDoProduto(i.produto_id).some((p) => p.id === promoId) ? i.quantidade : 0), 0)

  // Promoção efetiva de uma linha (resolve 'auto' = melhor desconto na quantidade atual)
  const promoEfetiva = (item: ItemCarrinho): PromoInfo | null => {
    const lista = promosDoProduto(item.produto_id)
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

  // Pré-carrega as OUTRAS tabelas em segundo plano (Isa: "trocar de tabela demora").
  // A troca travava porque só ia buscar os itens da tabela na hora do clique — e uma
  // tabela tem milhares de itens. Carregando antes, escolher o cliente vira instantâneo.
  // Sequencial e sem bloquear a tela; não muda a lógica de preço, só antecipa o fetch.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const t = await authToken()
      if (!t || !vivo) return
      // só as tabelas que têm cliente (as outras são grandes e ninguém usa)
      const alvo = tabelas.filter((t) => tabelasUsadas.includes(t.id))
      for (const tab of alvo) {
        if (!vivo) return
        if (precos[tab.id]) continue
        try {
          const itens = await buscarItensTabela(t, tab.id)
          if (!vivo) return
          const m: Record<string, { qtd_min: number; preco: number }[]> = {}
          for (const it of itens) {
            ;(m[it.produto_id] ??= []).push({ qtd_min: it.quantidade_minima ?? 1, preco: it.preco })
          }
          for (const pid in m) m[pid].sort((a, b) => b.qtd_min - a.qtd_min)
          // só grava se ninguém carregou no meio-tempo (não atropela o trocarTabela)
          setPrecos((prev) => (prev[tab.id] ? prev : { ...prev, [tab.id]: m }))
        } catch { /* silencioso: se falhar, o trocarTabela busca na hora, como antes */ }
      }
    })()
    return () => { vivo = false }
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
  const isValeForma = (id: string) => tipoDaForma(id) === 'vale_credito'

  // Quanto do saldo do cliente está sendo usado = soma das linhas de vale. É isto que
  // vai pro RPC no parâmetro do crédito (que debita o saldo com lock e grava a linha
  // FP_VALE). As linhas de vale NÃO vão junto em p_pagamentos — se fossem, a trava
  // "pagamentos + crédito = total" contaria o vale duas vezes e recusaria a venda.
  const creditoAplicado = pagamentos
    .filter((p) => isValeForma(p.forma_id))
    .reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)

  // Teto de UMA linha de vale: o saldo do cliente menos o que as OUTRAS linhas de vale já
  // consomem. É o que impede gastar mais crédito do que existe (o RPC também recusa, mas
  // aí a venda já falhou no balcão).
  const tetoValeLinha = (uid: string) => Math.max(0, saldoCredito - pagamentos
    .filter((p) => isValeForma(p.forma_id) && p.uid !== uid)
    .reduce((s, p) => s + (parseFloat(p.valor) || 0), 0))

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
    // sem forma pré-marcada: a atendente ESCOLHE (pedido da Isa — antes vinha PIX
    // e ela finalizava sem conferir se foi pix mesmo)
    forma_id: '',
    valor: '',
    maquina: '',
    parcelas: 1,
  })

  // Aba 2 (tela de pagamento): clicar num botão-forma do grid SOMA ao pagamento em vez
  // de substituir — é assim que sai o misto (ex.: R$10 no Vale Crédito + R$6 no PIX,
  // cada valor editável no detalhe abaixo do grid). Só vira forma única de novo quando
  // ainda não há nada parcial montado (linha vazia, ou 1 linha já com o total).
  const escolherFormaGrid = (formaId: string) => {
    setErro(null)
    const vale = isValeForma(formaId)
    // As duas categorias (vale × formas normais) se dividem o total. Ao mexer numa, a
    // outra é tratada como já resolvida — por isso o alvo desconta só a categoria oposta.
    // O vale ainda tem o teto do saldo do cliente.
    const outraCategoria = pagamentos
      .filter((p) => isValeForma(p.forma_id) !== vale)
      .reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
    const bruto = Math.max(0, total - outraCategoria)
    const alvo = vale ? Math.min(saldoCredito, bruto) : bruto

    const mesmas = pagamentos.filter((p) => isValeForma(p.forma_id) === vale)
    const pago = mesmas.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
    const falta = Math.max(0, alvo - pago)
    const linhaDaForma = (valor: number): PagamentoItem => ({
      ...novoPagamento(),
      forma_id: formaId,
      valor: valor.toFixed(2),
      maquina: maquinaDaForma(formaId),
    })

    // 1 linha só NESTA categoria e sem valor parcial (vazia ou já cobrindo tudo): troca
    // por forma única. As linhas da outra categoria ficam intactas — é o que impede o
    // clique numa forma normal de apagar o vale (e vice-versa).
    const primeira = mesmas[0]
    const valorPrimeira = parseFloat(primeira?.valor ?? '') || 0
    const parcial = valorPrimeira > 0.005 && valorPrimeira < alvo - 0.005
    if (mesmas.length <= 1 && !parcial) {
      setValorAuto(true)
      setPagamentos((prev) => {
        const resto = prev.filter((p) => isValeForma(p.forma_id) !== vale)
        const linha = { ...linhaDaForma(alvo), uid: primeira?.uid ?? String(Date.now() + Math.random()) }
        return vale ? [linha, ...resto] : [...resto, linha]
      })
      return
    }

    // a partir daqui é misto: o valor é montado à mão, não segue mais o total sozinho
    setValorAuto(false)

    // já existe linha sem forma escolhida: preenche ELA com o que falta
    const idxVazia = pagamentos.findIndex((p) => !p.forma_id)
    if (idxVazia >= 0) {
      setPagamentos(pagamentos.map((p, i) => (i === idxVazia
        ? { ...p, forma_id: formaId, maquina: maquinaDaForma(formaId), valor: falta > 0.005 ? falta.toFixed(2) : p.valor }
        : p)))
      return
    }

    // todas já têm forma e ainda falta: adiciona uma linha nova com o restante
    if (falta > 0.005) setPagamentos([...pagamentos, linhaDaForma(falta)])
  }
  // Cor do botão por TIPO da forma (grid da aba 2) — inspirado no modelo do SIGE,
  // mas na paleta do sistema. Fundo forte, texto branco.
  const corFormaBtn = (forma: typeof formas[number]): string => {
    const t = forma.tipo
    if (t === 'dinheiro') return 'bg-emerald-600 hover:bg-emerald-700'
    if (t === 'pix') return 'bg-teal-500 hover:bg-teal-600'
    if (t === 'cartao_credito') {
      if (maquinaById(forma.maquina_id ?? '')?.nome?.toLowerCase().includes('pagbank')) return 'bg-yellow-400 hover:bg-yellow-500 text-gray-900'
      return 'bg-rose-500 hover:bg-rose-600'
    }
    if (t === 'cartao_debito') return 'bg-[#1B6CA8] hover:bg-[#155a8c]'
    if (t === 'fiado') return 'bg-orange-500 hover:bg-orange-600'
    if (t === 'vale_credito') return 'bg-purple-600 hover:bg-purple-700'
    return 'bg-slate-500 hover:bg-slate-600'
  }

  // O vale JÁ é uma das linhas de `pagamentos`, então somar creditoAplicado aqui contaria
  // duas vezes.
  const totalPagoDistribuido = pagamentos.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
  const totalTaxasPg = pagamentos.reduce((s, p) => s + taxaDoItem(p), 0)
  const totalCobrado = total + totalTaxasPg
  const faltamPg = Math.max(0, total - totalPagoDistribuido)
  const excessoPg = Math.max(0, totalPagoDistribuido - total)
  const temDinheiro = pagamentos.some((p) => isDinheiroForma(p.forma_id))
  const trocoPg = temDinheiro && excessoPg > 0.005 ? excessoPg : 0
  const temFiado = pagamentos.some((p) => isFiadoForma(p.forma_id))

  // Auto-preenche o valor do pagamento com o total do carrinho (Isa 15:44): enquanto for
  // 1 forma só (fora o vale) e o operador não digitou nada, o valor segue o total menos o
  // vale. É isto que faz "aplicou vale de R$10 numa venda de R$15 → a outra linha vira
  // R$5" e que reajusta a outra linha quando o vale é editado.
  useEffect(() => {
    if (!valorAuto) return
    const idx = pagamentos.findIndex((p) => !isValeForma(p.forma_id))
    if (idx < 0 || pagamentos.filter((p) => !isValeForma(p.forma_id)).length !== 1) return
    const alvo = total > 0.005 ? Math.max(0, total - creditoAplicado).toFixed(2) : ''
    setPagamentos((prev) => (prev[idx] && prev[idx].valor !== alvo
      ? prev.map((p, i) => (i === idx ? { ...p, valor: alvo } : p))
      : prev))
  }, [total, creditoAplicado, valorAuto, pagamentos.length])

  const exigeSenhaDesconto = descontoNum > 0 && !!lojaSel?.exige_senha_desconto

  // Valida e abre o resumo de conferência antes de gravar
  const abrirConfirmacao = async () => {
    if (carrinho.length === 0) { setErro('Adicione produtos ao carrinho.'); return }
    if (!depositoId) { setErro('Selecione a loja/depósito.'); return }
    if (faltamPg > 0.01 && !pagamentos.some((p) => p.forma_id)) { setErro('Selecione a forma de pagamento.'); return }
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
      setEtapa('venda')
      setCarrinho([])
      setPagamentos([{ uid: '1', forma_id: '', valor: '', maquina: '', parcelas: 1 }])
      setValorAuto(true); setPessoaId(''); setDesconto(''); setSenhaDesconto(''); setObservacoes(''); setBuscaCliente(''); setDescontoTipo('valor'); setSaldoCredito(0); setFiadoCliente(null)
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
      // Troco: o operador digita o valor RECEBIDO em dinheiro (ex: R$100 numa venda de
      // R$80), mas o RPC exige que soma(pagamentos)+crédito bata exatamente com o total —
      // ele não sabe de troco. Sem abater aqui, TODA venda com troco era recusada
      // ("os pagamentos não fecham com a venda"), obrigando a redigitar o valor exato.
      // Abate da(s) linha(s) de dinheiro o que sobra além do total — é também o valor
      // certo pra gaveta: do R$100 recebido, R$20 volta de troco, só R$80 fica de verdade.
      let trocoRestante = trocoPg
      const pagamentosPayload: PagamentoInput[] = pagamentos
        .filter((p) => p.forma_id && !isValeForma(p.forma_id) && (parseFloat(p.valor) || 0) > 0)
        .map((p): PagamentoInput => {
          let valor = parseFloat(p.valor) || 0
          if (trocoRestante > 0.005 && isDinheiroForma(p.forma_id)) {
            const abatido = Math.min(valor, trocoRestante)
            valor -= abatido
            trocoRestante -= abatido
          }
          return {
            forma_pagamento_id: p.forma_id,
            valor,
            taxa: taxaDoItem(p),
            maquina: maquinaById(p.maquina)?.nome ?? '',   // grava o nome legível
            parcelas: p.parcelas,
            status: isFiadoForma(p.forma_id) ? 'pendente' : 'pago',
          }
        })
      const result = await finalizarVenda(
        token,
        carrinho.map(({ produto_id, nome, quantidade, preco_unitario }) => ({ produto_id, nome, quantidade, preco_unitario })),
        // ⚠️ AS LINHAS DE VALE NÃO VÃO AQUI. Elas viram o parâmetro de crédito (abaixo),
        // que é quem debita o saldo do cliente com lock e grava a linha FP_VALE em
        // pagamentos_venda. Mandar o vale nos dois lugares faria a trava do RPC
        // ("pagamentos + crédito = total") contar o valor em dobro e recusar a venda —
        // e mandar SÓ aqui gravaria o pagamento sem nunca debitar o saldo (crédito de graça).
        //
        // Linha vazia também não vai: o PDV começa com uma em branco, e quando o vale
        // cobre a compra inteira ela fica com forma vazia e R$ 0 — o RPC recebia
        // forma_pagamento_id '' e recusava a venda inteira, sem mensagem.
        pagamentosPayload,
        pessoaId || null,
        descontoNum + descontoPromo,
        observacoes,
        depositoId,
        carrinho.flatMap((i) => (i.series ?? []).map((serie) => ({ produto_id: i.produto_id, serie }))),
        creditoAplicado,   // = soma das linhas de vale. Débito atômico dentro do RPC (2026-07-10)
        descontoNum,       // desconto MANUAL (para checar permissão 'venda_desconto')
      )
      if ('erro' in result) { setErro(result.erro); return }

      const snap = {
        numero: result.vendaNumero ?? null,
        // prateleira vai junto: quem separa a peça lê no cupom onde ela está guardada
        itens: carrinho.map(({ codigo, nome, quantidade, preco_unitario, prateleira }) => ({ codigo, nome, quantidade, preco_unitario, prateleira: prateleira ?? null })),
        // O vale é uma linha como as outras, então entra no cupom naturalmente e o
        // impresso na hora fecha com a 2ª via (que lê a linha FP_VALE do banco).
        pagamentos: pagamentos
          .filter((p) => p.forma_id && (parseFloat(p.valor) || 0) > 0)
          .map((p) => ({
            forma_nome: formas.find((f) => f.id === p.forma_id)?.nome ?? p.forma_id,
            valor: parseFloat(p.valor) || 0,
            taxa: taxaDoItem(p),
            parcelas: p.parcelas,
            status: isValeForma(p.forma_id) ? 'vale' : isFiadoForma(p.forma_id) ? 'pendente' : 'pago',
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
      imprimirCupomAuto(snap, result.vendaId)   // sai sozinho (iframe, não é bloqueado como popup)
      setVendaConcluidaId(result.vendaId)
      setVendaTotal(result.total)
      setVendaSnapshot(snap)
      setMostrarConfirmacao(false)
      setEtapa('venda')
      setCarrinho([])
      setPagamentos([{ uid: '1', forma_id: '', valor: '', maquina: '', parcelas: 1 }])
      setValorAuto(true)
      setPessoaId('')
      setDesconto('')
      setSenhaDesconto('')
      setObservacoes('')
      setBuscaCliente('')
      setDescontoTipo('valor')
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
    // traz o cliente do orçamento junto (antes só vinham os itens). Como pessoas é
    // sob demanda, garante o cliente no cache pro nome aparecer no PDV.
    if (pedido.pessoa_id) {
      setPessoaId(pedido.pessoa_id)
      setBuscaCliente('')
      setPessoas((prev) => prev.some((p) => p.id === pedido.pessoa_id)
        ? prev
        : [...prev, { id: pedido.pessoa_id!, nome: pedido.pessoa_nome ?? 'Cliente' }])
    }
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
      // uma action só: fiados + limite/rotina das pessoas (o Next serializa actions,
      // duas viagens custavam o dobro)
      const { itens, infoPessoas } = await buscarCrediario(await authToken())
      setCrediarioItens(itens)
      setInfoPessoas(infoPessoas)
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
      const res = await pagarLancamentos(await authToken(), ids, forma, lojaId)
      if (!res.ok) { setErro(res.erro); return }
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
    // default: Dinheiro (ou 1ª forma não-fiado)
    const dinheiro = formas.find((f) => f.tipo === 'dinheiro') ?? formas.find((f) => f.tipo !== 'fiado')
    setFormaRecebimento(dinheiro?.id ?? '')
    setParcelasRecebimento(1)
    setMotivoDesconto('')
    setModoMistoReceb(false)
    setLinhasMisto([])
    const restante = item.valor - (item.valor_pago ?? 0)
    setValorRecebido(restante.toFixed(2).replace('.', ','))
  }

  // Recebimento misto: soma as linhas e chama a action única. Cada forma vira uma
  // entrada no caixa e no histórico. Quita se cobrir o restante.
  const handleConfirmarRecebimentoMisto = async () => {
    if (!recebendoItem) return
    const restante = Math.round((recebendoItem.valor - (recebendoItem.valor_pago ?? 0)) * 100) / 100
    const pagamentos = linhasMisto
      .map((l) => {
        const f = formas.find((x) => x.id === l.formaId)
        return { forma: f?.nome ?? '', valor: parseFloat((l.valor || '').replace(',', '.')) || 0 }
      })
      .filter((p) => p.forma && p.valor > 0)
    if (pagamentos.length === 0) { setErro('Adicione ao menos uma forma com valor.'); return }
    const soma = Math.round(pagamentos.reduce((s, p) => s + p.valor, 0) * 100) / 100
    if (soma > restante + 0.01) { setErro(`Somou ${formatBRL(soma)}, maior que o saldo em aberto (${formatBRL(restante)}).`); return }

    setPagandoCrediario(true)
    try {
      const res = await registrarPagamentoMisto(await authToken(), recebendoItem.id, pagamentos, lojaId)
      if (!res.ok) { setErro(res.erro); return }
      if (res.quitado) {
        setCrediarioItens((prev) => prev.filter((i) => i.id !== recebendoItem.id))
      } else {
        setCrediarioItens((prev) => prev.map((i) =>
          i.id === recebendoItem.id ? { ...i, valor_pago: (i.valor_pago ?? 0) + soma } : i
        ))
      }
      setRecebendoItem(null)
      setPagoCrediarioOk(true)
      setTimeout(() => setPagoCrediarioOk(false), 3000)
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : 'Erro ao registrar pagamento.')
    } finally {
      setPagandoCrediario(false)
    }
  }

  const handleConfirmarRecebimento = async () => {
    if (!recebendoItem) return
    setPagandoCrediario(true)
    try {
      const restante = recebendoItem.valor - (recebendoItem.valor_pago ?? 0)
      let valorNum = parseFloat(valorRecebido.replace(',', '.'))
      if (isNaN(valorNum) || valorNum <= 0) { setErro('Valor inválido.'); return }
      if (valorNum > restante) valorNum = restante

      // DESCONTO: não entra dinheiro. A dívida encolhe (valor cai), o valor_pago não mexe.
      if (formaRecebimento === DESCONTO_ID) {
        const res = await aplicarDescontoCrediario(await authToken(), recebendoItem.id, valorNum, motivoDesconto)
        if (!res.ok) { setErro(res.erro); return }
        const { quitado, novoValor } = res
        if (quitado) {
          setCrediarioItens((prev) => prev.filter((i) => i.id !== recebendoItem.id))
        } else {
          setCrediarioItens((prev) => prev.map((i) => (i.id === recebendoItem.id ? { ...i, valor: novoValor ?? i.valor } : i)))
        }
        setRecebendoItem(null)
        setPagoCrediarioOk(true)
        setTimeout(() => setPagoCrediarioOk(false), 3000)
        return
      }

      const fReceb = formas.find((f) => f.id === formaRecebimento)
      const ehCredReceb = fReceb?.tipo === 'cartao_credito'
      const formaTxt = (fReceb?.nome ?? 'Dinheiro') + (ehCredReceb && parcelasRecebimento > 1 ? ` ${parcelasRecebimento}x` : '')
      // passa a loja: o dinheiro do fiado entra na GAVETA do caixa aberto dela
      const res = await registrarPagamentoParcial(await authToken(), recebendoItem.id, valorNum, formaTxt, lojaId)
      if (!res.ok) { setErro(res.erro); return }
      const { quitado } = res
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
    } catch (e) {
      // mostra o motivo real (ex: "Sem permissão…") em vez do genérico
      setErro(e instanceof Error && e.message ? e.message : 'Erro ao registrar pagamento.')
    } finally {
      setPagandoCrediario(false)
    }
  }

  // Cadastro rápido de cliente pelo PDV (o balcão precisa registrar quem chegou na hora)
  const abrirNovoCliente = () => {
    setNovoNome(buscaCliente.trim())
    setNovoCpf(''); setNovoRg(''); setNovoTel(''); setNovoTabela('')
    setNovoEmail(''); setNovoNasc(''); setNovoCep(''); setNovoUf('')
    setNovoLogradouro(''); setNovoNumero(''); setNovoCidade(''); setNovoBairro(''); setNovoComplemento('')
    setNovoFoto(null)
    setNovoFotoPreview((old) => { if (old) URL.revokeObjectURL(old); return null })
    setMostrarNovoCliente(true)
  }

  const handleFotoNovo = (file: File | null) => {
    setNovoFotoPreview((old) => { if (old) URL.revokeObjectURL(old); return file ? URL.createObjectURL(file) : null })
    setNovoFoto(file)
  }

  // CEP → autopreenche endereço (ViaCEP), igual o cadastro completo
  const buscarCepNovo = async () => {
    const num = novoCep.replace(/\D/g, '')
    if (num.length !== 8) return
    setBuscandoCepNovo(true)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${num}/json/`)
      const d = await r.json()
      if (!d.erro) {
        setNovoLogradouro(d.logradouro || '')
        setNovoBairro(d.bairro || '')
        setNovoCidade(d.localidade || '')
        setNovoUf(d.uf || '')
      }
    } catch { /* silencioso — preenche na mão */ }
    setBuscandoCepNovo(false)
  }

  const handleCriarCliente = async () => {
    const nome = novoNome.trim()
    if (!nome) { setErro('Informe o nome do cliente.'); return }
    setSalvandoNovoCliente(true)
    try {
      const fd = new FormData()
      fd.set('nome', nome)
      if (novoCpf.trim()) fd.set('cpf_cnpj', novoCpf.trim())
      if (novoRg.trim()) fd.set('rg', novoRg.trim())
      if (novoTel.trim()) fd.set('telefone', novoTel.trim())
      if (novoEmail.trim()) fd.set('email', novoEmail.trim())
      if (novoNasc.trim()) fd.set('data_nascimento', novoNasc.trim())
      if (novoCep.trim()) fd.set('cep', novoCep.trim())
      if (novoUf.trim()) fd.set('estado', novoUf.trim())
      if (novoLogradouro.trim()) fd.set('endereco', novoLogradouro.trim())
      if (novoNumero.trim()) fd.set('numero', novoNumero.trim())
      if (novoCidade.trim()) fd.set('cidade', novoCidade.trim())
      if (novoBairro.trim()) fd.set('bairro', novoBairro.trim())
      if (novoComplemento.trim()) fd.set('complemento', novoComplemento.trim())
      if (novoTabela) fd.set('tabela_preco_id', novoTabela)
      if (novoFoto) fd.set('foto', novoFoto)
      const res = await criarClientePDV(await authToken(), fd)
      if (!res.ok) { setErro(res.erro); return }
      // entra no cache local e já seleciona na venda
      const nova: Pessoa = { id: res.pessoa.id, nome: res.pessoa.nome, cpf_cnpj: res.pessoa.cpf_cnpj, tabela_preco_id: res.pessoa.tabela_preco_id }
      setPessoas((prev) => [nova, ...prev.filter((p) => p.id !== nova.id)])
      setPessoaId(nova.id)
      setBuscaCliente('')
      if (nova.tabela_preco_id && tabelas.some((t) => t.id === nova.tabela_preco_id)) trocarTabela(nova.tabela_preco_id)
      setMostrarNovoCliente(false)
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : 'Erro ao cadastrar cliente.')
    } finally {
      setSalvandoNovoCliente(false)
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

  const hoje = hojeSP()
  const codCrediario = (item: CrediarioItem) => {
    if (item.codigo) return `#${item.codigo}`
    if (item.venda_numero) return `#${item.venda_numero}`          // número real da venda (#500)
    const m = item.descricao?.match(/#(\d+)/)                       // número na descrição ("Fiado #500")
    if (m) return `#${m[1]}`
    if (item.venda_id) return `#${item.venda_id.slice(-6).toUpperCase()}`  // último recurso
    return '—'
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

  // Agregado POR PESSOA: quem deve, quanto, desde quando — com limite e rotina.
  const pessoasCrediario = (() => {
    const m = new Map<string, { nome: string; n: number; devendo: number; maisAntigo: string; temVencido: boolean }>()
    for (const i of crediarioFiltrado) {
      const nome = i.pessoa_nome ?? '(sem cliente)'
      const cur = m.get(nome) ?? { nome, n: 0, devendo: 0, maisAntigo: i.created_at, temVencido: false }
      cur.n += 1
      cur.devendo += restante(i)
      if (i.created_at < cur.maisAntigo) cur.maisAntigo = i.created_at
      if (i.data_vencimento && i.data_vencimento < hoje) cur.temVencido = true
      m.set(nome, cur)
    }
    return [...m.values()].sort((a, b) => b.devendo - a.devendo)
  })()
  const totalDividas = crediarioItens.reduce((s, i) => s + restante(i), 0)
  const totalPagoCrediario = crediarioItens.reduce((s, i) => s + (i.valor_pago ?? 0), 0)
  const totalAtraso = crediarioItens.filter((i) => i.data_vencimento && i.data_vencimento < hoje).reduce((s, i) => s + restante(i), 0)
  const totalAVencer = crediarioItens.filter((i) => !i.data_vencimento || i.data_vencimento >= hoje).reduce((s, i) => s + restante(i), 0)
  const subtotalSelecionado = crediarioItens.filter((i) => selecionados.has(i.id)).reduce((s, i) => s + restante(i), 0)
  // default da forma de quitação: Dinheiro (ou a 1ª que não seja fiado)
  const formaQuitarEfetiva = formaQuitar
    || formas.find((f) => f.tipo === 'dinheiro')?.nome
    || formas.find((f) => f.tipo !== 'fiado')?.nome
    || 'Dinheiro'
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
        (v.numero != null && String(v.numero).includes(buscaVenda.trim())) ||
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

  const [reimprimindo, setReimprimindo] = useState(false)
  async function reimprimirCupom(vendaId: string) {
    setReimprimindo(true)
    try {
      const c = await buscarCupomVenda(await authToken(), vendaId)
      if (c) abrirCupom({ ...c, deposito: c.deposito ?? '' }, vendaId)
    } finally {
      setReimprimindo(false)
    }
  }

  function montarCupomHTML(snap: NonNullable<typeof vendaSnapshot>, vendaId: string): string {
    const idCurto = vendaId.replace(/-/g, '').slice(0, 8).toUpperCase()
    const brl = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',')
    const totalItens = snap.itens.reduce((s, i) => s + i.quantidade, 0)
    const subtotal   = snap.itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
    const totalTaxas = snap.pagamentos.reduce((s, p) => s + p.taxa, 0)
    const valorTotal = subtotal - snap.desconto + totalTaxas
    const numeroLabel = snap.numero != null ? String(snap.numero) : idCurto

    // Item em BLOCO (bonito no 58mm): nome na linha inteira + "qtd x preço ... total".
    // A prateleira vai encostada à direita, na MESMA linha do nome (aproveita o espaço
    // que sobrava ali) — é o que a Isa lê pra saber onde pegar a peça.
    const rowItem = (i: typeof snap.itens[0]) => {
      const desc = i.codigo ? `${i.codigo} - ${i.nome}` : i.nome
      const prat = (i as { prateleira?: string | null }).prateleira?.trim()
      const qtd = String(i.quantidade).padStart(2, '0')
      return `<div class="item">
        <div class="row item-nome-row">
          <span class="item-nome"><span class="ck"></span>${desc}</span>
          ${prat ? `<span class="prateleira">${prat}</span>` : ''}
        </div>
        <div class="row"><span class="bold">QUANTIDADE: ${qtd}</span><span>${i.quantidade} x ${brl(i.preco_unitario)}</span></div>
        <div class="row"><span></span><span class="bold">${brl(i.quantidade * i.preco_unitario)}</span></div>
      </div>`
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

    const logoUrl = window.location.origin + '/tecnocell-icon.png'
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Comprovante #${numeroLabel}</title>
    <style>
      * { box-sizing: border-box; }
      /* térmica 58mm: define a página pro navegador não usar A4 (senão o rolo
         imprime uma folha inteira de papel). auto = só a altura do conteúdo. */
      @page { size: 58mm auto; margin: 0; }
      body { font-family: monospace; font-size: 10px; margin: 0 auto; padding: 5px 4px; width: 58mm; }
      .bold { font-weight: bold; }
      .sep { border: none; border-top: 1px dashed #000; margin: 6px 0; }
      .row { display: flex; justify-content: space-between; margin: 2px 0; }
      .item { margin: 4px 0; }
      .item-nome { text-align: left; word-break: break-word; }
      /* prateleira: encostada na direita da linha do nome, no espaço que sobrava */
      .item-nome-row { align-items: flex-start; gap: 6px; }
      .prateleira { flex: none; font-weight: bold; white-space: nowrap; border: 1px solid #000; padding: 0 3px; }
      /* caixa de seleção pro conferente marcar à mão o que já separou */
      .ck { display: inline-block; width: 11px; height: 11px; border: 1px solid #000; margin-right: 5px; vertical-align: middle; flex: none; }
      .assina { text-align: left; margin: 3px 0; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      th { border-bottom: 1px dashed #000; padding: 2px 0; text-align: left; }
      td { padding: 2px 0; vertical-align: top; }
      p { margin: 1px 0; text-align: center; }
      @media print { html, body { width: 58mm; margin: 0; padding: 3px 4px; } }
    </style></head><body>

    <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:4px">
      <img src="${snap.lojaLogo || logoUrl}" style="width:36px;height:36px;object-fit:contain;flex-shrink:0" />
      <span class="bold" style="text-align:left;font-size:11px;line-height:1.15">${snap.lojaRazao || snap.loja || 'TecnoCell'}</span>
    </div>
    ${snap.lojaCnpj || snap.lojaIE ? `<p>${snap.lojaCnpj ? `CNPJ: ${snap.lojaCnpj}` : ''}${snap.lojaCnpj && snap.lojaIE ? ' &nbsp; ' : ''}${snap.lojaIE ? `IE: ${snap.lojaIE}` : ''}</p>` : ''}
    ${snap.lojaEndereco ? `<p>${snap.lojaEndereco}</p>` : ''}
    ${snap.lojaTelefone ? `<p>Tel: ${snap.lojaTelefone}</p>` : ''}

    <hr class="sep">
    <p class="bold" style="font-size:13px">COMPROVANTE DE VENDA</p>
    <p>&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt; SEM VALOR FISCAL &lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</p>

    <hr class="sep">
    <p class="bold">Itens da Venda</p>
    <hr class="sep">
    ${snap.itens.map(rowItem).join('')}

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
    ${snap.deposito && snap.deposito !== snap.loja && !(snap.loja && snap.deposito.toUpperCase().includes(snap.loja.toUpperCase())) ? `<p>${snap.deposito}</p>` : ''}
    ${snap.vendedor ? `<p>Vendedor(a): ${snap.vendedor}</p>` : ''}
    <p class="bold">CONSUMIDOR</p>
    ${snap.cliente ? `<p>${snap.cliente}</p>` : '<p>CONSUMIDOR FINAL</p>'}
    ${snap.clienteEndereco ? `<p style="text-align:left"><b>Entrega:</b> ${snap.clienteEndereco}</p>` : ''}

    <hr class="sep">
    <p class="assina bold">Conferência: __________________</p>
    <p class="assina bold">Separação: ____________________</p>

    <hr class="sep">
    ${snap.lojaTermos ? `<p style="font-size:9px;text-align:left;white-space:pre-wrap">${snap.lojaTermos.replace(/</g, '&lt;')}</p><hr class="sep">` : ''}
    <p>Obrigado pela preferência!</p>
    <p style="margin-top:4px">www.tecnocell.com.br</p>

    </body></html>`
  }

  // Popup — 2ª via / reimpressão (é clique direto do usuário, o navegador não bloqueia)
  function abrirCupom(snap: NonNullable<typeof vendaSnapshot>, vendaId: string) {
    const win = window.open('', '_blank', 'width=420,height=700')
    if (!win) { imprimirCupomAuto(snap, vendaId); return }  // popup barrado -> cai no iframe
    win.document.write(montarCupomHTML(snap, vendaId))
    win.document.close()
    setTimeout(() => win.print(), 400)
  }

  // AUTOMÁTICO logo após finalizar a venda. Antes usava window.open (popup) — mas
  // popup aberto DEPOIS do await da venda perde o "gesto do clique" e o navegador
  // BLOQUEIA, então o cupom não saía sozinho. Um iframe oculto não é bloqueado.
  // Pra pular até o diálogo de impressão, rodar o Chrome do balcão com --kiosk-printing.
  function imprimirCupomAuto(snap: NonNullable<typeof vendaSnapshot>, vendaId: string) {
    const iframe = document.createElement('iframe')
    Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow?.document
    if (!doc) { iframe.remove(); return }
    doc.open(); doc.write(montarCupomHTML(snap, vendaId)); doc.close()
    let feito = false
    const imprimir = () => {
      if (feito) return
      feito = true
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print() } catch { /* ignora */ }
      setTimeout(() => iframe.remove(), 2000)
    }
    iframe.onload = () => setTimeout(imprimir, 300)  // espera o layout + a logo carregar
    setTimeout(imprimir, 1200)                        // rede: fallback se onload não vier
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Coluna esquerda — busca + carrinho */}
      <div className="space-y-4 min-w-0">
        {/* Aviso: caixa da loja fechado — bloqueia a venda (Isa) */}
        {!caixaAberto && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
            <span className="text-sm font-medium text-amber-800">🔒 O caixa desta loja está fechado — abra o caixa pra registrar vendas.</span>
            <a href="/painel/pdv/operacao" className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 transition">Abrir caixa →</a>
          </div>
        )}
        {/* Barra de ações */}
        <div className="flex justify-end gap-2">
          <a
            href="/painel/pdv/operacao"
            className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition shadow-sm"
          >
            🧾 Caixa / Operação
          </a>
          <button
            type="button"
            onClick={abrirVendas}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition shadow-sm"
          >
            🔍 Buscar Vendas
          </button>
        </div>

        {/* Seletores de loja, depósito e tabela de preço — quebram fluido ao apertar */}
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-1 basis-52 min-w-0 items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-500/40">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide shrink-0">Loja</label>
            <select
              value={lojaId}
              onChange={(e) => trocarLoja(e.target.value)}
              className="flex-1 min-w-0 cursor-pointer bg-transparent text-sm font-medium text-gray-800 focus:outline-none"
            >
              {lojas.length === 0 && <option value="">Nenhuma loja</option>}
              {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>
          <div className="flex flex-1 basis-52 min-w-0 items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-500/40">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide shrink-0">Estoque</label>
            <select
              value={depositoId}
              onChange={(e) => trocarDeposito(e.target.value)}
              className="flex-1 min-w-0 cursor-pointer bg-transparent text-sm font-medium text-gray-800 focus:outline-none"
            >
              {depositosDaLoja.length === 0 && <option value="">Sem depósito nesta loja</option>}
              {depositosDaLoja.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </div>
          <div className="flex flex-1 basis-52 min-w-0 items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-500/40">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide shrink-0">Tabela</label>
            <select
              value={tabelaId}
              onChange={(e) => trocarTabela(e.target.value)}
              className="flex-1 min-w-0 cursor-pointer bg-transparent text-sm font-medium text-gray-800 focus:outline-none"
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
                {/* Badge da tabela: a menina precisa VER que preço está pegando.
                    Verde = ATACADO1 (mais barato) · Laranja = ATACADO2 (mais caro). */}
                {(() => {
                  const b = badgeTabela(clienteSelecionado.tabela_preco_id, tabelas)
                  return b ? <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${b.cls}`}>{b.txt}</span> : null
                })()}
                {clienteSelecionado.cpf_cnpj && <span className="text-xs text-gray-400">{clienteSelecionado.cpf_cnpj}</span>}
                <button type="button" onClick={() => { setPessoaId(''); setBuscaCliente('') }}
                  className="ml-auto text-xs font-medium text-red-400 hover:text-red-600">✕</button>
              </div>
              {/* Cliente problemático — AVISA, não bloqueia (decisão do Vitor) */}
              {clienteSelecionado.nao_vender && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5">
                  <span className="text-xs font-bold text-red-700">🚫 NÃO VENDER</span>
                  {clienteSelecionado.nao_vender_motivo && (
                    <span className="text-xs text-red-600">· {clienteSelecionado.nao_vender_motivo}</span>
                  )}
                </div>
              )}
              {/* Saldo do vale: INFORMAÇÃO, sem botão. Aplicar é no botão Vale Crédito do
                  grid de pagamento — ter dois lugares que aplicam o mesmo crédito só
                  gerava dúvida sobre qual valia. */}
              {saldoCredito > 0.01 && (
                <div className="flex items-center gap-2 rounded-lg bg-purple-50 border border-purple-200 px-2.5 py-1.5">
                  <span className="text-xs font-medium text-purple-700">🎟️ Saldo em conta: {formatBRL(saldoCredito)}</span>
                  <span className="ml-auto text-[11px] text-purple-400">use no botão Vale Crédito ao pagar</span>
                </div>
              )}
              {fiadoCliente && fiadoCliente.devendo > 0.01 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5">
                  <span className="text-xs font-semibold text-amber-700">⚠️ Já deve {formatBRL(fiadoCliente.devendo)} em fiado</span>
                  {fiadoCliente.limite > 0 && (
                    <span className={`text-xs font-medium ${fiadoCliente.disponivel > 0 ? 'text-gray-500' : 'text-red-600 font-bold'}`}>
                      · limite {formatBRL(fiadoCliente.limite)} · {fiadoCliente.disponivel > 0 ? `disponível ${formatBRL(fiadoCliente.disponivel)}` : 'LIMITE ESTOURADO'}
                    </span>
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
              <button type="button" onClick={abrirNovoCliente}
                className="shrink-0 rounded-lg border border-blue-200 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition">
                + novo
              </button>
            </div>
          )}
          {clientesFiltrados.length > 0 && (
            <div className="animate-pop-in absolute top-full left-0 right-0 z-20 mt-1 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
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
            <div className="absolute top-full left-0 right-0 z-20 mt-1 flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs text-gray-400 shadow-lg">
              <span>{buscandoClientes ? 'Buscando…' : 'Nenhum cliente encontrado.'}</span>
              {!buscandoClientes && (
                <button type="button" onClick={abrirNovoCliente}
                  className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1 font-semibold text-white hover:bg-blue-700 transition">
                  + Cadastrar &quot;{buscaCliente.trim()}&quot;
                </button>
              )}
            </div>
          )}
        </div>

        <div className="relative">
          <input
            ref={buscaRef}
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setErro(null) }}
            onKeyDown={(e) => {
              if (produtosFiltrados.length === 0) return
              if (e.key === 'ArrowDown') { e.preventDefault(); setBuscaSel((i) => Math.min(i + 1, produtosFiltrados.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setBuscaSel((i) => Math.max(i - 1, 0)) }
              else if (e.key === 'Enter') {
                e.preventDefault()
                const alvo = produtosFiltrados[buscaSel] ?? produtosFiltrados[0]
                if (alvo) { adicionarAoCarrinho(alvo); setBusca(''); setBuscaSel(0); buscaRef.current?.focus() }
              }
            }}
            onKeyDownCapture={(e) => {
              // Esc com texto: limpa a busca aqui e não deixa o handler global fechar outra coisa
              if (e.key === 'Escape' && busca.length > 0) { e.preventDefault(); e.stopPropagation(); setBusca(''); setBuscaSel(0) }
            }}
            placeholder="Buscar produto por nome ou código...  (F2)"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          {/* spinner enquanto busca; ✕ pra limpar quando tem texto */}
          {buscandoProdutos ? (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"><Spinner /></span>
          ) : busca.length > 0 ? (
            <button
              type="button"
              onClick={() => { setBusca(''); setBuscaSel(0); buscaRef.current?.focus() }}
              title="Limpar busca (Esc)"
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
            >
              ✕
            </button>
          ) : null}
          {produtosFiltrados.length > 0 && (
            <div className="animate-pop-in absolute top-full left-0 right-0 z-10 mt-1 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
              <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
              {produtosFiltrados.map((p, idx) => {
                const disp = saldoNoDeposito(p)
                const ativo = idx === buscaSel
                return (
                <div key={p.id} ref={ativo ? linhaAtivaRef : null} className={`flex items-center border-b border-gray-50 last:border-b-0 ${ativo ? 'bg-blue-50' : ''}`}>
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
              </div>
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
            <div className="animate-pop-in absolute top-full left-0 right-0 z-10 mt-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-400 shadow-lg">
              {buscandoProdutos ? 'Buscando…' : 'Nenhum produto encontrado.'}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          {carrinho.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="text-sm text-gray-400">
                <p className="font-medium text-gray-500">Nenhum item no carrinho</p>
                <p>Busque um produto acima <span className="text-gray-300">(F2)</span></p>
              </div>
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
                  <tr key={item.produto_id} className="hover:bg-blue-50/60">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-800">
                        {item.codigo && <span className="text-gray-400 font-normal">{item.codigo} · </span>}{item.nome}
                      </p>
                      <p className="text-xs text-gray-400">
                        Disponível: {item.estoque_disponivel}
                        {item.prateleira && <span className="text-blue-600 font-medium"> · 📦 {item.prateleira}</span>}
                      </p>
                      {promosDoProduto(item.produto_id).length > 0 && (() => {
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
                            {promosDoProduto(item.produto_id).map((p) => (
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
                    {/* Preço abaixo do custo fica VERMELHO com aviso. Existem 177 produtos
                        cadastrados com custo maior que o preço (achado em 20/07): a venda
                        dava prejuízo e nada na tela indicava. Avisa, não bloqueia — pode ser
                        queima de estoque proposital, e quem decide isso é quem está no balcão. */}
                    {(() => {
                      const custo = Number(item.preco_custo ?? 0)
                      const abaixo = custo > 0 && item.preco_unitario < custo
                      return (
                        <td className={`px-4 py-3 text-right text-sm ${abaixo ? 'font-bold text-red-600' : 'text-gray-600'}`}>
                          {formatBRL(item.preco_unitario)}
                          {abaixo && (
                            <span className="block text-[11px] font-medium text-red-500"
                              title={`Custo desta peça: ${formatBRL(custo)}`}>
                              ⚠ abaixo do custo ({formatBRL(custo)})
                            </span>
                          )}
                        </td>
                      )
                    })()}
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
              <span className="font-semibold tabular-nums">{totalItens}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatBRL(subtotal)}</span>
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
            {descontoNum > 0 && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>Desconto aplicado{descontoTipo === 'percent' ? ` (${parseFloat(desconto) || 0}%)` : ''}</span>
                <span className="font-medium text-red-500">− {formatBRL(descontoNum)}</span>
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
            <div className="mt-1 flex items-center justify-between rounded-xl bg-blue-50/70 px-3.5 py-3">
              <span className="text-sm font-semibold uppercase tracking-wide text-gray-600">Total</span>
              <span className="text-2xl font-bold tabular-nums text-blue-700">{formatBRL(totalCobrado)}</span>
            </div>
          </div>

          {/* ABA 1 → botão que leva pra tela de pagamento. A forma saiu da 1ª tela
              (pedido da Isa): primeiro monta a venda, depois escolhe como pagou. */}
          {etapa === 'venda' && (
            <button
              type="button"
              onClick={() => { if (carrinho.length > 0 && caixaAberto) { setErro(null); setEtapa('pagamento') } }}
              disabled={carrinho.length === 0 || !caixaAberto}
              title={!caixaAberto ? 'Abra o caixa da loja pra vender' : undefined}
              className="w-full rounded-xl bg-gradient-to-r from-green-600 to-green-500 py-3.5 text-sm font-bold text-white shadow-sm shadow-green-600/25 hover:from-green-700 hover:to-green-600 disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed transition"
            >
              {!caixaAberto ? '🔒 Caixa fechado — abra pra vender'
                : carrinho.length === 0 ? 'Adicione produtos pra vender'
                : <span className="inline-flex items-center gap-2">Ir para pagamento <span className="tabular-nums">{formatBRL(totalCobrado)}</span> →</span>}
            </button>
          )}

          {/* PAGAMENTO em MODAL centralizado (estilo SIGE): ao "Ir para pagamento" a
              operadora cai DIRETO no pagamento, sempre 100% visível, sem rolar a tela.
              É fixed inset-0 → renderiza como overlay independente de onde está no JSX. */}
          {etapa === 'pagamento' && (
            <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              onClick={(e) => { if (e.target === e.currentTarget) setEtapa('venda') }}>
              <div className="animate-pop-in flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
                  <button type="button" onClick={() => setEtapa('venda')}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition">← Voltar</button>
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">Como foi pago?</span>
                  <span className="text-xl font-extrabold tabular-nums text-[#1B6CA8]">{formatBRL(totalCobrado)}</span>
                </div>
                <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div>
              <div className="grid grid-cols-2 gap-2.5">
                {formasVisiveis.map((f, i) => {
                  const ativa = pagamentos.length === 1 && pagamentos[0].forma_id === f.id
                  return (
                    <button key={f.id} type="button" onClick={() => escolherFormaGrid(f.id)}
                      className={`relative flex min-h-[82px] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 font-bold text-white shadow-sm transition ${corFormaBtn(f)} ${ativa ? 'scale-[1.03] ring-2 ring-[#1B6CA8] ring-offset-2' : 'opacity-95 hover:opacity-100 hover:shadow-md'}`}>
                      <span className="absolute right-1.5 top-1.5 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold leading-none">F{i + 1}</span>
                      <span className="text-2xl leading-none">{iconeForma(f.nome)}</span>
                      <span className="text-center text-xs leading-tight">{f.nome}</span>
                    </button>
                  )
                })}
              </div>
            </div>

          <div className="space-y-3 border-t border-gray-100 pt-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">
                Valor e ajustes <span className="font-normal">(cartão · dividir · troco)</span>
              </label>
              <div className="space-y-2">
                {creditoAplicado > 0 && saldoCredito - creditoAplicado > 0.005 && (
                  <p className="px-1 text-[11px] text-purple-400">
                    Sobra {formatBRL(saldoCredito - creditoAplicado)} de saldo pro cliente usar depois.
                  </p>
                )}

                {pagamentos.map((p) => (
                  <div key={p.uid} className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      {/* O dropdown de forma só aparece na DIVISÃO (2+ formas), pra escolher
                          a outra. Na venda de 1 forma o grid de botões acima já escolheu —
                          senão seria a mesma coisa duas vezes (a Isa reparou).
                          Com VALE aplicado também aparece: a linha que sobra é a "outra
                          forma" da divisão e precisa ser escolhida em algum lugar. */}
                      {pagamentos.length > 1 || creditoAplicado > 0 ? (
                        <select
                          value={p.forma_id}
                          onChange={(e) => setPagamentos((prev) => {
                            const novaForma = e.target.value
                            const outros = prev.filter((x) => x.uid !== p.uid).reduce((s, x) => s + (parseFloat(x.valor) || 0), 0)
                            // virou vale: o valor não pode passar do saldo que sobra
                            const bruto = total - outros
                            const restante = isValeForma(novaForma) ? Math.min(bruto, tetoValeLinha(p.uid)) : bruto
                            return prev.map((x) =>
                              x.uid === p.uid
                                ? { ...x, forma_id: novaForma, maquina: maquinaDaForma(novaForma), parcelas: 1,
                                    valor: (!x.valor || parseFloat(x.valor) === 0) && restante > 0
                                      ? restante.toFixed(2)
                                      : (isValeForma(novaForma)
                                          ? Math.min(parseFloat(x.valor) || 0, tetoValeLinha(p.uid)).toFixed(2)
                                          : x.valor) }
                                : x
                            )
                          })}
                          className={`flex-1 rounded-lg border bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${p.forma_id ? 'border-gray-200' : 'border-amber-400 text-amber-700'}`}
                        >
                          <option value="" disabled>Selecione a forma…</option>
                          {formasVisiveis.map((f) => <option key={f.id} value={f.id}>{iconeForma(f.nome)} {f.nome}</option>)}
                        </select>
                      ) : (
                        <span className="flex flex-1 items-center gap-1.5 text-sm font-semibold text-gray-700">
                          {iconeForma(nomeDaForma(p.forma_id))} {nomeDaForma(p.forma_id)}
                        </span>
                      )}
                      <div className="w-32">
                        <CampoDinheiro
                          value={parseFloat(p.valor) || 0}
                          // Editar o VALE não sai do modo automático de propósito: assim a
                          // outra linha reajusta sozinha (vale 10 → PIX 5; baixou o vale
                          // pra 3 → PIX vira 12). Editar uma forma normal continua travando
                          // o valor, como sempre foi.
                          onChange={(r) => {
                            const ehVale = isValeForma(p.forma_id)
                            if (!ehVale) setValorAuto(false)
                            const v = ehVale ? Math.min(r, tetoValeLinha(p.uid)) : r
                            setPagamentos((prev) => prev.map((x) => (x.uid === p.uid ? { ...x, valor: String(v) } : x)))
                          }}
                          // clicou num campo vazio: já joga o que falta pra fechar a venda.
                          // (p.valor continua '' até alguém digitar, então o auto-preencher
                          // não confunde o R$ 0,00 que a máscara mostra com um valor digitado.)
                          onFocus={() => {
                            if (!p.valor) {
                              const outros = pagamentos.filter((x) => x.uid !== p.uid).reduce((s, x) => s + (parseFloat(x.valor) || 0), 0)
                              const restante = isValeForma(p.forma_id)
                                ? Math.min(total - outros, tetoValeLinha(p.uid))
                                : total - outros
                              if (restante > 0) setPagamentos((prev) => prev.map((x) =>
                                x.uid === p.uid ? { ...x, valor: restante.toFixed(2) } : x
                              ))
                            }
                          }}
                          className="w-full"
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
            {(totalPagoDistribuido > 0 || creditoAplicado > 0) && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 space-y-1 text-xs">
                {creditoAplicado > 0 && (
                  <div className="flex justify-between font-semibold text-green-700">
                    <span>🏦 Crédito da loja</span>
                    <span>− {formatBRL(creditoAplicado)}</span>
                  </div>
                )}
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
                </div>{/* fim do corpo rolável do modal */}
                <div className="shrink-0 border-t border-gray-100 p-4">
                  <button
                    type="button"
                    onClick={abrirConfirmacao}
                    disabled={carrinho.length === 0 || loading || !caixaAberto}
                    title={!caixaAberto ? 'Abra o caixa da loja pra vender' : undefined}
                    className="w-full rounded-xl bg-gradient-to-r from-green-600 to-green-500 py-3.5 text-sm font-bold text-white shadow-sm shadow-green-600/25 hover:from-green-700 hover:to-green-600 disabled:from-gray-300 disabled:to-gray-300 disabled:text-white disabled:shadow-none disabled:cursor-not-allowed transition"
                  >
                    {loading ? <span className="inline-flex items-center gap-2"><Spinner />Finalizando…</span>
                      : !caixaAberto ? '🔒 Caixa fechado — abra pra vender'
                      : <span className="inline-flex items-center gap-2">Finalizar Venda <span className="tabular-nums">{formatBRL(totalCobrado)}</span></span>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {carrinho.length > 0 && (
            <button
              type="button"
              onClick={handleSalvarOrcamento}
              disabled={salvandoOrc}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-blue-200 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50 transition"
            >
              {salvandoOrc && <Spinner />}{salvandoOrc ? 'Salvando...' : '📋 Salvar como orçamento (finalizar depois)'}
            </button>
          )}

          {msgOrc && (
            <p className="rounded-xl bg-green-50 border border-green-200 px-3 py-2 text-center text-xs font-medium text-green-700">{msgOrc}</p>
          )}

          {carrinho.length > 0 && (
            <button
              type="button"
              onClick={() => { if (confirm(`Limpar o carrinho? ${totalItens} ${totalItens === 1 ? 'item será removido' : 'itens serão removidos'}.`)) { setCarrinho([]); setEtapa('venda'); setErro(null) } }}
              className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-red-500 hover:border-red-200 transition"
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
          <a href="/painel/devolucoes" className="ml-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 transition"><kbd className="mr-1 rounded border border-gray-300 bg-white px-1 py-0.5 font-mono text-[10px]">F7</kbd> ↩ Devoluções</a>
          <button type="button" onClick={() => { setOsNumInput(''); setOsReceb(null); setMsgOSReceb(''); setMostrarReceberOS(true) }}
            className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 transition">🔧 Receber OS</button>
        </div>
      </div>

      {/* Modal — Receber OS (Opção B, reusa receberOS) */}
      {mostrarReceberOS && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setMostrarReceberOS(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">🔧 Receber Ordem de Serviço</h3>
              <button onClick={() => setMostrarReceberOS(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition">✕</button>
            </div>
            <div className="mt-4 flex gap-2">
              <input value={osNumInput} onChange={(e) => setOsNumInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscarOS()}
                type="number" placeholder="Nº da OS" className="field flex-1" autoFocus />
              <button onClick={buscarOS} disabled={buscandoOS} className="rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">{buscandoOS ? '...' : 'Buscar'}</button>
            </div>
            {osReceb && (
              <div className="mt-4 rounded-xl border border-gray-200 p-3">
                <p className="text-sm font-semibold text-gray-800">OS #{osReceb.numero} · {osReceb.pessoa_nome ?? 'Consumidor'}</p>
                <p className="text-xs text-gray-500">{osReceb.equipamento ?? '—'}</p>
                <p className="mt-1 text-2xl font-extrabold text-green-600">{formatBRL(osReceb.total)}</p>
                {!osReceb.recebido_em && (
                  <div className="mt-3">
                    <label className="block text-xs text-gray-500 mb-1">Forma de pagamento</label>
                    <select value={formaOSReceb} onChange={(e) => setFormaOSReceb(e.target.value)} className="field w-full">
                      {formasRecebimento.map((f) => <option key={f.id} value={f.nome}>{f.nome}</option>)}
                    </select>
                    <button onClick={confirmarReceberOS} disabled={recebendoOS || !formaOSReceb}
                      className="mt-3 w-full rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50 transition">{recebendoOS ? 'Recebendo…' : 'Confirmar recebimento'}</button>
                  </div>
                )}
              </div>
            )}
            {msgOSReceb && <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${msgOSReceb.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{msgOSReceb}</p>}
          </div>
        </div>
      )}

      {/* Modal de conferência da venda */}
      {mostrarConfirmacao && (
        <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
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
                {/* Só as linhas que vão MESMO virar pagamento. Quando o vale cobre a venda
                    inteira sobra uma linha sem forma e com R$ 0,00 — mostrá-la faria a
                    soma não bater. O vale aparece aqui como qualquer outra forma. */}
                {pagamentos.filter((p) => p.forma_id && (parseFloat(p.valor) || 0) > 0).map((p) => {
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
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-green-700 transition disabled:opacity-50">
                {loading && <Spinner />}{loading ? 'Processando...' : 'Confirmar venda'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Crediário (F9) */}
      {mostrarCrediario && (
        <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-lg font-bold text-gray-900">Crediário — A Receber (Fiado)</h3>
              <button type="button" onClick={() => setMostrarCrediario(false)}
                className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
            </div>

            {/* Filtros */}
            <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-3">
              <div className="flex shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs font-semibold">
                <button type="button" onClick={() => setVisaoCrediario('vendas')}
                  className={`rounded-md px-2.5 py-1.5 transition ${visaoCrediario === 'vendas' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'}`}>
                  Por venda
                </button>
                <button type="button" onClick={() => setVisaoCrediario('pessoas')}
                  className={`rounded-md px-2.5 py-1.5 transition ${visaoCrediario === 'pessoas' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'}`}>
                  Por pessoa
                </button>
              </div>
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

            {/* Barra de quitação em lote — a seleção já existia e somava, mas não havia
                botão nenhum pra cobrar o selecionado (Isa: "quitar todas de uma vez só"). */}
            {selecionados.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-blue-50 px-5 py-3">
                <p className="text-sm font-semibold text-blue-900">
                  {selecionados.size} {selecionados.size === 1 ? 'nota selecionada' : 'notas selecionadas'} · {formatBRL(subtotalSelecionado)}
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={formaQuitarEfetiva}
                    onChange={(e) => setFormaQuitar(e.target.value)}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {formasRecebimento.map((f) => (
                      <option key={f.id} value={f.nome}>{f.nome}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={pagandoCrediario}
                    onClick={() => handlePagarCrediario([...selecionados], formaQuitarEfetiva)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-green-700 disabled:opacity-60"
                  >
                    {pagandoCrediario && <Spinner />}
                    {pagandoCrediario ? 'Quitando…' : `Quitar ${formatBRL(subtotalSelecionado)}`}
                  </button>
                  <button type="button" onClick={() => setSelecionados(new Set())}
                    className="px-1 text-sm text-gray-500 transition hover:text-gray-700">
                    Limpar
                  </button>
                </div>
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
              ) : visaoCrediario === 'pessoas' ? (
                /* POR PESSOA — quem deve, quanto, o limite e o combinado de pagamento.
                   O saldo alto de quem "paga no fim do dia" é rotina, não inadimplência. */
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="text-left text-xs font-semibold uppercase text-gray-500">
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Combinado</th>
                      <th className="px-4 py-3 text-center">Fiados</th>
                      <th className="px-4 py-3 text-right">Devendo</th>
                      <th className="px-4 py-3">Limite</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pessoasCrediario.map((pp) => {
                      const info = infoPessoas[pp.nome]
                      const limite = info?.limite ?? 0
                      const rot = rotulaRotina(info?.rotina)
                      const pct = limite > 0 ? (pp.devendo / limite) * 100 : null
                      const estourou = pct !== null && pct >= 100
                      return (
                        <tr key={pp.nome} className="hover:bg-blue-50/50 transition">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-800">{pp.nome}</p>
                            {pp.temVencido && <span className="text-[11px] font-semibold text-red-600">tem fiado vencido</span>}
                          </td>
                          <td className="px-4 py-3">
                            {rot
                              ? <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">{rot.icone} {rot.label}</span>
                              : <span className="text-xs text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600">{pp.n}</td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-gray-900">{formatBRL(pp.devendo)}</td>
                          <td className="px-4 py-3">
                            {limite > 0 ? (
                              <div className="w-32">
                                <div className="flex justify-between text-[11px] tabular-nums">
                                  <span className={estourou ? 'font-bold text-red-600' : 'text-gray-500'}>{Math.round(pct!)}%</span>
                                  <span className="text-gray-400">{formatBRL(limite)}</span>
                                </div>
                                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                                  <div className={`h-full rounded-full ${estourou ? 'bg-red-500' : pct! >= 75 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                                    style={{ width: `${Math.min(100, pct!)}%` }} />
                                </div>
                                {estourou && <p className="mt-0.5 text-[10px] font-semibold text-red-600">estourou o limite</p>}
                              </div>
                            ) : <span className="text-xs text-gray-300">sem limite</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button type="button"
                              onClick={() => { setBuscaCrediario(pp.nome); setVisaoCrediario('vendas') }}
                              className="rounded-lg border border-blue-200 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition">
                              ver fiados →
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
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
                        <tr key={item.id} className={`hover:bg-blue-50/60 ${sel ? 'bg-blue-50' : ''}`}>
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
      {recebendoItem && (() => {
      const ehDesconto = formaRecebimento === DESCONTO_ID
      const restanteReceb = recebendoItem.valor - (recebendoItem.valor_pago ?? 0)
      const descontoNum = parseFloat((valorRecebido || '').replace(',', '.')) || 0
      return (
        <div className="animate-fade-in fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
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

              {/* Uma forma × Misto — no misto o cliente paga parte em dinheiro, parte no Pix etc. */}
              {!ehDesconto && (
                <div className="flex gap-1 rounded-xl bg-gray-100 p-1 text-xs font-semibold">
                  <button type="button" onClick={() => setModoMistoReceb(false)}
                    className={`flex-1 rounded-lg py-1.5 transition ${!modoMistoReceb ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
                    Uma forma
                  </button>
                  <button type="button"
                    onClick={() => {
                      setModoMistoReceb(true)
                      if (linhasMisto.length === 0) {
                        const dinheiro = formas.find((f) => f.tipo === 'dinheiro') ?? formas.find((f) => f.tipo !== 'fiado')
                        setLinhasMisto([{ formaId: dinheiro?.id ?? '', valor: '' }])
                      }
                    }}
                    className={`flex-1 rounded-lg py-1.5 transition ${modoMistoReceb ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
                    ⚡ Misto
                  </button>
                </div>
              )}

              {/* Valor a receber (editável) — vira "valor do desconto" quando é perdão de dívida. Oculto no misto (cada linha tem seu valor). */}
              {!modoMistoReceb && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {ehDesconto ? 'Valor do desconto' : 'Valor recebido'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={valorRecebido}
                    onChange={(e) => setValorRecebido(e.target.value)}
                    className={`w-full rounded-xl border py-3 pl-9 pr-4 text-right text-lg font-bold focus:outline-none focus:ring-2 ${ehDesconto ? 'border-amber-300 bg-amber-50/50 text-amber-800 focus:ring-amber-500' : 'border-gray-200 text-gray-900 focus:ring-blue-500'}`}
                  />
                </div>
              </div>
              )}

              {/* Forma de pagamento — formas reais (a máquina TON/PagBank vem na forma). No misto some (as formas viram linhas abaixo). */}
              {!modoMistoReceb && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Forma de recebimento
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {formasRecebimento.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => { setFormaRecebimento(f.id); setParcelasRecebimento(1) }}
                      className={`rounded-xl border py-2.5 text-sm font-semibold transition ${formaRecebimento === f.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                    >
                      {iconeForma(f.nome)} {f.nome}
                    </button>
                  ))}
                  {/* Desconto — fica junto das formas porque é aqui que se procura, mas é
                      abatimento de dívida, não dinheiro. Âmbar pra não parecer pagamento. */}
                  <button
                    type="button"
                    onClick={() => { setFormaRecebimento(DESCONTO_ID); setParcelasRecebimento(1) }}
                    className={`rounded-xl border py-2.5 text-sm font-semibold transition ${ehDesconto ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-dashed border-gray-300 bg-white text-gray-600 hover:border-amber-300 hover:text-amber-700'}`}
                  >
                    🏷️ Desconto
                  </button>
                </div>

                {ehDesconto && (
                  <div className="mt-3 space-y-2">
                    <input
                      type="text"
                      value={motivoDesconto}
                      onChange={(e) => setMotivoDesconto(e.target.value)}
                      placeholder="Motivo (ex: arredondamento, negociação)"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      Desconto <b>não entra no caixa</b> — ele abate a dívida.
                      {' '}Em aberto: <b className="tabular-nums">{formatBRL(restanteReceb)}</b>
                      {descontoNum > 0 && <> → passa a <b className="tabular-nums">{formatBRL(Math.max(0, restanteReceb - descontoNum))}</b></>}
                      {descontoNum >= restanteReceb && restanteReceb > 0 && <span className="mt-0.5 block text-[11px] text-amber-600/80">Perdoa o restante e quita a dívida.</span>}
                    </p>
                  </div>
                )}

                {!ehDesconto && (() => {
                  const sel = formas.find((f) => f.id === formaRecebimento)
                  const maq = maquinaById(maquinaDaForma(formaRecebimento))
                  const ehDeb = sel?.tipo === 'cartao_debito'
                  const ehCred = sel?.tipo === 'cartao_credito'
                  const valorNum = parseFloat((valorRecebido || '').replace(',', '.')) || 0
                  const pct = !maq ? 0 : ehDeb ? maq.taxa_debito : ehCred ? (maq.taxas_credito[parcelasRecebimento - 1] ?? 0) : 0
                  const taxaV = Math.round(valorNum * pct) / 100
                  return (
                    <>
                      {ehCred && maq && (
                        <div className="mt-3">
                          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Parcelas</label>
                          <select value={parcelasRecebimento} onChange={(e) => setParcelasRecebimento(Number(e.target.value))}
                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                            {Array.from({ length: maq.max_parcelas }, (_, i) => i + 1).map((n) => (
                              <option key={n} value={n}>{n}x{n === 1 ? ' à vista' : ''}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {(ehDeb || ehCred) && pct > 0 && valorNum > 0 && (
                        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                          Taxa {maq?.nome} {pct}% = −{formatBRL(taxaV)} · você recebe líquido <b className="tabular-nums">{formatBRL(valorNum - taxaV)}</b>
                          <span className="mt-0.5 block text-[11px] text-amber-600/80">(a dívida abate o valor cheio; a taxa é o custo da maquininha)</span>
                        </p>
                      )}
                    </>
                  )
                })()}
              </div>
              )}

              {/* Recebimento MISTO — uma linha por forma, cada uma com seu valor */}
              {modoMistoReceb && (() => {
                const somaMisto = Math.round(linhasMisto.reduce((s, l) => s + (parseFloat((l.valor || '').replace(',', '.')) || 0), 0) * 100) / 100
                const faltam = Math.round((restanteReceb - somaMisto) * 100) / 100
                const formasReais = formasRecebimento
                return (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Formas (soma tem que fechar o valor)</label>
                    {linhasMisto.map((l, idx) => (
                      <div key={idx} className="flex gap-2">
                        <select
                          value={l.formaId}
                          onChange={(e) => setLinhasMisto((prev) => prev.map((x, i) => i === idx ? { ...x, formaId: e.target.value } : x))}
                          className="flex-1 rounded-xl border border-gray-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          {formasReais.map((f) => <option key={f.id} value={f.id}>{iconeForma(f.nome)} {f.nome}</option>)}
                        </select>
                        <div className="relative w-28">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
                          <input type="text" inputMode="decimal" value={l.valor}
                            onChange={(e) => setLinhasMisto((prev) => prev.map((x, i) => i === idx ? { ...x, valor: e.target.value } : x))}
                            placeholder="0,00"
                            className="w-full rounded-xl border border-gray-200 py-2 pl-7 pr-2 text-right text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        {linhasMisto.length > 1 && (
                          <button type="button" onClick={() => setLinhasMisto((prev) => prev.filter((_, i) => i !== idx))}
                            className="shrink-0 rounded-lg border border-gray-200 px-2 text-gray-400 hover:bg-gray-50 hover:text-red-500">✕</button>
                        )}
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-1">
                      <button type="button"
                        onClick={() => {
                          const usadas = new Set(linhasMisto.map((x) => x.formaId))
                          const prox = formasReais.find((f) => !usadas.has(f.id)) ?? formasReais[0]
                          setLinhasMisto((prev) => [...prev, { formaId: prox?.id ?? '', valor: faltam > 0 ? faltam.toFixed(2).replace('.', ',') : '' }])
                        }}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800">+ adicionar forma</button>
                      <span className={`text-xs font-semibold tabular-nums ${Math.abs(faltam) < 0.01 ? 'text-green-600' : faltam < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                        {Math.abs(faltam) < 0.01 ? '✓ fecha certinho' : faltam > 0 ? `faltam ${formatBRL(faltam)}` : `passou ${formatBRL(-faltam)}`}
                      </span>
                    </div>
                  </div>
                )
              })()}

              {/* Botão confirmar */}
              <button
                type="button"
                disabled={pagandoCrediario}
                onClick={modoMistoReceb ? handleConfirmarRecebimentoMisto : handleConfirmarRecebimento}
                className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition disabled:opacity-50 ${ehDesconto ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {pagandoCrediario && <Spinner />}{pagandoCrediario
                  ? (ehDesconto ? 'Aplicando...' : 'Registrando...')
                  : modoMistoReceb
                    ? `Confirmar misto — ${formatBRL(Math.round(linhasMisto.reduce((s, l) => s + (parseFloat((l.valor || '').replace(',', '.')) || 0), 0) * 100) / 100)}`
                    : `${ehDesconto ? 'Aplicar desconto' : 'Confirmar'} — ${valorRecebido ? `R$ ${valorRecebido}` : formatBRL(recebendoItem.valor)}`}
              </button>

              {/* Histórico de pagamentos */}
              {(recebendoItem.historico_pagamentos ?? []).length > 0 && (
                <div className="mt-1">
                  <p className="text-xs font-semibold uppercase text-gray-400 tracking-wide mb-2">Histórico</p>
                  <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                    {(recebendoItem.historico_pagamentos ?? []).map((h, idx) => {
                      const d = new Date(h.data)
                      const desc = h.tipo === 'desconto'
                      const formaLabel: Record<string, string> = { dinheiro: '💵 Dinheiro', pix: '💠 PIX', debito: '💳 Débito', credito: '💳 Crédito' }
                      return (
                        <div key={idx} className={`flex items-center justify-between px-3 py-2 ${desc ? 'bg-amber-50/60' : 'bg-white'}`}>
                          <div className="min-w-0">
                            <span className={`text-xs ${desc ? 'text-amber-700' : 'text-gray-500'}`}>
                              {desc ? '🏷️ ' : ''}{formaLabel[h.forma] ?? h.forma}
                            </span>
                            <span className="ml-2 text-xs text-gray-400">
                              {isNaN(d.getTime()) ? h.data : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                              {' '}
                              {isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <span className={`shrink-0 text-sm font-semibold ${desc ? 'text-amber-700' : 'text-green-600'}`}>
                            {desc ? '−' : ''}{formatBRL(h.valor)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  {(recebendoItem.historico_pagamentos ?? []).some((h) => h.tipo === 'desconto') && (
                    <p className="mt-1.5 text-[11px] text-gray-400">🏷️ desconto abate a dívida — não é dinheiro recebido.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )
      })()}

      {/* Modal Novo Cliente — cadastro completo pelo PDV (foto no topo + endereço, estilo SIGE) */}
      {mostrarNovoCliente && (
        <div className="animate-fade-in fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-base font-bold text-gray-900">Novo Cliente</h3>
              <button type="button" onClick={() => setMostrarNovoCliente(false)} className="text-lg text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-4 overflow-y-auto px-6 py-5">
              {/* Foto circular no topo (Escolher imagem) */}
              <label className="mx-auto flex w-fit cursor-pointer flex-col items-center gap-1.5">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-gray-300 bg-gray-50 transition hover:border-[#1B6CA8]">
                  {novoFotoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={novoFotoPreview} alt="Foto do cliente" className="h-full w-full object-cover" />
                  ) : (
                    <svg className="h-10 w-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  )}
                </div>
                <span className="text-xs font-semibold text-[#1B6CA8]">{novoFotoPreview ? 'Trocar imagem' : 'Escolher imagem'}</span>
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => handleFotoNovo(e.target.files?.[0] ?? null)} />
              </label>
              <p className="-mt-1 text-center text-[11px] text-gray-400">Foto de comprovação (técnico/lojista) — opcional</p>

              <PoliticaCadastro compacto />

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Nome *</label>
                <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} autoFocus placeholder="Nome do cliente"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">CPF / CNPJ</label>
                  <input value={novoCpf} onChange={(e) => setNovoCpf(e.target.value)} placeholder="000.000.000-00"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">RG</label>
                  <input value={novoRg} onChange={(e) => setNovoRg(e.target.value)} placeholder="00.000.000-0"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Telefone</label>
                  <input value={novoTel} onChange={(e) => setNovoTel(e.target.value)} placeholder="(24) 99999-9999"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Nascimento</label>
                  <input type="date" value={novoNasc} onChange={(e) => setNovoNasc(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">E-mail</label>
                <input type="email" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} placeholder="email@exemplo.com"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Endereço (CEP autopreenche) */}
              <div className="grid grid-cols-6 gap-3">
                <div className="col-span-3">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">CEP</label>
                  <div className="relative">
                    <input value={novoCep} onChange={(e) => setNovoCep(e.target.value)} onBlur={buscarCepNovo} placeholder="00000-000"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    {buscandoCepNovo && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">buscando…</span>}
                  </div>
                </div>
                <div className="col-span-1">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">UF</label>
                  <input value={novoUf} onChange={(e) => setNovoUf(e.target.value.toUpperCase().slice(0, 2))} placeholder="RJ"
                    className="w-full rounded-xl border border-gray-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Número</label>
                  <input value={novoNumero} onChange={(e) => setNovoNumero(e.target.value)} placeholder="123"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Logradouro</label>
                <input value={novoLogradouro} onChange={(e) => setNovoLogradouro(e.target.value)} placeholder="Rua / Avenida"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Cidade</label>
                  <input value={novoCidade} onChange={(e) => setNovoCidade(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Bairro</label>
                  <input value={novoBairro} onChange={(e) => setNovoBairro(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Complemento</label>
                  <input value={novoComplemento} onChange={(e) => setNovoComplemento(e.target.value)} placeholder="Apto, sala…"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Tabela de preço</label>
                <select value={novoTabela} onChange={(e) => setNovoTabela(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Padrão</option>
                  {tabelas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>

              <button type="button" disabled={salvandoNovoCliente || !novoNome.trim()} onClick={handleCriarCliente}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
                {salvandoNovoCliente && <Spinner />}{salvandoNovoCliente ? 'Salvando…' : 'Cadastrar e usar na venda'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalhe da Venda */}
      {(detalheVenda || carregandoDetalhe) && (
        <div className="animate-fade-in fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
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
                <button type="button" onClick={() => reimprimirCupom(detalheVenda.id)} disabled={reimprimindo}
                  className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition disabled:opacity-60">
                  {reimprimindo ? 'Gerando…' : '🖨️ Imprimir 2ª via'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Buscar Vendas (#9) */}
      {mostrarVendas && (
        <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
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
                placeholder="Filtrar por número, código ou cliente..."
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
                      <tr key={v.id} onClick={() => handleVerVenda(v.id)} className="cursor-pointer hover:bg-blue-50/60 transition">
                        <td className="py-2.5 pr-3 font-mono text-xs text-gray-500">#{v.numero ?? v.id.slice(0, 8).toUpperCase()}</td>
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
        <div className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16">
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
        <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
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
        <div className="animate-fade-in-up fixed bottom-6 right-6 z-50 flex items-start gap-3 rounded-xl bg-red-600 px-4 py-3 shadow-lg max-w-xs">
          <span className="text-sm font-medium text-white">{erro}</span>
          <button type="button" onClick={() => setErro(null)}
            className="ml-1 text-red-200 hover:text-white text-sm leading-none">✕</button>
        </div>
      )}
    </div>
  )
}
