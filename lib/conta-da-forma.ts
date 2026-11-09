import type { createServiceClient } from '@/lib/supabase/server'

type SB = Awaited<ReturnType<typeof createServiceClient>>

// DE QUAL CONTA SAI (OU ENTRA) O DINHEIRO DE UMA FORMA.
//
// O nome da forma é texto livre em vários pontos do app ("PIX", "Crédito TON 3x",
// "Débito"), e o saldo só muda quando o lançamento tem conta_id. Sem esta tradução o
// pagamento fica registrado e o dinheiro não sai de conta nenhuma — foi assim que o
// PagBank apareceu com 25 mil a mais em 08/11/2026.
//
// Regra:
//   dinheiro → null: cédula vive na GAVETA e é registrada em movimentos_caixa
//              (mesma escolha da devolução em dinheiro; não é conta bancária)
//   cartão/PIX → conta_destino da forma (o que o cadastro da forma aponta)
//   forma sem destino → banco ativo da loja; se não houver, o único banco ativo
//
// ponytail: é a MESMA regra que contaDaFormaTexto (pdv) e contaDaFormaOS (os) já
// fazem cada uma na sua cópia. Consolidar as três num só lugar é o próximo passo;
// aqui ela nasce isolada para não mexer em caminho de PDV/OS que já está em produção.
export async function contaDaForma(
  supabase: SB,
  formaTexto: string | null | undefined,
  lojaId?: string | null,
): Promise<string | null> {
  // "Crédito TON 3x" → "crédito ton": a conta é da forma, não importa o parcelamento
  const texto = (formaTexto ?? '').trim().toLowerCase().replace(/\s+\d+x$/, '')
  if (!texto) return null

  const { data } = await supabase.from('formas_pagamento').select('nome, tipo, conta_destino_id')
  const forma = (data ?? []).find(
    (f) => (f.nome ?? '').toLowerCase() === texto || (f.tipo ?? '').toLowerCase() === texto,
  ) as { nome: string | null; tipo: string | null; conta_destino_id: string | null } | undefined

  // Dinheiro não é conta: sai/entra pela gaveta da loja.
  if (forma?.tipo === 'dinheiro') return null
  if (forma?.conta_destino_id) return forma.conta_destino_id

  // Forma sem destino (ou forma que não existe mais): banco ativo da loja.
  const { data: bancos } = await supabase
    .from('contas').select('id, loja_id').eq('ativa', true).eq('tipo', 'banco')
  const lista = (bancos ?? []) as { id: string; loja_id: string | null }[]
  const daLoja = lojaId ? lista.filter((c) => c.loja_id === lojaId) : []
  if (daLoja.length === 1) return daLoja[0].id
  if (lista.length === 1) return lista[0].id
  return null
}
