'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { itensDaUnidade, type DadosPedidosApp, type UnidadePedidoApp } from '@/lib/pedidos-app'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
class ErroPedido extends Error {}

// Apenas etapas e códigos públicos; nunca registrar sessão, chaves ou dados de clientes.
function diagnosticarLeitura(etapa: string, erro?: { code?: string } | null) {
  const codigo = erro?.code && /^[A-Z0-9]{5,10}$/.test(erro.code) ? erro.code : 'SEM_CODIGO'
  console.error('[pedidos-app]', etapa, codigo)
}

async function contexto(unidade?: string, accessToken?: string, gerenciar = false) {
  const usuario = await requirePermissao('pdv', accessToken).catch(() => { diagnosticarLeitura('autorizacao'); throw new ErroPedido('Não autorizado. Confira sua sessão e permissão.') })
  if (gerenciar && process.env.PEDIDOS_APP_GERENCIAMENTO_ENABLED !== 'true') {
    throw new ErroPedido('O atendimento de pedidos ainda não foi liberado.')
  }
  const service = await createServiceClient()
  const [{ data: perfil, error: erroPerfil }, { data: mapas, error: erroMapas }, { data: lojas, error: erroLojas }] = await Promise.all([
    service.from('perfis').select('lojas_permitidas,ativo').eq('id', usuario.id).maybeSingle(),
    service.from('pedidos_app_unidades').select('unidade,loja_id').order('unidade'),
    service.from('lojas').select('id,nome').eq('ativa', true),
  ])
  if (erroPerfil || !perfil || perfil.ativo !== true || erroMapas || erroLojas) {
    diagnosticarLeitura(erroPerfil ? 'perfil' : !perfil || perfil.ativo !== true ? 'perfil_inativo' : erroMapas ? 'mapas' : 'lojas', erroPerfil ?? erroMapas ?? erroLojas)
    throw new ErroPedido('Não foi possível conferir as unidades autorizadas. Verifique a configuração da integração.')
  }
  const permitidas: unknown = perfil.lojas_permitidas
  if (permitidas != null && (!Array.isArray(permitidas) || permitidas.some(id => typeof id !== 'string' || !UUID.test(id)))) {
    diagnosticarLeitura('lojas_permitidas')
    throw new ErroPedido('Configuração de lojas autorizadas inválida.')
  }
  const unidades: UnidadePedidoApp[] = (mapas ?? []).flatMap(m => {
    const loja = (lojas ?? []).find(l => l.id === m.loja_id)
    return loja && (!Array.isArray(permitidas) || !permitidas.length || permitidas.includes(loja.id))
      ? [{ unidade: m.unidade as string, lojaId: loja.id as string, nome: loja.nome as string }] : []
  })
  const selecionada = unidade ? unidades.find(u => u.unidade === unidade) : unidades[0]
  if (unidade && !selecionada) throw new ErroPedido('Unidade não autorizada.')
  return { usuario, service, unidades, selecionada: selecionada ?? null }
}

// Somente leitura. A conclusão deve revalidar estes dados dentro da transação.
export async function carregarPedidoAppPDV(id: string, unidade: string, accessToken?: string) {
  if (process.env.PEDIDOS_APP_PDV_ENABLED !== 'true') throw new ErroPedido('A integração com o PDV ainda está em validação.')
  if (!UUID.test(id) || !unidade) throw new ErroPedido('Link do pedido inválido.')
  const { service, selecionada } = await contexto(unidade, accessToken, true)
  if (!selecionada) throw new ErroPedido('Unidade não autorizada.')
  const { data: pedido, error } = await service.from('pedidos_app')
    .select('id,user_id,pessoa_id,status,status_pagamento,itens,forma_entrega')
    .eq('id', id).contains('itens', JSON.stringify([{ loja: selecionada.unidade }])).maybeSingle()
  if (error || !pedido || !pedido.pessoa_id) {
    throw new ErroPedido('Pedido não disponível para atendimento.')
  }
  const itens = itensDaUnidade(pedido.itens, selecionada.unidade)
  const [{ data: cadastro, error: erroCadastro }, { data: pessoa, error: erroPessoa }, { data: produtos, error: erroProdutos }, { data: atendimento, error: erroAtendimento }] = await Promise.all([
    service.from('cadastros_clientes').select('user_id,pessoa_id,status')
      .eq('user_id', pedido.user_id).eq('pessoa_id', pedido.pessoa_id).eq('status', 'aprovado').maybeSingle(),
    service.from('pessoas').select('id,nome,ativo,nao_vender,permite_fiado').eq('id', pedido.pessoa_id).maybeSingle(),
    service.from('produtos').select('id,ativo,codigo,controla_serie').in('id', itens.map(i => i.id)),
    service.from('pedidos_app_atendimentos').select('venda_id').eq('pedido_id', id).eq('unidade', unidade).maybeSingle(),
  ])
  if (erroAtendimento) throw new ErroPedido('Não foi possível conferir se o pedido já virou venda.')
  if (erroPessoa || !pessoa || (!atendimento?.venda_id &&
    (pedido.status === 'cancelado' || erroCadastro || !cadastro || pessoa.ativo !== true || pessoa.nao_vender === true))) {
    throw new ErroPedido('Cadastro sem vínculo ativo e aprovado. Confira o cliente antes de atender.')
  }
  if (erroProdutos || (!atendimento?.venda_id && itens.some(i => !produtos?.some(p => p.id === i.id && p.ativo === true)))) {
    throw new ErroPedido('Há peças indisponíveis neste pedido. Confira o cadastro dos produtos.')
  }
  const { data: venda, error: erroVenda } = atendimento?.venda_id
    ? await service.from('vendas').select('status').eq('id', atendimento.venda_id).maybeSingle()
    : { data: null, error: null }
  if (erroVenda || (atendimento?.venda_id && !venda)) throw new ErroPedido('Não foi possível conferir a venda do pedido.')
  return {
    id: pedido.id as string, unidade: selecionada.unidade, lojaId: selecionada.lojaId,
    pessoaId: pessoa.id as string, cliente: pessoa.nome as string,
    permiteFiado: pessoa.permite_fiado === true,
    formaEntrega: pedido.forma_entrega as string | null,
    vendaId: atendimento?.venda_id as string | null ?? null,
    vendaCancelada: venda?.status === 'cancelada',
    itens: itens.map(i => {
      const produto = produtos?.find(p => p.id === i.id)
      return { ...i, codigo: produto?.codigo as string | null ?? null, serializado: produto?.controla_serie === true }
    }),
    total: Math.round(itens.reduce((s, i) => s + i.quantidade * i.preco, 0) * 100) / 100,
  }
}

export async function encaminharPedidoAppPDV(id: string, unidade: string, accessToken: string) {
  try {
    if (process.env.PEDIDOS_APP_PDV_ENABLED !== 'true') throw new ErroPedido('A integração com o PDV ainda está em validação.')
    if (!UUID.test(id) || !unidade) throw new ErroPedido('Link do pedido inválido.')
    const { service, usuario, selecionada } = await contexto(unidade, accessToken, true)
    if (!selecionada) throw new ErroPedido('Unidade não autorizada.')
    const { error } = await service.rpc('encaminhar_pedido_app_pdv', {
      p_pedido: id, p_unidade: selecionada.unidade, p_operador: usuario.id,
    })
    if (error) throw new ErroPedido(error.code === 'PGRST202'
      ? 'A integração com o PDV ainda não foi instalada no servidor.'
      : 'Não foi possível encaminhar o pedido. Atualize antes de tentar novamente.')
    revalidatePath('/painel/pedidos-app')
    return { url: `/painel/pdv?${new URLSearchParams({ pedidoApp: id, unidade: selecionada.unidade })}` }
  } catch (e) { return { erro: e instanceof ErroPedido ? e.message : 'Não foi possível abrir o pedido no PDV.' } }
}

export type PagamentoPedidoApp = {
  forma_pagamento_id: string; valor: number; taxa: number;
  maquina: string; parcelas: number; status: 'pago' | 'pendente'
}

export async function finalizarPedidoAppPDV(
  id: string, unidade: string, deposito: string, pagamentos: PagamentoPedidoApp[],
  series: { produto_id: string; serie: string }[], accessToken: string,
) {
  try {
    if (process.env.PEDIDOS_APP_PDV_ENABLED !== 'true') throw new ErroPedido('A integração com o PDV ainda está em validação.')
    if (!UUID.test(id) || !unidade || !deposito || !Array.isArray(pagamentos) || !pagamentos.length
      || !Array.isArray(series) || pagamentos.some(p => !p.forma_pagamento_id || !Number.isFinite(p.valor)
        || p.valor <= 0 || !Number.isFinite(p.taxa) || p.taxa < 0 || !Number.isInteger(p.parcelas)
        || p.parcelas < 1 || p.parcelas > 24 || !['pago', 'pendente'].includes(p.status))
      || series.some(s => !s.produto_id || !s.serie)) throw new ErroPedido('Confira depósito, peças e pagamentos.')
    const { service, usuario, selecionada } = await contexto(unidade, accessToken, true)
    if (!selecionada) throw new ErroPedido('Unidade não autorizada.')
    const { data, error } = await service.rpc('finalizar_pedido_app_pdv', {
      p_pedido: id, p_unidade: unidade, p_operador: usuario.id, p_deposito: deposito,
      p_pagamentos: pagamentos, p_series: series,
    })
    if (error || !data?.venda_id) throw new ErroPedido(error?.code === 'PGRST202'
      ? 'Atendimento pelo PDV ainda não instalado no servidor.'
      : 'Venda não concluída ou resposta incerta. Atualize o pedido antes de tentar novamente.')
    revalidatePath('/painel/pedidos-app')
    return { vendaId: data.venda_id as string, vendaNumero: data.venda_numero as number | null,
      jaExistia: data.ja_existia === true }
  } catch (e) { return { erro: e instanceof ErroPedido ? e.message : 'Não foi possível concluir o pedido pelo PDV.' } }
}

export async function carregarPedidosApp(unidade?: string, accessToken?: string, cursor?: string, pedidoId?: string): Promise<DadosPedidosApp> {
  if (pedidoId !== undefined && (!UUID.test(pedidoId) || !unidade || cursor)) throw new ErroPedido('Link do pedido inválido.')
  const { service, unidades, selecionada } = await contexto(unidade, accessToken)
  const gerenciamentoHabilitado = process.env.PEDIDOS_APP_GERENCIAMENTO_ENABLED === 'true'
  const pdvHabilitado = gerenciamentoHabilitado && process.env.PEDIDOS_APP_PDV_ENABLED === 'true'
  if (!selecionada) return { unidades, unidade: null, pedidos: [], gerenciamentoHabilitado, pdvHabilitado, maisPedidos: false, proximoCursor: null }
  let consulta = service.from('pedidos_app')
    .select('id,pessoa_id,status,status_pagamento,itens,created_at')
    .contains('itens', JSON.stringify([{ loja: selecionada.unidade }])).order('created_at', { ascending: false })
    .order('id', { ascending: false }).limit(101)
  if (pedidoId) consulta = consulta.eq('id', pedidoId)
  if (cursor) {
    if (!UUID.test(cursor)) throw new ErroPedido('Página inválida. Atualize a lista.')
    const { data: ancora, error: erroAncora } = await service.from('pedidos_app').select('id,created_at')
      .eq('id', cursor).contains('itens', JSON.stringify([{ loja: selecionada.unidade }])).maybeSingle()
    const instante: unknown = ancora?.created_at
    // Não arredondar microssegundos do PostgreSQL com Date.toISOString().
    if (erroAncora || typeof instante !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(instante) || !Number.isFinite(Date.parse(instante))) throw new ErroPedido('Página não disponível. Atualize a lista.')
    consulta = consulta.or(`created_at.lt.${instante},and(created_at.eq.${instante},id.lt.${cursor})`)
  }
  const { data, error } = await consulta
  if (error) { diagnosticarLeitura('pedidos', error); throw new ErroPedido('Não foi possível carregar os pedidos desta unidade. Tente novamente.') }
  if (pedidoId && !data?.length) throw new ErroPedido('Pedido não encontrado nesta unidade.')
  const pedidos = (data ?? []).slice(0, 100)
  const ids = pedidos.map(p => p.id as string)
  const pessoasIds = [...new Set(pedidos.map(p => p.pessoa_id as string).filter(Boolean))]
  const [{ data: atendimentos, error: erroAt }, { data: pessoas, error: erroPessoas }] = await Promise.all([
    ids.length ? service.from('pedidos_app_atendimentos')
      .select(pdvHabilitado ? 'pedido_id,confirmado_em,encaminhado_em,venda_id' : 'pedido_id,confirmado_em')
      .eq('unidade', selecionada.unidade).in('pedido_id', ids) : Promise.resolve({ data: [], error: null }),
    pessoasIds.length ? service.from('pessoas').select('id,nome').in('id', pessoasIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (erroAt || erroPessoas) throw new ErroPedido('Não foi possível conferir o atendimento dos pedidos.')
  const vendaIds = pdvHabilitado ? (atendimentos as unknown as { venda_id?: string | null }[] | null)?.map(a => a.venda_id).filter((id): id is string => !!id) ?? [] : []
  const { data: vendas, error: erroVendas } = vendaIds.length
    ? await service.from('vendas').select('id,status').in('id', vendaIds)
    : { data: [], error: null }
  if (erroVendas) throw new ErroPedido('Não foi possível conferir as vendas dos pedidos.')
  const maisPedidos = (data?.length ?? 0) > 100
  return { unidades, unidade: selecionada, gerenciamentoHabilitado, pdvHabilitado, maisPedidos, proximoCursor: maisPedidos ? pedidos[pedidos.length - 1].id : null,
    pedidos: pedidos.map(p => {
      const itens = itensDaUnidade(p.itens, selecionada.unidade)
      const atendimento = (atendimentos as unknown as { pedido_id: string; confirmado_em?: string | null; encaminhado_em?: string | null; venda_id?: string | null }[] | null)
        ?.find(a => a.pedido_id === p.id)
      return { id: p.id, cliente: pessoas?.find(c => c.id === p.pessoa_id)?.nome ?? 'Cliente',
        status: p.status, pagamento: p.status_pagamento, criadoEm: p.created_at, itens,
        total: Math.round(itens.reduce((s, i) => s + i.preco * i.quantidade, 0) * 100) / 100,
        confirmado: !!atendimento?.confirmado_em, encaminhado: !!atendimento?.encaminhado_em,
        vendaId: atendimento?.venda_id ?? null,
        vendaCancelada: !!atendimento?.venda_id && vendas?.find(v => v.id === atendimento.venda_id)?.status === 'cancelada' }
    }) }
}

export async function confirmarPedidoApp(id: string, unidade: string, accessToken: string) {
  try {
    const { service, usuario, selecionada } = await contexto(unidade, accessToken, true)
    if (!UUID.test(id) || !selecionada) throw new ErroPedido('Pedido ou unidade inválidos.')
    const { data: pedido, error: erroPedido } = await service.from('pedidos_app').select('id').eq('id', id)
      .contains('itens', JSON.stringify([{ loja: selecionada.unidade }])).maybeSingle()
    if (erroPedido || !pedido) throw new ErroPedido('Pedido não disponível nesta unidade.')
    const { error } = await service.rpc('confirmar_pedido_app_unidade', { p_pedido: id, p_unidade: selecionada.unidade, p_operador: usuario.id })
    if (error) return { erro: error.code === 'PGRST202' ? 'Atendimento ainda não instalado no servidor.' : 'Não foi possível confirmar o pedido. Atualize e tente novamente.' }
    revalidatePath('/painel/pedidos-app')
    return { ok: true as const }
  } catch (e) { return { erro: e instanceof ErroPedido ? e.message : 'Não foi possível confirmar o pedido. Tente novamente.' } }
}

export async function cancelarPedidoApp(id: string, unidade: string, accessToken: string) {
  try {
    const { service, usuario, selecionada } = await contexto(unidade, accessToken, true)
    if (!UUID.test(id) || !selecionada) throw new ErroPedido('Pedido ou unidade inválidos.')
    const { data: pedido, error: erroPedido } = await service.from('pedidos_app').select('id').eq('id', id)
      .contains('itens', JSON.stringify([{ loja: selecionada.unidade }])).maybeSingle()
    if (erroPedido || !pedido) throw new ErroPedido('Pedido não disponível nesta unidade.')
    // O RPC valida acesso a TODAS as unidades; esta ação cancela o pedido inteiro.
    const { error } = await service.rpc('cancelar_pedido_app', { p_pedido: id, p_operador: usuario.id })
    if (error) return { erro: error.code === 'PGRST202' ? 'Cancelamento ainda não instalado no servidor.' : 'Não foi possível cancelar. Confira as unidades e a situação do pedido.' }
    revalidatePath('/painel/pedidos-app')
    return { ok: true as const }
  } catch (e) { return { erro: e instanceof ErroPedido ? e.message : 'Não foi possível cancelar o pedido. Tente novamente.' } }
}
