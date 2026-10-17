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

export async function carregarPedidosApp(unidade?: string, accessToken?: string, cursor?: string): Promise<DadosPedidosApp> {
  const { service, unidades, selecionada } = await contexto(unidade, accessToken)
  const gerenciamentoHabilitado = process.env.PEDIDOS_APP_GERENCIAMENTO_ENABLED === 'true'
  if (!selecionada) return { unidades, unidade: null, pedidos: [], gerenciamentoHabilitado, maisPedidos: false, proximoCursor: null }
  let consulta = service.from('pedidos_app')
    .select('id,pessoa_id,status,status_pagamento,itens,created_at')
    .contains('itens', JSON.stringify([{ loja: selecionada.unidade }])).order('created_at', { ascending: false })
    .order('id', { ascending: false }).limit(101)
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
  const pedidos = (data ?? []).slice(0, 100)
  const ids = pedidos.map(p => p.id as string)
  const pessoasIds = [...new Set(pedidos.map(p => p.pessoa_id as string).filter(Boolean))]
  const [{ data: atendimentos, error: erroAt }, { data: pessoas, error: erroPessoas }] = await Promise.all([
    ids.length ? service.from('pedidos_app_atendimentos').select('pedido_id,confirmado_em').eq('unidade', selecionada.unidade).in('pedido_id', ids) : Promise.resolve({ data: [], error: null }),
    pessoasIds.length ? service.from('pessoas').select('id,nome').in('id', pessoasIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (erroAt || erroPessoas) throw new ErroPedido('Não foi possível conferir o atendimento dos pedidos.')
  const maisPedidos = (data?.length ?? 0) > 100
  return { unidades, unidade: selecionada, gerenciamentoHabilitado, maisPedidos, proximoCursor: maisPedidos ? pedidos[pedidos.length - 1].id : null,
    pedidos: pedidos.map(p => {
      const itens = itensDaUnidade(p.itens, selecionada.unidade)
      return { id: p.id, cliente: pessoas?.find(c => c.id === p.pessoa_id)?.nome ?? 'Cliente',
        status: p.status, pagamento: p.status_pagamento, criadoEm: p.created_at, itens,
        total: Math.round(itens.reduce((s, i) => s + i.preco * i.quantidade, 0) * 100) / 100,
        confirmado: !!atendimentos?.find(a => a.pedido_id === p.id)?.confirmado_em }
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
