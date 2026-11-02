const { readFileSync } = require('node:fs')
const path = require('node:path')
const ref = 'gzetgvbzsinulxgxtflg'
const fail = message => { console.error(`Ambiente de testes bloqueado: ${message}`); process.exit(1) }

if (process.env.NEXT_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co`) fail('banco não é o projeto de testes.')
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) fail('chave pública ausente.')
if (process.env.APP_BASE_URL !== 'https://tecnocell-cloud-testes.vercel.app') fail('endereço do Cloud não é o de testes.')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!key) fail('chave administrativa do projeto de testes ausente.')
if (!key.startsWith('sb_secret_')) {
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString())
    if (payload.ref !== ref || payload.role !== 'service_role') fail('chave administrativa de outro projeto ou função.')
  } catch { fail('formato de chave administrativa inválido.') }
}
if (process.env.PEDIDOS_APP_AUTO_CREDITO_ENABLED === 'true') fail('automação financeira ainda não foi homologada neste ambiente.')
for (const [name, value] of Object.entries(process.env)) {
  if (value && /^(TELEGRAM_|COMPROVANTES_SHEET_ID$|GOOGLE_SA_JSON$|DEEPSEEK_API_KEY$|GEMINI_API_KEY$|ANTHROPIC_API_KEY$|SIGE_)/.test(name)) fail(`integração externa configurada: ${name}.`)
}
const config = JSON.parse(readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'))
if (config.crons?.length) fail('agendamentos externos não são permitidos na configuração inicial.')
console.log('Configuração de testes validada; banco e domínio isolados, sem crons externos.')
