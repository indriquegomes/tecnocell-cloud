// Gera a chave de ingestão de uma loja pra sincronização sombra (Fase 1).
//
// A chave fica na máquina do captor (extensão/agente), NUNCA no repo. Aqui só
// entra o HASH (SHA-256), que é o que o ingestor compara. O dono roda isto
// uma vez por loja e cola o SQL no SQL Editor do Supabase.
//
// Uso:   node scripts-sinc/gerar-credencial.mjs "LOJA_ID"
// Depois: 1) colar o SQL gerado no Supabase; 2) guardar a CHAVE no captor;
//         3) testar com o curl impresso.
import { createHash, randomBytes } from 'node:crypto'

const loja = process.argv[2]?.trim()
if (!loja) {
  console.error('Uso: node scripts-sinc/gerar-credencial.mjs "LOJA_ID"')
  process.exit(1)
}

const chave = randomBytes(32).toString('base64url') // 256 bits
const hash = createHash('sha256').update(chave).digest('hex')

console.log('LOJA :', loja)
console.log('CHAVE (guardar em lugar seguro — NÃO vai no repo):', chave)
console.log()
console.log('-- 1) SQL pra aplicar no Supabase (SQL Editor):')
console.log(`insert into sinc_credencial_loja (loja_id, chave_hash)
values ('${loja}', '${hash}')
on conflict (loja_id) do update
  set chave_hash = excluded.chave_hash, revogado_em = null, expira_em = null, criado_em = now();`)
console.log()
console.log('-- 2) Teste de ingestão (substitua <URL> pela URL real, ex.: https://tecnocell-cloud.vercel.app):')
console.log(`curl -X POST <URL>/api/sinc/eventos \\
  -H "x-sinc-loja: ${loja}" \\
  -H "authorization: Bearer ${chave}" \\
  -H "content-type: application/json" \\
  -d '{"idempotency_key":"${loja}:venda:1:create:1","entidade":"venda","acao":"create","sige_id":"1","sequencia":1,"payload":{"teste":true}}'`)
