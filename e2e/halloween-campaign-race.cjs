// Real parent component callbacks with a deferred RPC; no browser/Cloud access.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), ts = require('typescript')
const compiled = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../app/painel/promocao-halloween/HalloweenClient.tsx'), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText
const hooks = []; let cursor = 0; let resolveRpc
const supabase = { rpc: () => new Promise(resolve => { resolveRpc = resolve }) }
const PaymentReview = function PaymentReview() {}; const out = {}
const real = { campaign: { id: 'halloween-2026', test_mode: false, active: false }, products: [], clients: [], clients_total: 0, stores: [], metrics: { tickets: 0, spins: 0, redeemed: 0 }, pending: [] }
const test = { ...real, campaign: { ...real.campaign, id: 'halloween-2026-test', test_mode: true } }
vm.runInNewContext(compiled, { exports: out, Error, Date, Number, navigator: {}, require: name => {
 if (name === 'react/jsx-runtime') return require('react/jsx-runtime')
 if (name === '@/lib/supabase/client') return { createClient: () => supabase }
 if (name === '@/lib/utils') return { formatBRL: String }
 if (name === './PaymentReview') return { default: PaymentReview }
 if (name === 'react') return {
  useState: initial => { const i = cursor++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial; return [hooks[i], v => { hooks[i] = typeof v === 'function' ? v(hooks[i]) : v }] },
  useRef: initial => { const i = cursor++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i] }, useEffect: () => {}
 }
 throw Error(name)
} })
function nodes(n) { if (Array.isArray(n)) return n.flatMap(nodes); if (!n || typeof n !== 'object') return []; return [n, ...nodes(n.props?.children)] }
function render() { cursor = 0; return nodes(out.default()) }
;(async () => {
 render(); hooks[2] = real
 const child = render().find(n => n.type === PaymentReview)
 child.props.onBusyChange?.(true)
 assert.equal(render().find(n => n.type === 'select').props.disabled, true, 'manual operation must disable campaign switching')
 child.props.onBusyChange(false)
 const pending = child.props.onIssued()
 render().find(n => n.type === 'select').props.onChange({ target: { value: 'halloween-2026-test' } })
 hooks[2] = test; render()
 resolveRpc({ data: real, error: null }); await pending
 assert.equal(hooks[2].campaign.id, 'halloween-2026-test', 'old campaign response must not replace current campaign state')
 console.log('PASS parent campaign race: manual busy disables switch; deferred previous-campaign response discarded')
})().catch(e => { console.error(e.message); process.exitCode = 1 })
