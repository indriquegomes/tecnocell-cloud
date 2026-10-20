// Actions reais em fixture isolada; nenhum acesso ao Supabase ou a vendas reais.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const operador = '00000000-0000-4000-8000-000000000001';
const pedidoId = '00000000-0000-4000-8000-000000000002';
const lojaA = '00000000-0000-4000-8000-000000000003';
const lojaB = '00000000-0000-4000-8000-000000000004';
const item = { id: 'peca-1', nome: 'Peça de teste', loja: 'Unidade A', quantidade: 2, preco: 12.5 };
function carregar(relativo, imports = {}, env = {}) {
  const source = fs.readFileSync(path.join(root, relativo), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, URLSearchParams, process: { env }, require(name) {
    if (!(name in imports)) throw Error('Dependência não autorizada: ' + name);
    return imports[name];
  }});
  return module.exports;
}
function fixture(options = {}) {
  const cfg = { permission: true, enabled: true, allowed: null, ...options };
  const reads = [], rpc = [], permissions = [], refreshed = [];
  const rows = {
    perfis: [{ lojas_permitidas: cfg.allowed, ativo: true }],
    pedidos_app_unidades: [{ unidade: 'Unidade A', loja_id: lojaA }, { unidade: 'Unidade B', loja_id: lojaB }],
    lojas: [{ id: lojaA, nome: 'Loja A', ativa: true }, { id: lojaB, nome: 'Loja B', ativa: true }],
    pedidos_app: [{ id: pedidoId, user_id: 'cliente-a', pessoa_id: 'p1', status: 'pendente', status_pagamento: 'pendente', itens: [item], created_at: '2026-10-17' }],
    pedidos_app_atendimentos: [], pessoas: [{ id: 'p1', nome: 'Cliente de teste' }],
    ...(cfg.rows ?? {}),
  };
  const service = { from(table) {
    const filters = []; let limit = Infinity;
    const query = {};
    query.select = () => query;
    query.eq = (key, value) => { filters.push(['eq', key, value]); return query; };
    query.in = (key, values) => { filters.push(['in', key, values]); return query; };
    query.contains = (key, values) => { filters.push(['contains', key, values]); return query; };
    query.or = value => { filters.push(['or', 'cursor', value]); return query; };
    query.order = () => query;
    query.limit = n => { limit = n; return query; };
    const result = single => {
      reads.push({ table, filters });
      if (cfg.errors?.[table]) return { data: null, error: { message: 'segredo-interno' } };
      let data = (rows[table] ?? []).filter(row => filters.every(([op, key, value]) => {
        // A fixture de perfil representa somente o operador autenticado.
        if (table === 'perfis' && key === 'id') return true;
        if (op === 'eq') return row[key] === value;
        if (op === 'in') return value.includes(row[key]);
        if (op === 'or') {
          const parts = value.match(/^created_at.lt.([^,]+),and\(created_at.eq.([^,]+),id.lt.([^)]+)\)$/);
          assert.ok(parts, 'cursor usa somente timestamp validado e UUID');
          return Date.parse(row.created_at) < Date.parse(parts[1]) || (Date.parse(row.created_at) === Date.parse(parts[2]) && row.id < parts[3]);
        }
        const partes = typeof value === 'string' ? JSON.parse(value) : value;
        return partes.every(part => row[key]?.some(candidate => Object.entries(part).every(([k, v]) => candidate[k] === v)));
      })).slice(0, limit);
      return { data: single ? data[0] ?? null : data, error: null };
    };
    query.maybeSingle = async () => result(true);
    query.then = (yes, no) => Promise.resolve(result(false)).then(yes, no);
    return query;
  }, async rpc(name, args) { rpc.push({ name, args }); return { data: cfg.rpcData ?? null, error: cfg.rpcError ?? null }; } };
  const model = carregar('lib/pedidos-app.ts');
  const actions = carregar('app/painel/pedidos-app/actions.ts', {
    'next/cache': { revalidatePath: p => refreshed.push(p) },
    '@/lib/supabase/server': {
      requirePermissao: async p => { permissions.push(p); if (!cfg.permission) throw Error('segredo-auth'); return { id: operador }; },
      createServiceClient: async () => service,
    },
    '@/lib/pedidos-app': model,
  }, { PEDIDOS_APP_GERENCIAMENTO_ENABLED: cfg.enabled ? 'true' : 'false', PEDIDOS_APP_PDV_ENABLED: cfg.pdv ? 'true' : 'false', PEDIDOS_APP_OPERACAO_ENABLED: cfg.operacao ? 'true' : 'false' });
  return { actions, model, reads, rpc, permissions, refreshed };
}

test('operação privada exige flag, permissão, unidade e envia somente operador autenticado', async () => {
  for (const cfg of [{}, {operacao:true,permission:false}, {operacao:true,allowed:[lojaB]}]) {
    const f=fixture(cfg);
    assert.ok((await f.actions.registrarOperacaoPedidoApp(pedidoId,'Unidade A',0,'assumir','token')).erro);
    assert.equal(f.rpc.length,0);
  }
  const f=fixture({operacao:true});
  for (const [versao,tipo] of [[-1,'assumir'],[0,'pagar'],[1.5,'separado']]) {
    assert.ok((await f.actions.registrarOperacaoPedidoApp(pedidoId,'Unidade A',versao,tipo,'token')).erro);
  }
  assert.equal(f.rpc.length,0);
  assert.equal((await f.actions.registrarOperacaoPedidoApp(pedidoId,'Unidade A',0,'assumir','token')).ok,true);
  assert.equal(f.rpc[0].name,'registrar_operacao_pedido_app');
  assert.equal(f.rpc[0].args.p_operador,operador);
  assert.equal(f.rpc[0].args.p_versao,0);
});

test('SDK real envia filtro de unidade como array JSON em leitura, paginação e ações', async () => {
  const { createClient } = require('@supabase/supabase-js');
  const filtros = [];
  const rows = {
    perfis: [{ ativo: true, lojas_permitidas: [lojaA] }],
    lojas: [{ id: lojaA, nome: 'Loja A' }],
    pedidos_app_unidades: [{ unidade: 'Unidade A', loja_id: lojaA }],
    pedidos_app: [{ id: pedidoId, pessoa_id: 'p1', status: 'pendente', status_pagamento: 'pendente', itens: [item], created_at: '2026-10-17T12:00:00.123456+00:00' }],
    pedidos_app_atendimentos: [], pessoas: [{ id: 'p1', nome: 'Cliente fictício' }],
  };
  const service = createClient('https://example.invalid', 'chave-ficticia', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async input => {
      const url = new URL(String(input));
      const tabela = url.pathname.split('/').pop();
      const filtro = url.searchParams.get('itens');
      if (filtro) {
        filtros.push(filtro);
        if (filtro !== 'cs.' + JSON.stringify([{ loja: 'Unidade A' }])) {
          return new Response(JSON.stringify({ code: '22P02', message: 'invalid input syntax for type json' }), { status: 400 });
        }
      }
      return new Response(JSON.stringify(rows[tabela] ?? null), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const actions = carregar('app/painel/pedidos-app/actions.ts', {
    'next/cache': { revalidatePath() {} },
    '@/lib/supabase/server': { requirePermissao: async () => ({ id: operador }), createServiceClient: async () => service },
    '@/lib/pedidos-app': carregar('lib/pedidos-app.ts'),
  }, { PEDIDOS_APP_GERENCIAMENTO_ENABLED: 'true' });
  assert.equal((await actions.carregarPedidosApp('Unidade A', 'token')).pedidos.length, 1);
  assert.equal((await actions.carregarPedidosApp('Unidade A', 'token', pedidoId)).pedidos.length, 1);
  assert.ok((await actions.confirmarPedidoApp(pedidoId, 'Unidade A', 'token')).ok);
  assert.ok((await actions.cancelarPedidoApp(pedidoId, 'Unidade A', 'token')).ok);
  assert.equal(filtros.length, 5);
});

test('sem permissão não lê pedidos, não confirma e não cancela', async () => {
  const f = fixture({ permission: false });
  await assert.rejects(f.actions.carregarPedidosApp('Unidade A', 'token'));
  assert.ok((await f.actions.confirmarPedidoApp(pedidoId, 'Unidade A', 'token')).erro);
  assert.ok((await f.actions.cancelarPedidoApp(pedidoId, 'Unidade A', 'token')).erro);
  assert.equal(f.reads.length, 0); assert.equal(f.rpc.length, 0);
  assert.ok(f.permissions.every(p => p === 'pdv'));
});
test('gerenciamento desligado bloqueia ambas as gravações antes de consultar', async () => {
  const f = fixture({ enabled: false });
  for (const action of ['confirmarPedidoApp', 'cancelarPedidoApp']) {
    assert.match((await f.actions[action](pedidoId, 'Unidade A', 'token')).erro, /liberad/i);
  }
  assert.equal(f.rpc.length, 0); assert.equal(f.reads.length, 0);
});
test('unidade fora do acesso é recusada sem leitura de pedidos', async () => {
  const f = fixture({ allowed: [lojaA] });
  await assert.rejects(f.actions.carregarPedidosApp('Unidade B', 'token'));
  assert.equal(f.reads.filter(r => r.table === 'pedidos_app').length, 0);
});
test('perfil ausente, permissão de loja malformada e falha de configuração fecham acesso', async () => {
  for (const option of [{ rows: { perfis: [] } }, ...[null,false].map(ativo => ({ rows: { perfis: [{ ativo, lojas_permitidas: null }] } })), { allowed: 'todas' }, { allowed: ['invalido'] }, { errors: { pedidos_app_unidades: true } }]) {
    const f = fixture(option);
    await assert.rejects(f.actions.carregarPedidosApp('Unidade A', 'token'));
    assert.equal(f.reads.filter(r => r.table === 'pedidos_app').length, 0);
  }
});
test('pedido aberto antigo continua acessível depois dos primeiros cem', async () => {
  const rows = Array.from({length:101}, (_,n) => ({id:`00000000-0000-4000-8000-${String(101-n).padStart(12,'0')}`,pessoa_id:'p1',status:n===100?'pendente':'confirmado',status_pagamento:'pendente',itens:[item],created_at:'2026-10-17T12:00:00.123456+00:00'}));
  const f=fixture({rows:{pedidos_app:rows}});
  const first=await f.actions.carregarPedidosApp('Unidade A','token');
  assert.equal(first.pedidos.length,100);
  assert.equal(first.proximoCursor,rows[99].id);
  const next=await f.actions.carregarPedidosApp('Unidade A','token',first.proximoCursor);
  assert.equal(next.pedidos.length,1); assert.equal(next.pedidos[0].id,rows[100].id);
  assert.equal(next.proximoCursor,null);
  assert.ok(f.reads.some(r=>r.filters.some(([op,,value])=>op==='or'&&value.includes(rows[99].created_at))), 'mantém microssegundos do PostgreSQL no cursor');
  await assert.rejects(f.actions.carregarPedidosApp('Unidade A','token','invalido'));
});
test('listagem filtra loja e calcula somente as peças da unidade autorizada', async () => {
  const f = fixture({ allowed: [lojaA], rows: { pedidos_app: [{ id: pedidoId, pessoa_id: 'p1', status: 'pendente', status_pagamento: 'pendente', itens: [item, { ...item, loja: 'Unidade B', preco: 999 }], created_at: '2026-10-17' }] } });
  const data = await f.actions.carregarPedidosApp('Unidade A', 'token');
  assert.equal(data.unidades.length, 1); assert.equal(data.pedidos.length, 1);
  assert.equal(data.pedidos[0].total, 25); assert.equal(data.pedidos[0].itens.length, 1);
  assert.ok(f.reads.find(r => r.table === 'pedidos_app').filters.some(([op]) => op === 'contains'));
  assert.ok(!f.reads.some(r => ['vendas', 'depositos', 'formas_pagamento', 'lancamentos', 'caixas'].includes(r.table)));
});
test('falhas nas consultas secundárias não viram lista vazia ou sucesso', async () => {
  for (const table of ['pedidos_app', 'pedidos_app_atendimentos', 'pessoas']) {
    const f = fixture({ errors: { [table]: true } });
    await assert.rejects(f.actions.carregarPedidosApp('Unidade A', 'token'));
  }
});
test('sem unidades configuradas retorna estado vazio explícito', async () => {
  const f = fixture({ rows: { pedidos_app_unidades: [] } });
  const data = await f.actions.carregarPedidosApp(undefined, 'token');
  assert.equal(data.unidade, null); assert.equal(data.pedidos.length, 0);
});

test('link direto encontra pedido antigo e não retorna outros pedidos', async () => {
  const antigos = Array.from({ length: 110 }, (_, n) => ({ id: `00000000-0000-4000-8000-${String(n + 100).padStart(12, '0')}`, pessoa_id: 'p1', status: 'confirmado', status_pagamento: 'pendente', itens: [item], created_at: '2026-10-17' }));
  const f = fixture({ rows: { pedidos_app: [...antigos, { ...antigos[0], id: pedidoId }] } });
  const data = await f.actions.carregarPedidosApp('Unidade A', 'token', undefined, pedidoId);
  assert.equal(data.pedidos.length, 1);
  assert.equal(data.pedidos[0].id, pedidoId);
  assert.equal(data.proximoCursor, null);
});

test('link direto inválido, ausente ou fora da unidade falha sem ampliar a consulta', async () => {
  for (const id of ['invalido', '00000000-0000-4000-8000-000000000099']) {
    await assert.rejects(fixture().actions.carregarPedidosApp('Unidade A', 'token', undefined, id));
  }
  await assert.rejects(fixture().actions.carregarPedidosApp('Unidade B', 'token', undefined, pedidoId));
  const f = fixture({ permission: false });
  await assert.rejects(f.actions.carregarPedidosApp('Unidade A', 'token', undefined, pedidoId));
  assert.equal(f.reads.length, 0);
});
test('ID inválido e pedido de outra unidade não chamam RPC', async () => {
  const f = fixture();
  for (const action of ['confirmarPedidoApp', 'cancelarPedidoApp']) {
    assert.ok((await f.actions[action]('invalido', 'Unidade A', 'token')).erro);
    assert.ok((await f.actions[action](pedidoId, 'Unidade B', 'token')).erro);
  }
  assert.equal(f.rpc.length, 0);
});
test('confirmação usa operador autenticado e RPC da unidade, sem pagamento', async () => {
  const f = fixture(); const result = await f.actions.confirmarPedidoApp(pedidoId, 'Unidade A', 'token');
  assert.equal(result.ok, true); assert.equal(f.rpc.length, 1);
  assert.equal(f.rpc[0].name, 'confirmar_pedido_app_unidade');
  assert.equal(f.rpc[0].args.p_operador, operador); assert.equal(f.rpc[0].args.p_unidade, 'Unidade A');
  assert.ok(f.refreshed.includes('/painel/pedidos-app'));
});
test('cancelamento chama somente o RPC de cancelamento, sem venda ou estorno', async () => {
  const f = fixture(); assert.equal((await f.actions.cancelarPedidoApp(pedidoId, 'Unidade A', 'token')).ok, true);
  assert.equal(f.rpc.length, 1); assert.equal(f.rpc[0].name, 'cancelar_pedido_app');
  assert.equal(f.rpc[0].args.p_operador, operador);
  assert.equal(f.actions.faturarPedidoApp, undefined);
});
test('RPC ausente ou com erro não retorna sucesso nem expõe mensagem interna', async () => {
  for (const error of [{ code: 'PGRST202', message: 'segredo-interno' }, { code: 'XX000', message: 'segredo-interno' }]) {
    const f = fixture({ rpcError: error });
    for (const action of ['confirmarPedidoApp', 'cancelarPedidoApp']) {
      const result = await f.actions[action](pedidoId, 'Unidade A', 'token');
      assert.ok(result.erro); assert.ok(!result.erro.includes('segredo-interno'));
    }
    assert.equal(f.refreshed.length, 0);
  }
});
test('peças inválidas, preços e quantidades adulterados são recusados', () => {
  const { model } = fixture();
  for (const value of [null, [], [{ ...item, quantidade: 0 }], [{ ...item, quantidade: 1.5 }], [{ ...item, quantidade: 101 }], [{ ...item, preco: NaN }], [{ ...item, preco: 0 }], [item, item]]) {
    assert.throws(() => model.itensDaUnidade(value, 'Unidade A'));
  }
});

function fixturePDV(options = {}, config = {}) {
  return fixture({ pdv: true, ...config, rows: {
    cadastros_clientes: [{ user_id: 'cliente-a', pessoa_id: 'p1', status: 'aprovado' }],
    pessoas: [{ id: 'p1', nome: 'Cliente de teste', ativo: true, nao_vender: false }],
    produtos: [{ id: item.id, ativo: true, codigo: '123', controla_serie: false }],
    ...options,
  } });
}
test('preparação para PDV relê vínculo e itens sem aceitar, vender ou movimentar', async () => {
  const f = fixturePDV();
  const result = await f.actions.carregarPedidoAppPDV(pedidoId, 'Unidade A', 'token');
  assert.equal(result.pessoaId, 'p1'); assert.equal(result.lojaId, lojaA);
  assert.equal(result.total, 25); assert.equal(result.itens[0].preco, 12.5);
  assert.equal(result.itens[0].quantidade, 2);
  assert.equal(f.rpc.length, 0); assert.equal(f.refreshed.length, 0);
});
test('preparação para PDV recusa vínculo conflitante, bloqueio, pessoa e produto inativos', async () => {
  for (const rows of [
    { cadastros_clientes: [{ user_id: 'cliente-a', pessoa_id: 'outra', status: 'aprovado' }] },
    { cadastros_clientes: [{ user_id: 'cliente-a', pessoa_id: 'p1', status: 'bloqueado' }] },
    { pessoas: [{ id: 'p1', nome: 'Cliente', ativo: false }] },
    { pessoas: [{ id: 'p1', nome: 'Cliente', ativo: true, nao_vender: true }] },
    { produtos: [{ id: item.id, ativo: false }] },
    { produtos: [] },
  ]) {
    const f = fixturePDV(rows);
    await assert.rejects(f.actions.carregarPedidoAppPDV(pedidoId, 'Unidade A', 'token'));
    assert.equal(f.rpc.length, 0);
  }
});
test('preparação para PDV recusa unidade alheia, link inválido e cancelamento', async () => {
  const f = fixturePDV({ pedidos_app: [{ id: pedidoId, user_id: 'cliente-a', pessoa_id: 'p1', status: 'cancelado', itens: [item] }] });
  for (const [id, unit] of [[pedidoId, 'Unidade A'], [pedidoId, 'Unidade B'], ['inválido', 'Unidade A']]) {
    await assert.rejects(f.actions.carregarPedidoAppPDV(id, unit, 'token'));
  }
  assert.equal(f.rpc.length, 0);
});
test('venda já cancelada continua visível para histórico, sem novo lançamento', async () => {
  const f = fixturePDV({
    pedidos_app: [{ id: pedidoId, user_id: 'cliente-a', pessoa_id: 'p1', status: 'cancelado', itens: [item] }],
    pedidos_app_atendimentos: [{ pedido_id: pedidoId, unidade: 'Unidade A', venda_id: 'venda-1' }],
    vendas: [{ id: 'venda-1', status: 'cancelada' }],
    pessoas: [{ id: 'p1', nome: 'Cliente de teste', ativo: false }],
    produtos: [{ id: item.id, ativo: false, codigo: '123' }],
  });
  const result = await f.actions.carregarPedidoAppPDV(pedidoId, 'Unidade A', 'token');
  assert.equal(result.vendaId, 'venda-1'); assert.equal(result.vendaCancelada, true);
  assert.equal(f.rpc.length, 0);
});

test('preparação para PDV mantém preço contratado e exclui peças de outra unidade', async () => {
  const f = fixturePDV({
    pedidos_app: [{ id: pedidoId, user_id: 'cliente-a', pessoa_id: 'p1', status: 'confirmado',
      itens: [item, { ...item, id: 'outra-peca', loja: 'Unidade B', preco: 999 }] }],
    produtos: [{ id: item.id, ativo: true, preco: 500, codigo: '123' }],
  });
  const result = await f.actions.carregarPedidoAppPDV(pedidoId, 'Unidade A', 'token');
  assert.equal(result.itens.length, 1); assert.equal(result.itens[0].preco, 12.5);
  assert.equal(result.total, 25); assert.equal(f.rpc.length, 0);
});

test('carregamento devolve cliente nativo, estoque e séries somente dos depósitos autorizados', async () => {
  const f = fixturePDV({
    pessoas: [{ id: 'p1', nome: 'Cliente', ativo: true, telefone: '123', permite_fiado: true }],
    depositos: [{ id: 'd1', loja_id: lojaA, ativo: true }],
    estoque: [{ produto_id: item.id, deposito_id: 'd1', quantidade: 4 }],
    numeros_serie: [{ produto_id: item.id, deposito_id: 'd1', serie: 'IMEI-TESTE', status: 'em_estoque' }],
  });
  const r = await f.actions.carregarPedidoAppPDV(pedidoId, 'Unidade A', 'token');
  assert.equal(r.pessoa.telefone, '123');
  assert.equal(r.depositos[0].id, 'd1');
  assert.equal(r.itens[0].estoquePorDeposito.d1, 4);
  assert.deepEqual(Array.from(r.seriesPorProduto[item.id].d1), ['IMEI-TESTE']);
});
test('preparação para PDV falha fechada quando a consulta de vínculo ou produto falha', async () => {
  for (const table of ['cadastros_clientes', 'pessoas', 'produtos']) {
    const f = fixturePDV({}, { errors: { [table]: true } });
    await assert.rejects(f.actions.carregarPedidoAppPDV(pedidoId, 'Unidade A', 'token'), e => !e.message.includes('segredo'));
    assert.equal(f.rpc.length, 0);
  }
  for (const cfg of [{ permission: false }, { enabled: false }, { allowed: [lojaB] }]) {
    const f = fixture(cfg);
    await assert.rejects(f.actions.carregarPedidoAppPDV(pedidoId, 'Unidade A', 'token'));
    assert.ok(!f.reads.some(r => r.table === 'pedidos_app')); assert.equal(f.rpc.length, 0);
  }
});

test('encaminhamento ao PDV exige liberação própria e nunca confirma disponibilidade como alternativa', async () => {
  const f = fixture();
  const result = await f.actions.encaminharPedidoAppPDV(pedidoId, 'Unidade A', 'token');
  assert.ok(result.erro); assert.equal(f.rpc.length, 0);
  const enabled = fixture({ pdv: true, rpcError: { code: 'PGRST202' } });
  assert.ok((await enabled.actions.encaminharPedidoAppPDV(pedidoId, 'Unidade A', 'token')).erro);
  assert.deepEqual(enabled.rpc.map(r => r.name), ['encaminhar_pedido_app_pdv']);
});
test('encaminhamento usa operador autenticado e devolve link ao PDV sem pagamento', async () => {
  const f = fixture({ pdv: true });
  const result = await f.actions.encaminharPedidoAppPDV(pedidoId, 'Unidade A', 'token');
  assert.match(result.url, /pedidoApp=/); assert.match(result.url, /unidade=Unidade\+A/);
  assert.equal(f.rpc[0].args.p_operador, operador);
  assert.equal(f.rpc[0].name, 'encaminhar_pedido_app_pdv');
});
test('conclusão do App chama somente transação atômica, sem PDV genérico', async () => {
  const pagamento = [{ forma_pagamento_id: 'pix', valor: 25, taxa: 0, maquina: '', parcelas: 1, status: 'pago' }];
  const disabled = fixture();
  assert.ok((await disabled.actions.finalizarPedidoAppPDV(pedidoId,'Unidade A','d1',pagamento,[],'token')).erro);
  assert.equal(disabled.rpc.length,0);
  const f = fixture({ pdv: true, rpcData: { venda_id: 'venda-1', venda_numero: 101, ja_existia: false } });
  const result = await f.actions.finalizarPedidoAppPDV(pedidoId,'Unidade A','d1',pagamento,[],'token');
  assert.equal(result.vendaId,'venda-1'); assert.equal(result.jaExistia,false);
  assert.deepEqual(f.rpc.map(r => r.name),['finalizar_pedido_app_pdv']);
  assert.equal(f.rpc[0].args.p_operador,operador);
  assert.equal(f.rpc[0].args.p_pedido,pedidoId);
  const failed = fixture({ pdv: true, rpcError: { code: 'PGRST202' } });
  assert.ok((await failed.actions.finalizarPedidoAppPDV(pedidoId,'Unidade A','d1',pagamento,[],'token')).erro);
  assert.deepEqual(failed.rpc.map(r => r.name),['finalizar_pedido_app_pdv']);
  const invalid = fixture({ pdv: true });
  assert.ok((await invalid.actions.finalizarPedidoAppPDV(pedidoId,'Unidade A','d1',[{ ...pagamento[0], valor: -1 }],[],'token')).erro);
  assert.equal(invalid.rpc.length,0);
});
