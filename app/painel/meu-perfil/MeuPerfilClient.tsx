'use client'

import { useState, useEffect, useRef } from 'react'
import { Spinner } from '@/components/Spinner'
import { createClient } from '@/lib/supabase/client'
import { buscarMeuPerfil, atualizarMeuNome, alterarMinhaSenha, atualizarMinhaFoto, atualizarMeuPin, baterPonto, buscarMeuPontoHoje, buscarMeuBanco, buscarMeuSaldo, buscarMinhaEscala, type Res, type Ponto, type BancoHora, type MinhaEscala } from './actions'

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function MeuPerfilClient() {
  const supabase = createClient()
  const [carregando, setCarregando] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [cargo, setCargo] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  const [senhaAtual, setSenhaAtual] = useState('')
  const [senhaNova, setSenhaNova] = useState('')
  const [senhaNova2, setSenhaNova2] = useState('')

  const [msgNome, setMsgNome] = useState<Res | null>(null)
  const [msgSenha, setMsgSenha] = useState<Res | null>(null)
  const [msgFoto, setMsgFoto] = useState<Res | null>(null)
  const [salvandoNome, setSalvandoNome] = useState(false)
  const [salvandoSenha, setSalvandoSenha] = useState(false)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const [pinNovo, setPinNovo] = useState('')
  const [msgPin, setMsgPin] = useState<Res | null>(null)
  const [salvandoPin, setSalvandoPin] = useState(false)
  const fotoRef = useRef<HTMLInputElement>(null)

  const [pontos, setPontos] = useState<Ponto[]>([])
  const [batendo, setBatendo] = useState(false)
  const [banco, setBanco] = useState<{ saldo: number; itens: BancoHora[] }>({ saldo: 0, itens: [] })
  const [saldoH, setSaldoH] = useState({ hoje: 0, semana: 0 })
  const [escala, setEscala] = useState<MinhaEscala[]>([])
  const [pinPonto, setPinPonto] = useState('')
  const [msgPonto, setMsgPonto] = useState<string | null>(null)

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? ''

  useEffect(() => {
    ;(async () => {
      try {
        const p = await buscarMeuPerfil(await token())
        setNome(p.nome); setEmail(p.email); setCargo(p.cargo); setAvatarUrl(p.avatarUrl)
        setPontos(await buscarMeuPontoHoje(await token()).catch(() => []))
        setBanco(await buscarMeuBanco(await token()).catch(() => ({ saldo: 0, itens: [] })))
        setSaldoH(await buscarMeuSaldo(await token()).catch(() => ({ hoje: 0, semana: 0 })))
        setEscala(await buscarMinhaEscala(await token()).catch(() => []))
      } catch { /* sessão — o proxy redireciona */ }
      finally { setCarregando(false) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function registrarPonto(tipo: string) {
    // Folga e feriado: bate normal. Feriado dobra (×2) automático na saída; folga conta 1× no total semanal.
    await baterPontoDireto(tipo)
  }
  async function baterPontoDireto(tipo: string) {
    setBatendo(true); setMsgPonto(null)
    const r = await baterPonto(await token(), tipo, undefined, undefined, pinPonto)
    if (r.ok) {
      if (r.saiu) { window.location.href = '/api/auth/signout'; return }
      setPontos(await buscarMeuPontoHoje(await token()).catch(() => pontos))
      setPinPonto('')
    } else {
      setMsgPonto(r.message ?? 'Erro ao bater o ponto.')
    }
    setBatendo(false)
  }

  async function salvarNome(e: React.FormEvent) {
    e.preventDefault(); setSalvandoNome(true); setMsgNome(null)
    setMsgNome(await atualizarMeuNome(await token(), nome))
    setSalvandoNome(false)
  }

  async function salvarSenha(e: React.FormEvent) {
    e.preventDefault(); setMsgSenha(null)
    if (senhaNova !== senhaNova2) { setMsgSenha({ ok: false, message: 'As senhas novas não coincidem' }); return }
    setSalvandoSenha(true)
    const r = await alterarMinhaSenha(await token(), senhaAtual, senhaNova)
    setMsgSenha(r)
    if (r.ok) { setSenhaAtual(''); setSenhaNova(''); setSenhaNova2('') }
    setSalvandoSenha(false)
  }

  async function salvarPin(e: React.FormEvent) {
    e.preventDefault(); setMsgPin(null)
    if (!/^[0-9]{4}$/.test(pinNovo)) { setMsgPin({ ok: false, message: 'O PIN precisa ter 4 dígitos.' }); return }
    setSalvandoPin(true)
    setMsgPin(await atualizarMeuPin(await token(), pinNovo))
    setSalvandoPin(false)
  }

  async function enviarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setEnviandoFoto(true); setMsgFoto(null)
    const fd = new FormData(); fd.set('imagem', file)
    const r = await atualizarMinhaFoto(await token(), fd)
    setMsgFoto(r)
    if (r.ok) { const p = await buscarMeuPerfil(await token()); setAvatarUrl(p.avatarUrl) }
    setEnviandoFoto(false)
    if (fotoRef.current) fotoRef.current.value = ''
  }

  if (carregando) return (
    <div className="mx-auto max-w-xl space-y-4">
      <h2 className="text-2xl font-bold text-gray-900">Meu Perfil</h2>
      <p className="text-sm text-gray-400">Carregando...</p>
    </div>
  )

  const msgCls = (r: Res) => r.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'
  const iniciais = nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'

  // ---- Ponto de hoje ----
  const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  const ultimo = pontos[pontos.length - 1]?.tipo ?? null
  const statusPonto = !ultimo ? 'fora' : ultimo === 'saida' ? 'encerrado' : ultimo === 'pausa' ? 'pausa' : 'trabalhando'
  let trabMin = 0, aberto: number | null = null
  for (const p of pontos) {
    const t = new Date(p.criado_em).getTime()
    if (p.tipo === 'entrada' || p.tipo === 'retorno') aberto = t
    else if ((p.tipo === 'pausa' || p.tipo === 'saida') && aberto != null) { trabMin += (t - aberto) / 60000; aberto = null }
  }
  if (aberto != null) trabMin += (Date.now() - aberto) / 60000
  const horasTxt = `${Math.floor(trabMin / 60)}h ${String(Math.round(trabMin % 60)).padStart(2, '0')}m`
  const fmtSaldo = (min: number) => (min > 0 ? '+' : min < 0 ? '−' : '') + Math.floor(Math.abs(min) / 60) + 'h' + String(Math.abs(min) % 60).padStart(2, '0') + 'm'
  const acoesPonto: [string, string, string][] =
    !ultimo || ultimo === 'saida' ? [['entrada', '▶ Entrada', 'bg-emerald-600 hover:bg-emerald-700']]
    : ultimo === 'pausa' ? [['retorno', '▶ Retornar', 'bg-emerald-600 hover:bg-emerald-700']]
    : [['pausa', '🍽 Almoço', 'bg-amber-500 hover:bg-amber-600'], ['saida', '⏹ Saída', 'bg-gray-700 hover:bg-gray-800']]

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Meu Perfil</h2>
      {/* Hero com avatar */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="h-24 bg-gradient-to-r from-blue-700 to-blue-500" />
        <div className="px-6 pb-6">
          <div className="-mt-12 flex items-end gap-4">
            <div className="relative shrink-0">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-blue-100 shadow-md">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt={nome} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-blue-700">{iniciais}</span>
                )}
              </div>
              {/* Botão da câmera pra trocar foto */}
              <button
                type="button"
                onClick={() => fotoRef.current?.click()}
                disabled={enviandoFoto}
                title="Trocar foto"
                className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-white shadow hover:bg-blue-700 disabled:opacity-60 transition"
              >
                {enviandoFoto ? <Spinner className="h-3.5 w-3.5" /> : (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 8a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h2l1.5-2h9L18 8h2a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2v-9a2 2 0 012-2z" />
                  </svg>
                )}
              </button>
              <input ref={fotoRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={enviarFoto} className="hidden" />
            </div>
            <div className="min-w-0 pb-1">
              <h2 className="truncate text-xl font-bold text-gray-900">{nome || 'Meu Perfil'}</h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <span className="truncate text-sm text-gray-500">{email}</span>
                {cargo && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">{cargo}</span>}
              </div>
            </div>
          </div>
          {msgFoto && <div className={`mt-4 rounded-lg border px-3 py-2 text-sm ${msgCls(msgFoto)}`}>{msgFoto.message}</div>}
        </div>
      </div>

      {/* Ponto de hoje */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">🕐 Ponto de hoje</h3>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusPonto === 'trabalhando' ? 'bg-emerald-50 text-emerald-700' : statusPonto === 'pausa' ? 'bg-amber-50 text-amber-700' : statusPonto === 'encerrado' ? 'bg-gray-100 text-gray-500' : 'bg-gray-100 text-gray-400'}`}>
            {statusPonto === 'trabalhando' ? '🟢 Trabalhando' : statusPonto === 'pausa' ? '🍽 Em almoço' : statusPonto === 'encerrado' ? '✓ Encerrado' : 'Fora'}
          </span>
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">PIN (4 dígitos)</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pinPonto}
            onChange={(e) => setPinPonto(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
            placeholder="••••"
            className="w-full rounded-xl border border-gray-200 px-4 py-2 text-center text-lg tracking-widest"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {acoesPonto.map(([t, l, c]) => (
            <button key={t} type="button" onClick={() => registrarPonto(t)} disabled={batendo}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60 ${c}`}>
              {batendo ? <Spinner className="h-3.5 w-3.5" /> : l}
            </button>
          ))}
          <span className="ml-auto text-sm text-gray-500">Trabalhado hoje: <b className="tabular-nums text-gray-800">{horasTxt}</b></span>
        </div>
        {msgPonto && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{msgPonto}</p>}
        <p className="mt-2 text-sm text-gray-500">
          Saldo de horas: <b className={`tabular-nums ${saldoH.hoje > 0 ? 'text-green-600' : saldoH.hoje < 0 ? 'text-red-500' : 'text-gray-600'}`}>{fmtSaldo(saldoH.hoje)}</b> hoje
          {' · '}<b className={`tabular-nums ${saldoH.semana > 0 ? 'text-green-600' : saldoH.semana < 0 ? 'text-red-500' : 'text-gray-600'}`}>{fmtSaldo(saldoH.semana)}</b> na semana
        </p>
        {pontos.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {pontos.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded-lg bg-gray-50 px-2.5 py-1 text-xs text-gray-600">
                {p.tipo === 'pausa' ? '⏸' : p.tipo === 'saida' ? '⏹' : '▶'} {p.tipo === 'pausa' ? 'almoço' : p.tipo} <b className="tabular-nums text-gray-800">{fmtHora(p.criado_em)}</b>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Meu horário (grade da escala) */}
      {escala.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700">🗓 Meu horário</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
            {escala.map((e) => (
              <div key={e.dia} className="rounded-lg bg-gray-50 px-3 py-2 text-center">
                <p className="text-xs font-semibold uppercase text-gray-500">{DIAS[e.dia]}</p>
                <p className="mt-0.5 text-sm font-medium tabular-nums text-gray-800">{e.entrada.slice(0, 5)}–{e.saida.slice(0, 5)}</p>
                {e.pausa_inicio && e.pausa_fim && <p className="text-[11px] text-gray-400">almoço {e.pausa_inicio.slice(0, 5)}–{e.pausa_fim.slice(0, 5)}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Banco de horas (só leitura — o RH lança) */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">⏱️ Meu banco de horas</h3>
          <span className={`text-lg font-bold tabular-nums ${banco.saldo < 0 ? 'text-rose-600' : banco.saldo >= 8 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {fmtSaldo(Math.round(banco.saldo * 60))}
          </span>
        </div>
        {banco.itens.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">Nenhum lançamento ainda. As horas extras aparecem aqui.</p>
        ) : (
          <div className="mt-3 divide-y divide-gray-50">
            {banco.itens.slice(0, 10).map((b) => {
              const rot: Record<string, string> = { solicitacao_loja: 'Solicitação da loja', cobrir_colega: 'Cobrir colega', atraso: 'Atraso', pagamento: 'Pagamento', folga: 'Folga', hora_extra: 'Hora extra', falta: 'Falta', dobra: 'Dobra (folga/feriado)', abono: 'Abonada (justificada)', outro: 'Outro' }
              return (
                <div key={b.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="min-w-0">
                    <span className="text-gray-700">{rot[b.motivo ?? ''] ?? b.motivo ?? '—'}</span>
                    <span className="text-xs text-gray-400"> · {new Date(b.data + 'T12:00:00').toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>
                  </div>
                  <span className={`shrink-0 font-bold tabular-nums ${Number(b.horas) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {fmtSaldo(Math.round(Number(b.horas) * 60))}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Nome */}
      <form onSubmit={salvarNome} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Dados</h3>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} className="field" required />
        </div>
        {msgNome && <div className={`rounded-lg border px-3 py-2 text-sm ${msgCls(msgNome)}`}>{msgNome.message}</div>}
        <button type="submit" disabled={salvandoNome}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
          {salvandoNome ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Salvando...</span> : 'Salvar'}
        </button>
      </form>

      {/* Senha */}
      <form onSubmit={salvarSenha} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Trocar senha</h3>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Senha atual</label>
          <input type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} className="field" required autoComplete="current-password" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nova senha</label>
            <input type="password" value={senhaNova} onChange={(e) => setSenhaNova(e.target.value)} className="field" required autoComplete="new-password" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Repetir nova senha</label>
            <input type="password" value={senhaNova2} onChange={(e) => setSenhaNova2(e.target.value)} className="field" required autoComplete="new-password" />
          </div>
        </div>
        {msgSenha && <div className={`rounded-lg border px-3 py-2 text-sm ${msgCls(msgSenha)}`}>{msgSenha.message}</div>}
        <button type="submit" disabled={salvandoSenha}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
          {salvandoSenha ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Alterando...</span> : 'Alterar senha'}
        </button>
      </form>

      {/* PIN do ponto */}
      <form onSubmit={salvarPin} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">PIN do ponto</h3>
        <p className="text-xs text-gray-400">4 dígitos pra bater o ponto (evita bater na conta errada). Padrão: 1234.</p>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Novo PIN</label>
          <input type="password" inputMode="numeric" maxLength={4} value={pinNovo} onChange={(e) => setPinNovo(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} className="field" placeholder="••••" />
        </div>
        {msgPin && <div className={`rounded-lg border px-3 py-2 text-sm ${msgCls(msgPin)}`}>{msgPin.message}</div>}
        <button type="submit" disabled={salvandoPin}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
          {salvandoPin ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Salvando...</span> : 'Salvar PIN'}
        </button>
      </form>
    </div>
  )
}
