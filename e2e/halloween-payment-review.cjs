// Component behavior only; visual acceptance still requires the real browser.
const fs = require('node:fs')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const ts = require('typescript')
const jsx = require('react/jsx-runtime')
const source = fs.readFileSync(require('node:path').join(__dirname, '../app/painel/promocao-halloween/PaymentReview.tsx'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText
const states = []; let cursor = 0; let tree; const calls = []
const review = { source: { id: 'os-id', customer: 'Cliente QA', amount: 250, created_at: '2026-10-26T12:00:00Z', loja: 'Loja QA' }, payment: null, existing_ticket: null,
  receipts: [{ id: 'available', valor: 250, descricao: 'OS QA', payment_day: '2026-10-27', claimed: false }, { id: 'claimed', valor: 250, descricao: 'Já utilizado', payment_day: '2026-10-27', claimed: true }] }
const exportsObject = {}
vm.runInNewContext(compiled, { exports: exportsObject, Date, Number, Error, navigator: { clipboard: { writeText: async () => {} } }, require: name => {
  if (name === 'react') return { useRef: initial => { const i = cursor++; if (!(i in states)) states[i] = { current: initial }; return states[i] }, useState: initial => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }] } }
  if (name === 'react/jsx-runtime') return jsx
  if (name === '@/lib/utils') return { formatBRL: value => String(value) }
  throw new Error(name)
} })
const props = { campaign: 'qa', disabled: false, onBusyChange: () => {}, onIssued: async () => {}, rpc: async (name, args) => {
  calls.push({ name, args })
  if (name === 'payment_review') return calls.some(c => c.name === 'issue_os_manual') ? { ...review, existing_ticket: 'ticket' } : review
  if (name === 'issue_os_manual') return { id: 'ticket', token: 'qa-token', expires_at: '2026-10-29T18:30:00Z' }
  throw new Error(name)
} }
function render() { cursor = 0; tree = exportsObject.default(props); return nodes(tree) }
function nodes(node) { if (Array.isArray(node)) return node.flatMap(nodes); if (!node || typeof node !== 'object') return []; return [node, ...nodes(node.props?.children)] }
function text(node) { if (Array.isArray(node)) return node.map(text).join(''); if (!node || typeof node !== 'object') return String(node ?? ''); return text(node.props?.children) }
const find = (type, label) => render().find(n => n.type === type && (!label || text(n).includes(label)))
const change = (node, value) => node.props.onChange({ target: { value, checked: value } })
async function submit(form) { form.props.onSubmit({ preventDefault() {} }); for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); render() }
;(async () => {
  change(find('input'), '9002'); await submit(find('form'))
  assert.equal(calls[0].name, 'payment_review'); assert.equal(calls[0].args.p_number, 9002)
  let checkboxes = render().filter(n => n.type === 'input' && n.props.type === 'checkbox')
  assert.equal(checkboxes[1].props.disabled, true, 'claimed receipts must be disabled')
  change(checkboxes[0], true)
  change(render().find(n => n.type === 'input' && n.props.type === 'datetime-local'), '2026-10-27T15:30')
  change(render().find(n => n.type === 'input' && n.props.minLength === 5), 'Conferido no balcão')
  checkboxes = render().filter(n => n.type === 'input' && n.props.type === 'checkbox'); change(checkboxes.at(-1), true)
  await submit(render().filter(n => n.type === 'form')[1])
  const issued = calls.find(c => c.name === 'issue_os_manual')
  assert.deepEqual(Array.from(issued.args.p_receipts), ['available'])
  assert.equal(issued.args.p_paid_at, '2026-10-27T18:30:00.000Z', 'use explicit Brasília offset')
  assert.equal(issued.args.p_confirm, true)
  assert.equal(render().filter(n => n.type === 'form').length, 1, 'existing origin must hide issuance form')
  assert.ok(render().some(n => n.type === 'input' && n.props.readOnly && n.props.value.includes('qa-token')), 'returned bearer link is available for the staff')
  props.disabled = true
  assert.ok(render().filter(n => n.type === 'button').every(n => n.props.disabled), 'parent busy/dirty disables actions')
  console.log('PASS manual OS component: lookup, claimed receipts, explicit selection, Brasília time, confirmation, idempotent result and disabled actions')
})().catch(e => { console.error(e); process.exitCode = 1 })
