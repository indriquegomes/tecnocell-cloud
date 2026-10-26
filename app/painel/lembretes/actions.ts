'use server'

import { createServiceClient, requireAuth, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { hojeSP } from '@/lib/lembretes'
import { dataEmMesFechado } from '@/lib/fechamento'

export type ActionState = { ok: boolean; message: string } | null

function diasDoForm(fd: FormData): number[] {
  // checkbox: fd.getAll(), NUNCA fd.get() — com hidden junto, o get() pega o hidden
  const dias = fd.getAll('dias').map((d) => Number(d)).filter((n) => n >= 0 && n <= 6)
  return [...new Set(dias)].sort()
}

export async function salvarLembrete(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const token = fd.get('access_token') as string
    const usuario = await requirePermissao('lembretes', token)

    const titulo = (fd.get('titulo') as string ?? '').trim()
    const hora = (fd.get('hora') as string ?? '').trim()
    const dias = diasDoForm(fd)

    if (!titulo) return { ok: false, message: 'Escreva o que precisa ser feito.' }
    if (!hora) return { ok: false, message: 'Informe o horário.' }
    if (dias.length === 0) return { ok: false, message: 'Escolha pelo menos um dia da semana.' }

    // "para" vem como "perfil:<id>" | "cargo:<id>" | "todos"
    const para = (fd.get('para') as string) ?? 'todos'
    const perfil_id = para.startsWith('perfil:') ? para.slice(7) : null
    const cargo_id = para.startsWith('cargo:') ? para.slice(6) : null
    const tipo = ((fd.get('tipo') as string) ?? 'rotina').trim() || 'rotina'
    const valorRaw = ((fd.get('valor') as string) ?? '').trim()
    const valor = tipo === 'pagamento' && valorRaw ? (Number(valorRaw) || 0) : null
    const chave_pix = tipo === 'pagamento' ? (((fd.get('chave_pix') as string) ?? '').trim() || null) : null

    const supabase = await createServiceClient()
    const id = (fd.get('id') as string) || null
    const dados = {
      titulo,
      descricao: ((fd.get('descricao') as string) ?? '').trim() || null,
      perfil_id,
      cargo_id,
      hora,
      dias,
      tipo,
      valor,
      chave_pix,
      // hidden + checkbox: getAll().includes('1') — o get() pegaria sempre o hidden
      ativo: fd.getAll('ativo').includes('1'),
      updated_at: new Date().toISOString(),
    }

    const { error } = id
      ? await supabase.from('lembretes').update(dados).eq('id', id)
      : await supabase.from('lembretes').insert({ ...dados, criado_por: usuario.id })

    if (error) return { ok: false, message: error.message }

    revalidatePath('/painel/lembretes')
    revalidatePath('/painel', 'layout')
    return { ok: true, message: id ? 'Lembrete atualizado.' : 'Lembrete criado.' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Erro ao salvar.' }
  }
}

export async function excluirLembrete(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requirePermissao('lembretes', fd.get('access_token') as string)
    const supabase = await createServiceClient()
    const { error } = await supabase.from('lembretes').delete().eq('id', fd.get('id') as string)
    if (error) return { ok: false, message: error.message }
    revalidatePath('/painel/lembretes')
    revalidatePath('/painel', 'layout')
    return { ok: true, message: 'Lembrete excluído.' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Erro ao excluir.' }
  }
}

// LANÇA O PAGAMENTO NO FINANCEIRO.
//
// Regra do dono: pagamento recorrente marcado como pago entra no financeiro
// sozinho — antes só marcava o lembrete e o dinheiro nunca aparecia nas contas.
//
// Cuidados:
//  - id fixo por lembrete + data: marcar duas vezes não duplica (código 23505 é
//    engolido de propósito, é o mesmo pagamento);
//  - mês fechado não recebe lançamento retroativo (mesma trava do resto do app);
//  - sem valor no lembrete, não lança nada;
//  - a pessoa sai do título ("Pagamento: NOME") e a loja do cadastro dela.
async function lancarPagamentoRecorrente(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  lembreteId: string,
  data: string,
): Promise<void> {
  const { data: lembrete } = await supabase
    .from('lembretes')
    .select('titulo, valor, tipo')
    .eq('id', lembreteId)
    .maybeSingle()
  const l = lembrete as { titulo?: string; valor?: number | null; tipo?: string | null } | null
  if (!l || (l.tipo ?? 'rotina') !== 'pagamento') return
  const valor = Number(l.valor ?? 0)
  if (!(valor > 0)) return
  if (await dataEmMesFechado(supabase, data)) return

  const nome = (l.titulo ?? '').replace(/^pagamento:\s*/i, '').trim()
  if (!nome) return
  const { data: perfil } = await supabase
    .from('perfis')
    .select('nome, pdv_loja_id')
    .ilike('nome', nome)
    .maybeSingle()
  const p = perfil as { nome?: string; pdv_loja_id?: string | null } | null
  const ddmm = data.slice(8, 10) + '/' + data.slice(5, 7)

  const { error } = await supabase.from('lancamentos').insert({
    id: 'pagamento-' + lembreteId + '-' + data,
    descricao: 'Salário — ' + nome + ' — semana de ' + ddmm,
    valor,
    tipo: 'pagar',
    categoria: 'Salários',
    pessoa_nome: p?.nome ?? nome,
    loja_id: p?.pdv_loja_id ?? null,
    data_competencia: data,
    data_vencimento: data,
    data_pagamento: data,
    status: 'pago',
    valor_pago: valor,
    forma_pagamento: 'PIX',
    updated_at: new Date().toISOString(),
  })
  // 23505 = já lançado para este lembrete nesta data. Não é erro.
  if (error && error.code !== '23505') console.error('lancarPagamentoRecorrente:', error.message)
}

// Marcar como FEITO — qualquer um que veja o lembrete pode marcar o seu.
// A trava de duplicata é no banco (unique lembrete_id+data), não aqui.
export async function marcarFeito(accessToken: string, lembreteId: string): Promise<void> {
  const usuario = await requireAuth(accessToken)
  const supabase = await createServiceClient()
  const { error } = await supabase.rpc('marcar_lembrete_feito', {
    p_lembrete_id: lembreteId,
    p_perfil_id: usuario.id,
    p_data: hojeSP().data,
  })
  if (error) throw new Error(error.message)
  await lancarPagamentoRecorrente(supabase, lembreteId, hojeSP().data)
  revalidatePath('/painel', 'layout')
  revalidatePath('/painel/financeiro')
}

// Pagamento recorrente: o comprovante é OPCIONAL (decisão do dono, 26/10) — o que
// importa é o pagamento entrar no financeiro. A imagem vai
// pro bucket PRIVADO `pagamentos` e o caminho fica gravado no feito — só some depois
// de pagar e provar. Mesmo padrão de upload do clientes/actions.ts.
const EXT_COMPROVANTE: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
}

export async function marcarPagamentoFeito(accessToken: string, lembreteId: string, file: File | null): Promise<void> {
  const usuario = await requireAuth(accessToken)
  const supabase = await createServiceClient()

  // Comprovante é opcional: se vier, sobe; se não vier, marca pago do mesmo jeito.
  let path: string | null = null
  if (file && file.size > 0) {
    const ext = EXT_COMPROVANTE[file.type]
    if (!ext) throw new Error('Envie uma imagem (JPG, PNG, WEBP ou GIF).')
    path = `pagamentos/${lembreteId}/${hojeSP().data}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await supabase.storage.from('pagamentos').upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    })
    if (upErr) throw new Error(upErr.message)
  }

  const { error } = await supabase.rpc('marcar_lembrete_feito', {
    p_lembrete_id: lembreteId,
    p_perfil_id: usuario.id,
    p_data: hojeSP().data,
    ...(path ? { p_comprovante_url: path } : {}),
  })
  if (error) throw new Error(error.message)
  await lancarPagamentoRecorrente(supabase, lembreteId, hojeSP().data)
  revalidatePath('/painel', 'layout')
  revalidatePath('/painel/lembretes')
  revalidatePath('/painel/financeiro')
}
