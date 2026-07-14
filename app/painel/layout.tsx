import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { PainelShell } from '@/components/PainelShell'
import { NavProgress } from '@/components/NavProgress'
import { createServiceClient, permissoesEfetivas, configAcesso } from '@/lib/supabase/server'
import { permissaoPorRota, temPermissao } from '@/lib/permissoes'
import { acessoBloqueado } from '@/lib/acesso'
import { lembretesDeCaixa, HORARIOS_PADRAO, type HorariosCaixa, type Lembrete } from '@/lib/lembrete-caixa'

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

  // Lembrete de fechar o caixa — só pra quem opera o PDV.
  // (Um caixa passou a noite aberto em 13/07: o sistema sabia e não avisava ninguém.)
  let lembretes: Lembrete[] = []
  if (temPermissao(permissoes, 'pdv', isMaster)) {
    try {
      const supabase = await createServiceClient()
      const [caixasRes, cfgRes, lojasRes] = await Promise.all([
        supabase.from('caixas').select('id, aberto_em, loja_id').eq('status', 'aberto'),
        supabase.from('configuracoes').select('valor').eq('chave', 'pdv').maybeSingle(),
        supabase.from('lojas').select('id, nome'),
      ])
      const nomeLoja: Record<string, string> = Object.fromEntries((lojasRes.data ?? []).map((l) => [l.id, l.nome]))
      const cfg = (cfgRes.data?.valor ?? {}) as Record<string, string>
      const horarios: HorariosCaixa = {
        semana: cfg.hora_fechar_semana || HORARIOS_PADRAO.semana,
        sabado: cfg.hora_fechar_sabado || HORARIOS_PADRAO.sabado,
      }
      lembretes = lembretesDeCaixa(
        (caixasRes.data ?? []).map((c) => ({
          id: c.id,
          aberto_em: c.aberto_em,
          loja: c.loja_id ? (nomeLoja[c.loja_id] ?? null) : null,
        })),
        horarios,
      )
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
        lembretes={lembretes}
      >
        {children}
      </PainelShell>
    </>
  )
}
