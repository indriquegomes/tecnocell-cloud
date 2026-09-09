'use server'

import { createServiceClient, requireAuth, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { hojeSP } from '@/lib/lembretes'

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
  revalidatePath('/painel', 'layout')
}

// Pagamento recorrente: marcar como feito exige anexar o comprovante. A imagem vai
// pro bucket PRIVADO `pagamentos` e o caminho fica gravado no feito — só some depois
// de pagar e provar. Mesmo padrão de upload do clientes/actions.ts.
const EXT_COMPROVANTE: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
}

export async function marcarPagamentoFeito(accessToken: string, lembreteId: string, file: File | null): Promise<void> {
  const usuario = await requireAuth(accessToken)
  if (!file || file.size === 0) throw new Error('Anexe o comprovante do pagamento.')
  const ext = EXT_COMPROVANTE[file.type]
  if (!ext) throw new Error('Envie uma imagem (JPG, PNG, WEBP ou GIF).')

  const supabase = await createServiceClient()
  const path = `pagamentos/${lembreteId}/${hojeSP().data}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await supabase.storage.from('pagamentos').upload(path, buffer, {
    contentType: file.type,
    upsert: true,
  })
  if (upErr) throw new Error(upErr.message)

  const { error } = await supabase.rpc('marcar_lembrete_feito', {
    p_lembrete_id: lembreteId,
    p_perfil_id: usuario.id,
    p_data: hojeSP().data,
    p_comprovante_url: path,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/painel', 'layout')
  revalidatePath('/painel/lembretes')
}
