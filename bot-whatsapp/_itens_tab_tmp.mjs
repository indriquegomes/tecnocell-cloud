import { env } from '../bot/lib/env.mjs'
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))

// estrutura do itens_tabela_preco
const p = await supabase.from('itens_tabela_preco').select('*').limit(1)
console.log('colunas:', p.data?.[0] ? Object.keys(p.data[0]).join(', ') : 'vazio/erro', p.error ? p.error.message : '')
console.log('amostra:', JSON.stringify(p.data?.[0]))
