import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { hojeSP } from '@/lib/utils'
import { ehUltimoDiaUtil } from '@/lib/dia-util'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Cron diário (Vercel): quando HOJE é o último dia útil do mês, avisa os grupos
// do Telegram pra fechar o mês. NÃO fecha nada sozinho — o fechamento continua no
// clique do dono (supervisão humana, porque ainda tem bug), reusando o botão de
// /painel/fechamento-mes. Avisa 1x por mês (flag em configuracoes) pra não encher
// o grupo se o cron disparar de novo.
export async function GET() {
  const hoje = hojeSP()
  if (!ehUltimoDiaUtil(hoje)) {
    return NextResponse.json({ ok: true, ultimoDiaUtil: false, hoje })
  }

  const supabase = await createServiceClient()
  const mes = hoje.slice(0, 7)
  const chave = 'aviso_fechamento:' + mes
  const { data: ja } = await supabase.from('configuracoes').select('chave').eq('chave', chave).maybeSingle()
  if (ja) return NextResponse.json({ ok: true, ultimoDiaUtil: true, jaAvisado: true, hoje })

  const grupos = [
    { token: process.env.TELEGRAM_TOKEN_PETROPOLIS || '', grupo: Number(process.env.TELEGRAM_GRUPO_PETROPOLIS || '0') },
    { token: process.env.TELEGRAM_TOKEN_TERESOPOLIS || '', grupo: Number(process.env.TELEGRAM_GRUPO_TERESOPOLIS || '0') },
  ].filter((g) => g.token && g.grupo)

  const msg = '📅 Hoje (' + hoje + ') é o último dia útil do mês.\nFeche o mês no painel: https://tecnocell-cloud.vercel.app/painel/fechamento-mes'
  let enviados = 0
  for (const g of grupos) {
    const r = await fetch('https://api.telegram.org/bot' + g.token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: g.grupo, text: msg, disable_web_page_preview: true }),
    })
    if (r.ok) enviados++
  }

  await supabase.from('configuracoes').upsert(
    { chave, valor: { avisado_em: new Date().toISOString(), hoje } },
    { onConflict: 'chave' },
  )

  return NextResponse.json({ ok: true, ultimoDiaUtil: true, avisado: true, enviados, hoje })
}
