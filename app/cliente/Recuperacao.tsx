'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { criarRecuperacaoCliente, validarLinkRecuperacao, regrasSenhaCliente } from '@/lib/recuperacao-cliente'

export default function Recuperacao({ redefinir }: { redefinir: boolean }) {
  const client = useRef<ReturnType<typeof criarRecuperacaoCliente> | null>(null)
  const verification = useRef<Promise<void> | null>(null)
  const [stage, setStage] = useState(redefinir ? 'validando' : 'email')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState(''), [confirmacao, setConfirmacao] = useState('')
  const [visible, setVisible] = useState([false, false])
  const [busy, setBusy] = useState(false), [erro, setErro] = useState('')
  const regras = regrasSenhaCliente(senha)

  useEffect(() => {
    let active = true
    try {
      client.current ??= criarRecuperacaoCliente()
      if (redefinir) {
        if (!verification.current) {
          const href = window.location.href
          window.history.replaceState(null, '', window.location.pathname)
          verification.current = validarLinkRecuperacao(client.current, href)
        }
        verification.current.then(() => { if (active) setStage('senha') }).catch(() => { if (active) setStage('invalido') })
      }
    } catch { setErro('A recuperação está indisponível. Tente novamente mais tarde.'); setStage('indisponivel') }
    return () => { active = false }
  }, [redefinir])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || !client.current) return
    setErro('')
    if (stage === 'senha' && (!regras.every(regra => regra.ok) || senha !== confirmacao)) {
      setErro(!regras.every(regra => regra.ok) ? 'Use 8 caracteres, com maiúscula, minúscula e número.' : 'As senhas precisam ser iguais.')
      return
    }
    setBusy(true)
    try {
      if (stage === 'email') {
        const { error } = await client.current.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/cliente/redefinir-senha`,
        })
        if (error) throw error
        setStage('enviado')
      } else if (stage === 'senha') {
        const { error } = await client.current.auth.updateUser({ password: senha })
        if (error) {
          if (['session_not_found', 'refresh_token_not_found', 'refresh_token_already_used'].includes(error.code ?? '')) setStage('invalido')
          throw error
        }
        setSenha(''); setConfirmacao(''); setStage('concluido')
        // Encerra apenas esta sessão temporária; não desloga o funcionário.
        void client.current.auth.signOut({ scope: 'local' }).catch(() => {})
      }
    } catch { setErro('Não foi possível concluir. Confira sua conexão e tente novamente. Se o link expirou, solicite outro.') }
    finally { setBusy(false) }
  }

  const input = 'min-h-[52px] w-full rounded-2xl border border-[#dce8ed] bg-[#f8fbfd] px-4 text-base text-slate-900 placeholder:text-slate-500 outline-none transition focus:border-[#005777] focus:bg-white focus:ring-2 focus:ring-blue-100'
  return <>
    <h1 className="text-2xl font-bold text-[#005777]">{redefinir ? 'Nova senha' : 'Recuperar senha'}</h1>
    <div aria-live="polite" className="mt-3 text-sm text-slate-600">
      {stage === 'validando' && 'Conferindo seu link…'}
      {stage === 'email' && 'Enviaremos um link para você criar outra senha.'}
      {stage === 'senha' && 'Crie uma senha para voltar ao app.'}
      {stage === 'enviado' && 'Se esse e-mail estiver cadastrado, você receberá um link. Confira também o spam.'}
      {stage === 'concluido' && 'Senha alterada. Volte ao aplicativo e entre com a nova senha.'}
      {stage === 'invalido' && 'Este link expirou ou não é válido. Peça um novo link abaixo.'}
    </div>
    {['email', 'senha'].includes(stage) && <form onSubmit={submit} className="mt-6 space-y-4">
      {stage === 'email' ? <div><label htmlFor="email" className="sr-only">Seu e-mail</label><input id="email" type="email" required autoComplete="email" placeholder="Seu e-mail" value={email} onChange={e => setEmail(e.target.value)} disabled={busy} className={input} /></div>
        : [senha, confirmacao].map((value, index) => <div key={index}>
          <div className="relative">
          <label htmlFor={`senha-${index}`} className="sr-only">{index ? 'Confirme sua senha' : 'Nova senha'}</label>
          <input id={`senha-${index}`} type={visible[index] ? 'text' : 'password'} required minLength={8} aria-describedby={index === 0 ? 'regras-senha' : undefined} autoComplete="new-password" placeholder={index ? 'Confirme sua senha' : 'Nova senha'} value={value} onChange={e => index ? setConfirmacao(e.target.value) : setSenha(e.target.value)} disabled={busy} className={`${input} pr-14`} />
          <button type="button" aria-label={`${visible[index] ? 'Ocultar' : 'Mostrar'} ${index ? 'confirmação de senha' : 'nova senha'}`} aria-pressed={visible[index]} onClick={() => setVisible(previous => previous.map((v, i) => i === index ? !v : v))} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-[#005777] focus-visible:outline-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{visible[index] && <path d="m3 3 18 18" />}</svg>
          </button>
          </div>
          {index === 0 && <ul id="regras-senha" aria-label="Sua senha precisa ter" className="mt-3 grid grid-cols-2 gap-x-2 gap-y-2 px-1 text-xs">
            {regras.map(regra => <li key={regra.texto} className={`flex items-center gap-1.5 ${regra.ok ? 'text-emerald-700' : 'text-slate-500'}`}>
              <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${regra.ok ? 'bg-emerald-100' : 'bg-[#fff0e5] text-[#ba560e]'}`}>
                {regra.ok ? <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m2 6 2.5 2.5L10 3" /></svg> : <span className="h-1 w-1 rounded-full bg-current" />}
              </span><span className="sr-only">{regra.ok ? 'Atendido: ' : 'Falta: '}</span>{regra.texto}
            </li>)}
          </ul>}
        </div>)}
      <button disabled={busy} className="min-h-[52px] w-full rounded-2xl bg-[#005777] px-4 font-semibold text-white transition hover:bg-[#004661] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#005777] disabled:opacity-60">{busy ? 'Aguarde…' : stage === 'email' ? 'Enviar link' : 'Salvar nova senha'}</button>
    </form>}
    {erro && <p role="alert" className="mt-4 text-sm text-red-700">{erro}</p>}
    {['invalido', 'enviado'].includes(stage) && <Link href="/cliente/recuperar-senha" onClick={() => { setStage('email'); setErro('') }} className="mt-5 inline-flex min-h-11 items-center font-semibold text-[#005777]">Pedir outro link</Link>}
    {stage === 'concluido' && <a href="tecnocellapp:///login" className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#005777] font-semibold text-white">Abrir aplicativo</a>}
  </>
}
