import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { PainelShell } from '@/components/PainelShell'
import { NavProgress } from '@/components/NavProgress'
import { createServiceClient, permissoesEfetivas, configAcesso } from '@/lib/supabase/server'
import { permissaoPorRota, temPermissao } from '@/lib/permissoes'
import { acessoBloqueado } from '@/lib/acesso'
import { lembretesDeCaixa, HORARIOS_PADRAO, type HorariosCaixa, type Lembrete as AvisoCaixa } from '@/lib/lembrete-caixa'
import { pendentesDeHoje, hojeSP, type Lembrete, type LembretePendente } from '@/lib/lembretes'

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const h = await headers()
  const email    = h.get('x-user-email') ?? ''
  const userId   = h.get('x-user-id')   ?? ''
  const pathname = h.get('x-pathname')  ?? ''

  let nome        = email.split('@')[0]
  let permissoes: string[] = []
  let isMaster    = false
  let ativo       = true

  if (userId) {
    try {
      const supabase = await createServiceClient()
      const { data } = await supabase.from('perfis').select('nome').eq('id', userId).maybeSingle()
      if (data) nome = data.nome ?? nome
      // permissões efetivas (via cargo dinâmico, se houver)
      const ef = await permissoesEfetivas(userId)
      permissoes = ef.permissoes
      isMaster   = ef.isMaster
      ativo      = ef.ativo
    } catch {}
  }

  // Conta desativada → logout
  if (!ativo) redirect('/api/auth/signout')

  // Restrição de horário/dias — Master (dono) sempre entra.
  if (userId && !isMaster) {
    const motivo = acessoBloqueado(await configAcesso(userId))
    if (motivo) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-6 text-center">
          <div className="text-5xl">🔒</div>
          <h1 className="text-xl font-bold text-gray-800">Fora do horário de acesso</h1>
          <p className="max-w-sm text-sm text-gray-500">{motivo}</p>
          {/* logout via form POST (nunca <Link>/GET: o Next prefetcha e desloga sozinho) */}
          <form action="/api/auth/signout" method="POST">
            <button type="submit" className="rounded-xl bg-gray-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-900 transition">
              Sair
            </button>
          </form>
        </div>
      )
    }
  }

  // Checa permissão para a rota atual
  const permNecessaria = permissaoPorRota(pathname)
  if (permNecessaria && !temPermissao(permissoes, permNecessaria, isMaster)) {
    redirect('/painel?acesso=negado')
  }

  // ── Avisos da barra: caixa aberto fora de hora + rotinas da equipe ("Duda conferir
  //    caixa 18:30"). Um caixa passou a noite aberto em 13/07 — o sistema sabia e não
  //    avisava ninguém.
  let avisosCaixa: AvisoCaixa[] = []
  let rotinas: LembretePendente[] = []
  let badges: Record<string, number> = {}

  if (userId) {
    try {
      const supabase = await createServiceClient()
      const podePdv = temPermissao(permissoes, 'pdv', isMaster)
      const hoje = hojeSP().data

      const [caixasRes, cfgRes, lojasRes, meuRes, lembretesRes, feitosRes] = await Promise.all([
        podePdv ? supabase.from('caixas').select('id, aberto_em, loja_id').eq('status', 'aberto') : Promise.resolve({ data: [] }),
        podePdv ? supabase.from('configuracoes').select('valor').eq('chave', 'pdv').maybeSingle() : Promise.resolve({ data: null }),
        podePdv ? supabase.from('lojas').select('id, nome') : Promise.resolve({ data: [] }),
        supabase.from('perfis').select('cargo_id').eq('id', userId).maybeSingle(),
        supabase.from('lembretes').select('id, titulo, descricao, perfil_id, cargo_id, hora, dias, ativo').eq('ativo', true),
        supabase.from('lembretes_feitos').select('lembrete_id, perfil_id, feito_em').eq('data', hoje),
      ])

      if (podePdv) {
        const nomeLoja: Record<string, string> = Object.fromEntries(((lojasRes.data ?? []) as { id: string; nome: string }[]).map((l) => [l.id, l.nome]))
        const cfg = ((cfgRes.data as { valor?: Record<string, string> } | null)?.valor ?? {}) as Record<string, string>
        const horarios: HorariosCaixa = {
          semana: cfg.hora_fechar_semana || HORARIOS_PADRAO.semana,
          sabado: cfg.hora_fechar_sabado || HORARIOS_PADRAO.sabado,
        }
        avisosCaixa = lembretesDeCaixa(
          ((caixasRes.data ?? []) as { id: string; aberto_em: string; loja_id: string | null }[]).map((c) => ({
            id: c.id,
            aberto_em: c.aberto_em,
            loja: c.loja_id ? (nomeLoja[c.loja_id] ?? null) : null,
          })),
          horarios,
        )
      }

      rotinas = pendentesDeHoje(
        (lembretesRes.data ?? []) as Lembrete[],
        feitosRes.data ?? [],
        userId,
        (meuRes.data?.cargo_id as string | null) ?? null,
      )

      const { count: perguntasPendentes } = await supabase
        .from('integracoes_mercado_livre_perguntas')
        .select('*', { count: 'exact', head: true })
        .eq('respondida', false)
      if (perguntasPendentes) {
        badges['/painel/integracoes/lojas/mercado-livre/perguntas'] = perguntasPendentes
      }
    } catch {}
  }

  return (
    <>
      <NavProgress />
      <PainelShell
        email={email}
        nome={nome}
        permissoes={permissoes}
        isMaster={isMaster}
        avisosCaixa={avisosCaixa}
        rotinas={rotinas}
        badges={badges}
      >
        {children}
      </PainelShell>
    </>
  )
}
