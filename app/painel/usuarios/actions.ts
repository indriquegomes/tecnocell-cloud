'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { TODAS_PERMISSOES } from '@/lib/permissoes'
import { normalizarUsuario } from '@/lib/utils'
import { revalidatePath } from 'next/cache'

export type ActionResult = { ok: true; message: string } | { ok: false; message: string }
export type ConviteResult = { ok: true; message: string; link: string } | { ok: false; message: string }

const TODAS_KEYS = TODAS_PERMISSOES.map((p) => p.key)

export async function criarConvite(_: ConviteResult | null, fd: FormData): Promise<ConviteResult> {
  const token = fd.get('access_token') as string
  let admin: { id: string }
  try { admin = await requirePermissao('usuarios', token) } catch { return { ok: false, message: 'Não autorizado' } }

  const usuario  = (fd.get('usuario') as string ?? '').trim()
  const nome     = (fd.get('nome') as string ?? '').trim()
  const isMaster = fd.getAll('is_master').includes('1')
  const perms    = fd.getAll('permissoes') as string[]
  if (!usuario || !nome) return { ok: false, message: 'Preencha nome e usuário' }
  const username = normalizarUsuario(usuario)
  const email = username + '@tecnocell.local'

  const supabase = await createServiceClient()

  // Conta criada com senha aleatória — a funcionária define a real pelo link
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email, password: crypto.randomUUID(), email_confirm: true,
  })
  if (authErr || !authData.user) return { ok: false, message: authErr?.message ?? 'Erro ao criar conta' }

  const cargoId = (fd.get('cargo_id') as string) || null
  const salario = Math.max(0, parseFloat((fd.get('salario') as string) || '0') || 0)
  const { error: perfErr } = await supabase.from('perfis').insert({
    id: authData.user.id, nome, username, permissoes: isMaster ? TODAS_KEYS : perms, is_master: isMaster, ativo: true, cargo_id: cargoId, salario,
  })
  if (perfErr) { await supabase.auth.admin.deleteUser(authData.user.id); return { ok: false, message: perfErr.message } }

  const conviteToken = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
  const expira = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
  const { error: cErr } = await supabase.from('convites').insert({
    token: conviteToken, user_id: authData.user.id, nome, expires_at: expira, criado_por: admin.id,
  })
  if (cErr) { await supabase.auth.admin.deleteUser(authData.user.id); return { ok: false, message: cErr.message } }

  revalidatePath('/painel/usuarios')
  return { ok: true, message: `Convite criado para ${nome}`, link: `/convite/${conviteToken}` }
}

export async function criarUsuario(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const token = fd.get('access_token') as string
  try { await requirePermissao('usuarios', token) } catch { return { ok: false, message: 'Não autorizado' } }

  const usuario  = (fd.get('usuario') as string ?? '').trim()
  const senha    = (fd.get('senha') as string ?? '').trim()
  const nome     = (fd.get('nome') as string ?? '').trim()
  const isMaster = fd.getAll('is_master').includes('1')
  const perms    = fd.getAll('permissoes') as string[]

  if (!usuario || !senha || !nome) return { ok: false, message: 'Preencha todos os campos obrigatórios' }
  if (senha.length < 6) return { ok: false, message: 'Senha deve ter ao menos 6 caracteres' }
  const username = normalizarUsuario(usuario)
  if (!username) return { ok: false, message: 'Usuário inválido' }
  const email = username + '@tecnocell.local'

  const supabase = await createServiceClient()

  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })

  if (authErr || !authData.user) {
    return { ok: false, message: authErr?.message ?? 'Erro ao criar conta' }
  }

  const { error: perfErr } = await supabase.from('perfis').insert({
    id: authData.user.id,
    nome,
    username,
    permissoes: isMaster ? TODAS_KEYS : perms,
    is_master: isMaster,
    ativo: true,
    cargo_id: (fd.get('cargo_id') as string) || null,
    lojas_permitidas: (fd.getAll('lojas_permitidas') as string[]).filter(Boolean),
    data_admissao: (fd.get('data_admissao') as string) || null,
    salario: Math.max(0, parseFloat((fd.get('salario') as string) || '0') || 0),
  })

  if (perfErr) {
    await supabase.auth.admin.deleteUser(authData.user.id)
    return { ok: false, message: perfErr.message }
  }

  revalidatePath('/painel/usuarios')
  return { ok: true, message: `Usuário ${nome} criado com sucesso` }
}

export async function atualizarPerfil(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const token = fd.get('access_token') as string
  try { await requirePermissao('usuarios', token) } catch { return { ok: false, message: 'Não autorizado' } }

  const userId   = fd.get('user_id') as string
  const nome     = (fd.get('nome') as string ?? '').trim()
  const username = normalizarUsuario((fd.get('username') as string ?? '').trim()) || null
  const isMaster = fd.getAll('is_master').includes('1')
  const ativo    = fd.getAll('ativo').includes('1')
  const perms    = fd.getAll('permissoes') as string[]
  const cargoId  = (fd.get('cargo_id') as string) || null

  if (!userId || !nome) return { ok: false, message: 'Dados inválidos' }

  // Config operacional (lojas + PDV padrão). lojas_permitidas vazio = todas.
  const lojasPermitidas = (fd.getAll('lojas_permitidas') as string[]).filter(Boolean)
  const tabelasPermitidas = (fd.getAll('tabelas_permitidas') as string[]).filter(Boolean)
  const pdvLojaId    = (fd.get('pdv_loja_id') as string) || null
  const pdvDepositoId = (fd.get('pdv_deposito_id') as string) || null
  // Restrição de acesso (checkbox lido com getAll — hidden+get() pegaria errado)
  const horaInicio = (fd.get('acesso_hora_inicio') as string) || null
  const horaFim    = (fd.get('acesso_hora_fim') as string) || null
  const bloqSabado  = fd.getAll('acesso_bloqueia_sabado').includes('1')
  const bloqDomingo = fd.getAll('acesso_bloqueia_domingo').includes('1')
  const bloqFeriado = fd.getAll('acesso_bloqueia_feriado').includes('1')
  const metaRaw = parseFloat((fd.get('meta_venda_mensal') as string) || '0')
  const metaVendaMensal = isNaN(metaRaw) ? 0 : Math.max(0, metaRaw)
  const salarioRaw = parseFloat((fd.get('salario') as string) || '0')
  const salario = isNaN(salarioRaw) ? 0 : Math.max(0, salarioRaw)
  const chavePix = ((fd.get('chave_pix') as string) ?? '').trim() || null
  // Config do MOTOBOY (valor fixo + adicional por loja + adicional extra + tipo)
  const mf = parseFloat((fd.get('motoboy_valor_fixo') as string) || '0')
  const ml = parseFloat((fd.get('motoboy_adicional_loja') as string) || '0')
  const me = parseFloat((fd.get('motoboy_adicional_extra') as string) || '0')
  const motoboyValorFixo = isNaN(mf) ? 0 : Math.max(0, mf)
  const motoboyAdicionalLoja = isNaN(ml) ? 0 : Math.max(0, ml)
  const motoboyAdicionalExtra = isNaN(me) ? 0 : Math.max(0, me)
  const motoboyTipo = (fd.get('motoboy_tipo') as string) || 'variavel'
  // Vínculo (MEI/CLT) + campos
  const vinculo = ((fd.get('vinculo') as string) || '').trim() || null
  const mvs = parseFloat((fd.get('mei_valor_servico') as string) || '0')
  const cvt = parseFloat((fd.get('clt_vale_transporte') as string) || '0')
  const meiValorServico = isNaN(mvs) ? 0 : Math.max(0, mvs)
  const cltValeTransporte = isNaN(cvt) ? 0 : Math.max(0, cvt)
  const meiDiaPagamento = (fd.get('mei_dia_pagamento') as string) || null
  const meiFuncoes = ((fd.get('mei_funcoes') as string) || '').trim() || null
  const dataDemissao = (fd.get('data_demissao') as string) || null
  const dataContratoInicio = (fd.get('data_contrato_inicio') as string) || null
  const dataContratoFim = (fd.get('data_contrato_fim') as string) || null
  // Freelancer (também presta serviço por hora)
  const freelancer = fd.getAll('freelancer').includes('1')
  const fvh = parseFloat((fd.get('freelancer_valor_hora') as string) || '0')
  const freelancerValorHora = isNaN(fvh) ? 0 : Math.max(0, fvh)

  const supabase = await createServiceClient()
  // Datas de contrato são CONDICIONAIS por vínculo: só escreve o campo que aquele
  // vínculo renderiza. Escrever sempre apagaria data_admissao de MEI/freelancer
  // (o input nem vai no form) — e o detector de falta usa data_admissao pra todo mundo.
  const dataAdmissao = (fd.get('data_admissao') as string) || null
  const update: Record<string, unknown> = {
    nome,
    username,
    permissoes: isMaster ? TODAS_KEYS : (cargoId ? [] : perms),
    is_master: isMaster,
    ativo,
    cargo_id: cargoId,
    lojas_permitidas: lojasPermitidas,
    tabelas_permitidas: tabelasPermitidas,
    pdv_loja_id: pdvLojaId,
    pdv_deposito_id: pdvDepositoId,
    acesso_hora_inicio: horaInicio,
    acesso_hora_fim: horaFim,
    acesso_bloqueia_sabado: bloqSabado,
    acesso_bloqueia_domingo: bloqDomingo,
    acesso_bloqueia_feriado: bloqFeriado,
    meta_venda_mensal: metaVendaMensal,
    salario,
    chave_pix: chavePix,
    motoboy_valor_fixo: motoboyValorFixo,
    motoboy_adicional_loja: motoboyAdicionalLoja,
    motoboy_adicional_extra: motoboyAdicionalExtra,
    motoboy_tipo: motoboyTipo,
    vinculo,
    mei_valor_servico: meiValorServico,
    mei_dia_pagamento: meiDiaPagamento,
    mei_funcoes: meiFuncoes,
    clt_vale_transporte: cltValeTransporte,
    freelancer,
    freelancer_valor_hora: freelancerValorHora,
  }
  if (vinculo === 'clt' || vinculo === 'estagio') {
    update.data_admissao = dataAdmissao
    update.data_demissao = dataDemissao
  }
  if (vinculo === 'mei') {
    update.data_contrato_inicio = dataContratoInicio
    update.data_contrato_fim = dataContratoFim
  }

  const { error } = await supabase.from('perfis').update(update).eq('id', userId)

  if (error) return { ok: false, message: error.message }

  // Horários (escala semanal) — salva na MESMA tabela da aba Escala, assim
  // ficam vinculados. seg=1 .. dom=0 (mesma convenção de escalas.dia).
  for (const dia of [1, 2, 3, 4, 5, 6, 0]) {
    const entrada = (fd.get('horario_' + dia + '_entrada') as string) || ''
    const saida = (fd.get('horario_' + dia + '_saida') as string) || ''
    const folga = fd.getAll('horario_' + dia + '_folga').includes('1')
    if (folga || !entrada || !saida) {
      await supabase.from('escalas').delete().eq('perfil_id', userId).eq('dia', dia)
    } else {
      await supabase.from('escalas').upsert(
        { perfil_id: userId, loja_id: null, dia, entrada, saida, ativo: true },
        { onConflict: 'perfil_id,dia' },
      )
    }
  }

  revalidatePath('/painel/usuarios')
  return { ok: true, message: 'Perfil atualizado' }
}

export async function alterarSenha(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const token = fd.get('access_token') as string
  try { await requirePermissao('usuarios', token) } catch { return { ok: false, message: 'Não autorizado' } }

  const userId = fd.get('user_id') as string
  const senha  = (fd.get('senha') as string ?? '').trim()

  if (!userId || !senha) return { ok: false, message: 'Dados inválidos' }
  if (senha.length < 6) return { ok: false, message: 'Senha deve ter ao menos 6 caracteres' }

  const supabase = await createServiceClient()
  const { error } = await supabase.auth.admin.updateUserById(userId, { password: senha })

  if (error) return { ok: false, message: error.message }
  return { ok: true, message: 'Senha alterada com sucesso' }
}

// Libera o login de um usuário que foi bloqueado ao deslogar (segurança).
export async function liberarLogin(id: string) {
  await requirePermissao('usuarios')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('perfis').update({ login_bloqueado: false }).eq('id', id)
  if (error) return
  revalidatePath('/painel/usuarios')
}

// Apaga um usuário (ex-funcionário) POR INTEIRO: login (auth) + cadastro (perfis)
// + registros de RH dele (ponto/banco de horas). O histórico de VENDAS fica
// guardado — vendas grava o nome do vendedor como texto, sem ligação com o cadastro.
export async function excluirUsuario(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const token = fd.get('access_token') as string
  const userId = fd.get('user_id') as string

  let atual: { id: string }
  try { atual = await requirePermissao('usuarios', token) } catch { return { ok: false, message: 'Não autorizado' } }
  if (!userId) return { ok: false, message: 'Usuário inválido' }
  if (atual.id === userId) return { ok: false, message: 'Você não pode apagar a própria conta.' }

  const supabase = await createServiceClient()
  // Não deixa apagar Master — nem por flag própria, nem por cargo master (dev tester/Gerente).
  const { data: alvo } = await supabase.from('perfis').select('is_master, cargo_id').eq('id', userId).maybeSingle()
  if (!alvo) return { ok: false, message: 'Cadastro não encontrado.' }
  if (alvo.is_master) return { ok: false, message: 'Não dá pra apagar conta Master.' }
  if (alvo.cargo_id) {
    const { data: cargo } = await supabase.from('cargos').select('is_master').eq('id', alvo.cargo_id as string).maybeSingle()
    if (cargo?.is_master) return { ok: false, message: 'Não dá pra apagar conta de cargo Master.' }
  }

  // 1) Limpa referências que travariam o delete (FK NO ACTION).
  await supabase.from('rotas_motoboy').delete().eq('perfil_id', userId)
  await supabase.from('lembretes_feitos').delete().eq('perfil_id', userId)
  await supabase.from('escala_excecoes').update({ criado_por: null }).eq('criado_por', userId)
  await supabase.from('lembretes').update({ criado_por: null }).eq('criado_por', userId)

  // 2) Registros de RH do próprio ex-funcionário (sem FK — apaga na mão).
  await supabase.from('pontos').delete().eq('usuario_id', userId)
  await supabase.from('banco_horas').delete().eq('usuario_id', userId)

  // 3) Apaga o cadastro (escalas/escala_excecoes/lembretes dele vão por CASCADE).
  const { error: errPerfil } = await supabase.from('perfis').delete().eq('id', userId)
  if (errPerfil) return { ok: false, message: 'Falha ao apagar cadastro: ' + errPerfil.message }

  // 4) Apaga o login.
  const { error: errAuth } = await supabase.auth.admin.deleteUser(userId)
  if (errAuth) return { ok: false, message: 'Cadastro apagado, mas login falhou: ' + errAuth.message }

  revalidatePath('/painel/usuarios')
  return { ok: true, message: 'Usuário apagado. O histórico de vendas dele ficou guardado.' }
}
