import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { FiadosClient } from './FiadosClient'

const semAcento = (s: string) =>
  s.normalize('NFD').split('').filter((c) => { const n = c.charCodeAt(0); return n < 768 || n > 879 }).join('').toUpperCase().trim()

export default async function FiadosPage() {
  const supabase = await createServiceClient()

  const [lancamentos, pessoas] = await Promise.all([
    fetchAll<{ id: string; codigo: number | null; descricao: string | null; pessoa_nome: string | null; valor: number | null; valor_pago: number | null; data_vencimento: string | null; venda_id: string | null }>(
      (from, to) => supabase
        .from('lancamentos')
        .select('id, codigo, descricao, pessoa_nome, valor, valor_pago, data_vencimento, venda_id')
        .eq('tipo', 'receber').eq('status', 'pendente')
        .order('id').range(from, to),
    ),
    fetchAll<{ nome: string; telefone: string | null }>(
      (from, to) => supabase.from('pessoas').select('nome, telefone').order('id').range(from, to),
    ),
  ])

  // telefone por nome normalizado (pra montar o link do WhatsApp)
  const telPorNome = new Map<string, string>()
  for (const p of pessoas) {
    if (p.nome && p.telefone) telPorNome.set(semAcento(p.nome), p.telefone)
  }

  const hoje = new Date().toISOString().slice(0, 10)

  // agrupa por cliente + guarda as notas (lançamentos) de cada um
  type Nota = { id: string; codigo: number | null; descricao: string | null; valor: number; vencimento: string | null; venda_id: string | null; vencida: boolean }
  const mapa = new Map<string, { nome: string; total: number; vencido: number; qtd: number; notas: Nota[] }>()
  for (const l of lancamentos) {
    const nome = l.pessoa_nome?.trim() || 'Sem nome'
    const devendo = (l.valor ?? 0) - (l.valor_pago ?? 0)
    if (devendo <= 0.01) continue
    const chave = semAcento(nome)
    const atual = mapa.get(chave) ?? { nome, total: 0, vencido: 0, qtd: 0, notas: [] }
    const vencida = !!(l.data_vencimento && l.data_vencimento.slice(0, 10) < hoje)
    atual.total += devendo
    atual.qtd += 1
    if (vencida) atual.vencido += devendo
    atual.notas.push({ id: l.id, codigo: l.codigo, descricao: l.descricao, valor: devendo, vencimento: l.data_vencimento, venda_id: l.venda_id, vencida })
    mapa.set(chave, atual)
  }

  const clientes = [...mapa.entries()]
    .map(([chave, c]) => ({ ...c, telefone: telPorNome.get(chave) ?? null }))
    .sort((a, b) => b.total - a.total)

  const totalReceber = clientes.reduce((s, c) => s + c.total, 0)
  const totalVencido = clientes.reduce((s, c) => s + c.vencido, 0)

  return (
    <FiadosClient
      clientes={clientes}
      totalReceber={totalReceber}
      totalVencido={totalVencido}
    />
  )
}
