'use server'

import { createServiceClient, requirePermissao, fetchAll } from '@/lib/supabase/server'
import { lerXlsx, desfazerCelulaSegura } from '@/lib/xlsx'
import { validarCpfCnpj } from '@/lib/validacoes'
import { COL, MARCA } from '@/lib/planilha-clientes'
import { revalidatePath } from 'next/cache'

// Planilha nativa (exportada por nós mesmos, não do SIGE). ID em branco =
// cadastro novo; ID preenchido = atualiza aquele. Mesma lógica de conferência
// do importador de produtos: mostra o que muda, só grava depois de confirmar.

const txt = (v: string | undefined): string => desfazerCelulaSegura((v ?? '').trim())

const simNao = (v: string | undefined): boolean | null => {
  const s = txt(v).toUpperCase()
  if (s === 'SIM') return true
  if (s === 'NÃO' || s === 'NAO') return false
  return null
}

const tipoValido = new Set(['cliente', 'fornecedor', 'ambos'])
const tipoPorLabel: Record<string, string> = { cliente: 'cliente', fornecedor: 'fornecedor', ambos: 'ambos' }

export type MudancaPessoa = {
  id: string
  nome: string
  acao: 'novo' | 'atualizar'
  diffs: string[]
  campos: Record<string, unknown>
}

export type ConferenciaPessoas = {
  aba: string
  abas: string[]
  linhas: number
  novos: number
  atualizar: number
  semMudanca: number
  mudancas: MudancaPessoa[]
  erros: string[]
}

export type ResultadoConferenciaPessoas =
  | { ok: false; erros: string[] }
  | { ok: true; conferencia: ConferenciaPessoas }

type PessoaBanco = {
  id: string; nome: string; tipo: string | null; pessoa_fisica: boolean | null; cpf_cnpj: string | null
  email: string | null; telefone: string | null; celular: string | null
  cep: string | null; endereco: string | null; numero: string | null; complemento: string | null; bairro: string | null
  cidade: string | null; estado: string | null; ativo: boolean | null
}

export async function conferirImportacaoPessoas(formData: FormData): Promise<ResultadoConferenciaPessoas> {
  try {
    await requirePermissao('clientes')
  } catch {
    return { ok: false, erros: ['Sem permissao para mexer no cadastro de clientes.'] }
  }

  const file = formData.get('arquivo') as File | null
  if (!file || file.size === 0) return { ok: false, erros: ['Nenhum arquivo enviado.'] }

  let planilha
  try {
    planilha = await lerXlsx(await file.arrayBuffer(), (formData.get('aba') as string) || undefined)
  } catch {
    return { ok: false, erros: ['Nao consegui ler o arquivo. Precisa ser .xlsx.'] }
  }

  const faltando = [COL.nome, COL.tipoArquivo].filter((c) => !planilha.colunas.includes(c))
  if (faltando.length > 0) {
    return {
      ok: false,
      erros: [`A aba "${planilha.aba}" nao parece ser a planilha de clientes — falta a coluna: ${faltando.join(', ')}.`],
    }
  }

  // As planilhas de Produtos e Clientes têm colunas com o mesmo nome ("Nome"),
  // então confere aqui se não é a planilha errada no importador errado.
  const marcaEncontrada = txt(planilha.linhas[0]?.[COL.tipoArquivo])
  if (planilha.linhas.length > 0 && marcaEncontrada !== MARCA) {
    return {
      ok: false,
      erros: [`Essa nao parece ser a planilha de Clientes — confira se nao subiu a planilha errada (ex: a de Produtos) por engano.`],
    }
  }

  const supabase = await createServiceClient()

  // cadastro é pequeno (poucos milhares) — busca todo mundo de uma vez em vez
  // de várias consultas .in(): mais simples e sem risco de maiúscula/minúscula
  // fazer a checagem de duplicata furar (Postgres .in() é case-sensitive).
  const todasPessoas = await fetchAll<PessoaBanco>((from, to) => supabase.from('pessoas')
    .select('id, nome, tipo, pessoa_fisica, cpf_cnpj, email, telefone, celular, cep, endereco, numero, complemento, bairro, cidade, estado, ativo')
    .range(from, to))

  const existentesPorId = new Map(todasPessoas.map((p) => [p.id, p]))

  // dono atual de cada cpf/email — pra travar conflito com OUTRO cadastro
  // (não é conflito se for o mesmo id que está sendo editado)
  const donoCpf = new Map<string, { id: string; nome: string }>()
  const donoEmail = new Map<string, { id: string; nome: string }>()
  for (const p of todasPessoas) {
    if (p.cpf_cnpj) donoCpf.set(p.cpf_cnpj, { id: p.id, nome: p.nome })
    if (p.email) donoEmail.set(p.email.toLowerCase(), { id: p.id, nome: p.nome })
  }

  const mudancas: MudancaPessoa[] = []
  const erros: string[] = []
  const cpfNaPlanilha = new Map<string, number>() // cpf -> linha onde apareceu primeiro
  const emailNaPlanilha = new Map<string, number>()
  const idNaPlanilha = new Map<string, number>()
  let semMudanca = 0

  planilha.linhas.forEach((linha, i) => {
    const nLinha = i + 2
    const nome = txt(linha[COL.nome])
    if (!nome) { erros.push(`Linha ${nLinha}: sem Nome.`); return }

    const idPlanilha = txt(linha[COL.id])
    const atual = idPlanilha ? existentesPorId.get(idPlanilha) : undefined
    if (idPlanilha && !atual) { erros.push(`Linha ${nLinha} (${nome}): ID "${idPlanilha}" não encontrado — deixe o ID em branco pra criar um cadastro novo.`); return }
    if (idPlanilha) {
      const primeiraLinha = idNaPlanilha.get(idPlanilha)
      if (primeiraLinha) { erros.push(`Linha ${nLinha} (${nome}): ID repetido — já apareceu na linha ${primeiraLinha}.`); return }
      idNaPlanilha.set(idPlanilha, nLinha)
    }

    const tipoLabel = txt(linha[COL.tipo]).toLowerCase()
    if (tipoLabel && !tipoValido.has(tipoLabel)) { erros.push(`Linha ${nLinha} (${nome}): Tipo "${linha[COL.tipo]}" não reconhecido — use Cliente, Fornecedor ou Ambos.`); return }
    const tipo = tipoLabel ? tipoPorLabel[tipoLabel] : 'cliente'

    const pessoaFisicaLabel = txt(linha[COL.pessoaFisica]).toLowerCase()
    if (pessoaFisicaLabel && !pessoaFisicaLabel.startsWith('fís') && !pessoaFisicaLabel.startsWith('fis') && !pessoaFisicaLabel.startsWith('jur')) {
      erros.push(`Linha ${nLinha} (${nome}): "Pessoa Física ou Jurídica" com valor "${linha[COL.pessoaFisica]}" não reconhecido — use Física ou Jurídica.`)
      return
    }
    const pessoa_fisica = pessoaFisicaLabel.startsWith('jur') ? false : true

    const cpfCnpjLimpo = txt(linha[COL.cpfCnpj]).replace(/\D/g, '')
    let cpf_cnpj: string | null = null
    if (cpfCnpjLimpo) {
      const { valido } = validarCpfCnpj(cpfCnpjLimpo)
      if (!valido) { erros.push(`Linha ${nLinha} (${nome}): CPF/CNPJ inválido.`); return }
      const donoId = idPlanilha || null
      const dono = donoCpf.get(cpfCnpjLimpo)
      if (dono && dono.id !== donoId) { erros.push(`Linha ${nLinha} (${nome}): CPF/CNPJ já usado por "${dono.nome}".`); return }
      const primeiraLinha = cpfNaPlanilha.get(cpfCnpjLimpo)
      if (primeiraLinha) { erros.push(`Linha ${nLinha} (${nome}): CPF/CNPJ repetido — já apareceu na linha ${primeiraLinha}.`); return }
      cpfNaPlanilha.set(cpfCnpjLimpo, nLinha)
      cpf_cnpj = cpfCnpjLimpo
    }

    const emailDigitado = txt(linha[COL.email])
    const emailChave = emailDigitado.toLowerCase() // só pra achar duplicata — grava como digitou, não força minúsculo
    let email: string | null = null
    if (emailDigitado) {
      const donoId = idPlanilha || null
      const dono = donoEmail.get(emailChave)
      if (dono && dono.id !== donoId) { erros.push(`Linha ${nLinha} (${nome}): Email já usado por "${dono.nome}".`); return }
      const primeiraLinha = emailNaPlanilha.get(emailChave)
      if (primeiraLinha) { erros.push(`Linha ${nLinha} (${nome}): Email repetido — já apareceu na linha ${primeiraLinha}.`); return }
      emailNaPlanilha.set(emailChave, nLinha)
      email = emailDigitado
    }

    const campos: Record<string, unknown> = {
      nome,
      tipo,
      pessoa_fisica,
      cpf_cnpj,
      email,
      telefone: txt(linha[COL.telefone]) || null,
      celular: txt(linha[COL.celular]) || null,
      cep: txt(linha[COL.cep]) || null,
      endereco: txt(linha[COL.endereco]) || null,
      numero: txt(linha[COL.numero]) || null,
      complemento: txt(linha[COL.complemento]) || null,
      bairro: txt(linha[COL.bairro]) || null,
      cidade: txt(linha[COL.cidade]) || null,
      estado: txt(linha[COL.estado]) || null,
      ativo: simNao(linha[COL.ativo]) ?? true,
    }

    if (!atual) {
      mudancas.push({ id: crypto.randomUUID(), nome, acao: 'novo', diffs: [], campos })
      return
    }

    const diffs: string[] = []
    const compara = (chave: keyof PessoaBanco, rotulo: string, fmt = (v: unknown) => String(v ?? '—')) => {
      const antes = atual[chave]
      const depois = campos[chave]
      if (String(antes ?? '') !== String(depois ?? '')) diffs.push(`${rotulo}: ${fmt(antes)} → ${fmt(depois)}`)
    }
    compara('nome', 'Nome')
    compara('tipo', 'Tipo')
    compara('pessoa_fisica', 'Física/Jurídica', (v) => (v ? 'Física' : 'Jurídica'))
    compara('cpf_cnpj', 'CPF/CNPJ')
    compara('email', 'Email')
    compara('telefone', 'Telefone')
    compara('celular', 'Celular')
    compara('cep', 'CEP')
    compara('endereco', 'Endereço')
    compara('numero', 'Número')
    compara('complemento', 'Complemento')
    compara('bairro', 'Bairro')
    compara('cidade', 'Cidade')
    compara('estado', 'Estado')
    compara('ativo', 'Ativo', (v) => (v ? 'sim' : 'não'))

    if (diffs.length === 0) semMudanca++
    else mudancas.push({ id: idPlanilha, nome, acao: 'atualizar', diffs, campos })
  })

  return {
    ok: true,
    conferencia: {
      aba: planilha.aba,
      abas: planilha.abas,
      linhas: planilha.linhas.length,
      novos: mudancas.filter((m) => m.acao === 'novo').length,
      atualizar: mudancas.filter((m) => m.acao === 'atualizar').length,
      semMudanca,
      mudancas,
      erros,
    },
  }
}

export async function aplicarImportacaoPessoas(
  mudancas: MudancaPessoa[]
): Promise<{ ok: boolean; novos: number; atualizados: number; erro?: string }> {
  await requirePermissao('clientes')
  if (!Array.isArray(mudancas) || mudancas.length === 0) {
    return { ok: false, novos: 0, atualizados: 0, erro: 'Nada para aplicar.' }
  }
  const supabase = await createServiceClient()

  let novos = 0
  let atualizados = 0

  for (let i = 0; i < mudancas.length; i += 200) {
    const lote = mudancas.slice(i, i + 200)
    const linhas = lote.map((m) => ({ id: m.id, ...m.campos }))
    const { error } = await supabase.from('pessoas').upsert(linhas, { onConflict: 'id' })
    if (error) {
      return {
        ok: false, novos, atualizados,
        erro: `${error.message}. Foram gravados ${novos + atualizados} cadastro(s) antes de parar.`,
      }
    }
    novos += lote.filter((m) => m.acao === 'novo').length
    atualizados += lote.filter((m) => m.acao === 'atualizar').length
  }

  revalidatePath('/painel/clientes')
  return { ok: true, novos, atualizados }
}
