const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

function load(file, imports = require) {
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(compiled, { module, exports: module.exports, require: imports })
  return module.exports
}
const permissions = load('lib/permissoes.ts')
const icons = load('components/icons.tsx')
function render(permissoes, isMaster = false, pathname = '/painel/clientes-app') {
  const { Sidebar } = load('components/Sidebar.tsx', name => {
    if (name === 'next/link') return { default: ({ children, ...props }) => React.createElement('a', props, children) }
    if (name === 'next/navigation') return { usePathname: () => pathname }
    if (name === '@/lib/utils') return { cn: (...values) => values.flat(Infinity).filter(Boolean).join(' ') }
    if (name === '@/lib/permissoes') return permissions
    if (name === '@/components/icons') return icons
    return require(name)
  })
  return renderToStaticMarkup(React.createElement(Sidebar, { permissoes, isMaster, badges: { '/painel/pedidos-app': 3 } }))
}
const appSection = html => (html.match(/<details\b[\s\S]*?<\/details>/g) || []).find(section => section.includes('>Aplicativo<'))
test('Aplicativo é seção própria com os dois acessos e badge', () => {
  const section = appSection(render(['clientes', 'pdv']))
  assert.ok(section)
  assert.match(section, /Autorizar clientes/)
  assert.match(section, /Pedidos do App/)
  assert.match(section, /href="\/painel\/clientes-app"/)
  assert.match(section, /href="\/painel\/pedidos-app"/)
  assert.match(section, />3<\/span>/)
  assert.equal((render(['clientes', 'pdv']).match(/href="\/painel\/pedidos-app"/g) || []).length, 1)
})
test('clientes não concede acesso a pedidos', () => {
  const section = appSection(render(['clientes']))
  assert.match(section, /Autorizar clientes/)
  assert.doesNotMatch(section, /Pedidos do App/)
})
test('pdv não concede acesso a aprovações', () => {
  const section = appSection(render(['pdv'], false, '/painel/pedidos-app'))
  assert.match(section, /Pedidos do App/)
  assert.doesNotMatch(section, /Autorizar clientes/)
  assert.match(section, /open=""/)
})
test('sem permissões a seção não aparece; master vê os dois acessos', () => {
  assert.equal(appSection(render([])), undefined)
  assert.match(appSection(render([], true)), /Autorizar clientes/)
  assert.match(appSection(render([], true)), /Pedidos do App/)
})
test('pessoas não fica selecionado ao acessar aprovação do aplicativo', () => {
  const html = render(['clientes'])
  const pessoas = html.match(/<a href="\/painel\/clientes"[^>]*>/)?.[0]
  assert.ok(pessoas)
  assert.doesNotMatch(pessoas, /tc-ativo/)
})
