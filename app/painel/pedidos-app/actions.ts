'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { finalizarVenda } from '../pdv/actions'
import { itensDaUnidade, type DadosPedidosApp, type UnidadePedidoApp } from '@/lib/pedidos-app'

async function contexto(unidade?: string, accessToken?: string) {
  const usuario = await requirePermissao('pdv', accessToken)
  const service = await createServiceClient()
  const [{ data: perfil, error: erroPerfil }, { data: mapas, error: erroMapas }, { data: lojas, error: erroLojas }] = await Promise.all([
    service.from('perfis').select('lojas_permitidas').eq('id', usuario.id).maybeSingle(),
    service.from('pedidos_app_unidades').select('unidade,loja_id').order('unidade'),
    service.from('lojas').select('id,nome').eq('ativa', true),
  ])
  if (erroPerfil || !perfil || erroMapas || erroLojas) throw new Error('Não foi possível conferir as unidades autorizadas. Verifique a configuração da integração.')
  const permitidas = perfil.lojas_permitidas as unknown
  if (permitidas != null && (!Array.isArray(permitidas) || permitidas.some(id => typeof id !== 'string'))) throw new Error('Configuração de lojas autorizadas inválida.')
  const unidades: UnidadePedidoApp[] = (mapas ?? []).flatMap(m => {
    const loja = (lojas ?? []).find(l => l.id === m.loja_id)
    return loja && (!Array.isArray(permitidas) || !permitidas.length || permitidas.includes(loja.id))
      ? [{ unidade: m.unidade as string, lojaId: loja.id as string, nome: loja.nome as string }] : []
  })
  const selecionada = unidade ? unidades.find(u => u.unidade === unidade) : unidades[0]
  if (unidade && !selecionada) throw new Error('Unidade não autorizada.')
  return { usuario, service, unidades, selecionada: selecionada ?? null }
}

export async function carregarPedidosApp(unidade?: string, accessToken?: string): Promise<DadosPedidosApp> {
  const { service, unidades, selecionada } = await contexto(unidade, accessToken)
  if (!selecionada) return { unidades, unidade: null, pedidos: [], depositos: [], formas: [] }
  const [{ data: pedidos, error }, { data: depositos, error: erroDep }, { data: formas, error: erroFormas }] = await Promise.all([
    service.from('pedidos_app').select('id,pessoa_id,status,status_pagamento,itens,created_at')
      .contains('itens', [{ loja: selecionada.unidade }]).order('created_at', { ascending: false }).limit(100),
    service.from('depositos').select('id,nome').eq('loja_id', selecionada.lojaId).eq('ativo', true).order('nome'),
    service.from('formas_pagamento').select('id,nome,tipo').eq('ativo', true)
      .in('tipo', ['dinheiro', 'pix', 'fiado']).or(`loja_id.is.null,loja_id.eq.${selecionada.lojaId}`).order('nome'),
  ])
  if (error || erroDep || erroFormas) throw new Error('Não foi possível carregar os pedidos desta unidade. Tente novamente.')
  const ids = (pedidos ?? []).map(p => p.id as string)
  const pessoasIds = [...new Set((pedidos ?? []).map(p => p.pessoa_id as string).filter(Boolean))]
  const [{ data: atendimentos, error: erroAt }, { data: pessoas, error: erroPessoas }] = await Promise.all([
    ids.length ? service.from('pedidos_app_atendimentos').select('pedido_id,confirmado_em,venda_id').eq('unidade', selecionada.unidade).in('pedido_id', ids) : Promise.resolve({ data: [], error: null }),
    pessoasIds.length ? service.from('pessoas').select('id,nome').in('id', pessoasIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (erroAt || erroPessoas) throw new Error('Não foi possível conferir o atendimento dos pedidos.')
  return { unidades, unidade: selecionada, depositos: depositos ?? [], formas: formas ?? [], pedidos: (pedidos ?? []).map(p => {
    const itens = itensDaUnidade(p.itens, selecionada.unidade)
    const atendimento = (atendimentos ?? []).find(a => a.pedido_id === p.id)
    return { id: p.id, pessoaId: p.pessoa_id, cliente: (pessoas ?? []).find(c => c.id === p.pessoa_id)?.nome ?? 'Cliente',
      status: p.status, pagamento: p.status_pagamento, criadoEm: p.created_at, itens,
      total: Math.round(itens.reduce((s, i) => s + i.preco * i.quantidade, 0) * 100) / 100,
      confirmado: !!atendimento?.confirmado_em, vendaId: atendimento?.venda_id ?? null }
  }) }
}

export async function confirmarPedidoApp(id: string, unidade: string, accessToken: string) {
  try {
    const { service, usuario } = await contexto(unidade, accessToken)
    const { error } = await service.rpc('confirmar_pedido_app_unidade', { p_pedido: id, p_unidade: unidade, p_operador: usuario.id })
    if (error) return { erro: error.code === 'PGRST202' ? 'Integração ainda não instalada no servidor.' : error.message }
    revalidatePath('/painel/pedidos-app')
    return { ok: true as const }
  } catch (e) { return { erro: e instanceof Error ? e.message : 'Não foi possível confirmar o pedido.' } }
}

export async function faturarPedidoApp(id: string, unidade: string, depositoId: string, formaId: string, recebido: boolean, accessToken: string) {
  try {
    const { service, selecionada } = await contexto(unidade, accessToken)
    if (!selecionada) return { erro: 'Selecione a unidade.' }
    const [{ data: pedido, error }, { data: forma, error: erroForma }] = await Promise.all([
      service.from('pedidos_app').select('pessoa_id,itens').eq('id', id).maybeSingle(),
      service.from('formas_pagamento').select('id,tipo,loja_id').eq('id', formaId).eq('ativo', true).maybeSingle(),
    ])
    if (error || !pedido?.pessoa_id || erroForma || !forma) return { erro: 'Pedido ou forma de pagamento indisponível.' }
    if (!['dinheiro', 'pix', 'fiado'].includes(forma.tipo) || (forma.loja_id && forma.loja_id !== selecionada.lojaId)) return { erro: 'Forma de pagamento não autorizada para esta unidade.' }
    if (forma.tipo !== 'fiado' && recebido !== true) return { erro: 'Confira o recebimento antes de marcar o pagamento como pago.' }
    const itens = itensDaUnidade(pedido.itens, unidade)
    const total = Math.round(itens.reduce((s, i) => s + i.preco * i.quantidade, 0) * 100) / 100
    const result = await finalizarVenda(accessToken, itens.map(i => ({ produto_id: i.id, nome: i.nome, quantidade: i.quantidade, preco_unitario: i.preco, desconto_item: 0 })),
      [{ forma_pagamento_id: forma.id, valor: total, taxa: 0, maquina: '', parcelas: 1, status: forma.tipo === 'fiado' ? 'pendente' : 'pago' }],
      pedido.pessoa_id, 0, '', depositoId, [], 0, 0, 'retirada', null, null, null, null, { id, unidade })
    if ('erro' in result) return result
    revalidatePath('/painel/pedidos-app')
    return { ok: true as const, vendaId: result.vendaId, vendaNumero: result.vendaNumero }
  } catch (e) { return { erro: e instanceof Error ? e.message : 'Não foi possível finalizar. Atualize e tente novamente; o mesmo pedido não gera outra venda.' } }
}

export async function cancelarPedidoApp(id: string, unidade: string, accessToken: string) {
  try {
    const { service, usuario, selecionada } = await contexto(unidade, accessToken)
    const { data: pedido, error: erroPedido } = await service.from('pedidos_app').select('id').eq('id', id)
      .contains('itens', [{ loja: selecionada!.unidade }]).maybeSingle()
    if (erroPedido || !pedido) return { erro: 'Pedido não disponível nesta unidade.' }
    const { error } = await service.rpc('cancelar_pedido_app', { p_pedido: id, p_operador: usuario.id })
    if (error) return { erro: error.code === 'PGRST202' ? 'Cancelamento ainda não instalado no servidor.' : error.message }
    revalidatePath('/painel/pedidos-app')
    return { ok: true as const }
  } catch (e) { return { erro: e instanceof Error ? e.message : 'Não foi possível cancelar o pedido.' } }
}
