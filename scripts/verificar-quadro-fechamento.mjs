import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim().replace(/^["']|["']$/g,'')]))
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} })
const brl=(n)=>(Number(n)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})
const P=1000
async function tudo(q){const o=[];for(let i=0;i<400000;i+=P){const {data,error}=await q(i,i+P-1);if(error)throw new Error(error.message);if(!data?.length)break;o.push(...data);if(data.length<P)break}return o}
async function tudoIn(ids,q){const o=[];for(let i=0;i<ids.length;i+=200){const chunk=ids.slice(i,i+200);for(let j=0;j<400000;j+=P){const {data,error}=await q(chunk,j,j+P-1);if(error)throw new Error(error.message);if(!data?.length)break;o.push(...data);if(data.length<P)break}}return o}
const MERC=/mercadoria|fornecedor|fonecedor/i
const inicio='2026-11-01', proxMes='2026-12-01'
const inicioTs=inicio+'T00:00:00-03:00', proxMesTs=proxMes+'T00:00:00-03:00'
const hoje='2026-11-24'
const { data: lojas } = await s.from('lojas').select('id, nome').order('nome')
const deps = await tudo((f,t)=>s.from('depositos').select('id, loja_id').order('id').range(f,t))
const cxs = await tudo((f,t)=>s.from('caixas').select('id, loja_id').order('id').range(f,t))
function dreDoMes(vendas,itens,devs,devItens,custoTravado,precoCustoProduto,despesas){
  const custo=(cu,pc)=>Number(cu??pc??0)||0
  const receitaBruta=vendas.reduce((t,v)=>t+(Number(v)||0),0)
  const cmvBruto=itens.reduce((t,i)=>t+custo(i.custo_unitario, i.pc)*(Number(i.quantidade)||0),0)
  const info=new Map(devs.map(d=>[d.id,d]))
  let receitaDev=0, custoDev=0
  for(const it of devItens){
    const inf=info.get(it.devolucao_id)
    const ct=custoTravado.get(`${inf?.venda_id}|${it.produto_id}`)
    const pc=precoCustoProduto.get(it.produto_id)
    if(((inf?.tipo_credito??'')!=='sem_reembolso')) receitaDev+=Number(it.total_item)||0
    if((it.status_produto??'ok')==='ok') custoDev+=custo(ct,pc)*(Number(it.quantidade)||0)
  }
  const desp=despesas.filter(d=>!MERC.test(d.categoria??'')).reduce((t,d)=>t+(Number(d.valor)||0),0)
  const despPago=despesas.filter(d=>!MERC.test(d.categoria??'')&&d.status==='pago').reduce((t,d)=>t+(Number(d.valor)||0),0)
  const rl=receitaBruta-receitaDev, cmv=cmvBruto-custoDev, lb=rl-cmv
  return { receitaBruta, receitaDev, rl, cmvBruto, custoDev, cmv, lb, desp, despPago, resultado: lb-desp }
}
let totalBR=0, totalRL=0, totalCMV=0, totalLB=0, totalD=0, totalRes=0
for(const loja of (lojas??[])){
  const fC=(()=>{const ids=cxs.filter(c=>c.loja_id===loja.id).map(c=>c.id);return ids.length?ids:['00000000-0000-0000-0000-000000000000']})()
  const fD=(()=>{const ids=deps.filter(d=>d.loja_id===loja.id).map(d=>d.id);return ids.length?ids:['00000000-0000-0000-0000-000000000000']})()
  const vendas = await tudo((f,t)=>s.from('vendas').select('total').eq('status','concluida').eq('uso_interno',false).gte('created_at',inicioTs).lt('created_at',proxMesTs).in('caixa_id',fC).order('id').range(f,t))
  const itensRaw = await tudo((f,t)=>s.from('itens_venda').select('quantidade, custo_unitario, produtos(preco_custo), vendas!inner(created_at,status,uso_interno,caixa_id)').eq('vendas.status','concluida').eq('vendas.uso_interno',false).gte('vendas.created_at',inicioTs).lt('vendas.created_at',proxMesTs).in('vendas.caixa_id',fC).order('id').range(f,t))
  const devs = await tudo((f,t)=>s.from('devolucoes').select('id, venda_id, tipo_credito').gte('created_at',inicioTs).lt('created_at',proxMesTs).in('deposito_id',fD).order('id').range(f,t))
  const devIds=devs.map(d=>d.id)
  const devItens = devIds.length?await tudoIn(devIds,(ch,f,t)=>s.from('itens_devolucao').select('devolucao_id, produto_id, quantidade, total_item, status_produto').in('devolucao_id',ch).order('id').range(f,t)):[]
  const vendaIdsDev=[...new Set(devs.map(d=>d.venda_id).filter(Boolean))]
  const prodIds=[...new Set(devItens.map(i=>i.produto_id).filter(Boolean))]
  const iv= vendaIdsDev.length?await tudoIn(vendaIdsDev,(ch,f,t)=>s.from('itens_venda').select('venda_id, produto_id, custo_unitario').in('venda_id',ch).order('id').range(f,t)):[]
  const pd= prodIds.length?await tudoIn(prodIds,(ch,f,t)=>s.from('produtos').select('id, preco_custo').in('id',ch).order('id').range(f,t)):[]
  const custoTravado=new Map(); for(const x of iv) if(x.custo_unitario!=null) custoTravado.set(`${x.venda_id}|${x.produto_id}`,Number(x.custo_unitario))
  const precoCustoProduto=new Map(pd.map(p=>[p.id,p.preco_custo]))
  const itens = itensRaw.map(i=>{ const prod=Array.isArray(i.produtos)?i.produtos[0]:i.produtos; return {quantidade:Number(i.quantidade)||0, custo_unitario:i.custo_unitario==null?null:Number(i.custo_unitario), pc:prod?.preco_custo==null?null:Number(prod.preco_custo)} })
  const desp = await tudo((f,t)=>s.from('lancamentos').select('valor, categoria, status').eq('tipo','pagar').neq('status','cancelado').gte('data_vencimento',inicio).lt('data_vencimento',proxMes).eq('loja_id',loja.id).order('id').range(f,t))
  const r = dreDoMes(vendas.map(v=>v.total), itens, devs, devItens, custoTravado, precoCustoProduto, desp)
  totalBR+=r.receitaBruta; totalRL+=r.rl; totalCMV+=r.cmv; totalLB+=r.lb; totalD+=r.desp; totalRes+=r.resultado
  console.log(`${loja.nome}: bruta ${brl(r.receitaBruta)} · dev ${brl(r.receitaDev)} · líq ${brl(r.rl)} · CMV ${brl(r.cmv)} · lucro bruto ${brl(r.lb)} · desp ${brl(r.desp)} (pago ${brl(r.despPago)}) · RESULTADO ${brl(r.resultado)}`)
}
console.log(`\nTOTAL: bruta ${brl(totalBR)} · receita líquida ${brl(totalRL)} · CMV ${brl(totalCMV)} · lucro bruto ${brl(totalLB)} · despesas ${brl(totalD)} · RESULTADO ${brl(totalRes)}`)
const fiado = await tudo((f,t)=>s.from('lancamentos').select('loja_id, valor, valor_pago, data_vencimento').eq('tipo','receber').eq('status','pendente').order('id').range(f,t))
const pagar = await tudo((f,t)=>s.from('lancamentos').select('loja_id, categoria, valor, valor_pago, data_vencimento').eq('tipo','pagar').eq('status','pendente').order('id').range(f,t))
const saldo=r=>Math.max(0,Number(r.valor??0)-Number(r.valor_pago??0))
for(const loja of (lojas??[])){
  const fs=fiado.filter(r=>r.loja_id===loja.id), ps=pagar.filter(r=>r.loja_id===loja.id)
  const fiadoS=fs.reduce((t,r)=>t+saldo(r),0), fiadoV=fs.filter(r=>(r.data_vencimento??'').slice(0,10)&&(r.data_vencimento??'').slice(0,10)<hoje).reduce((t,r)=>t+saldo(r),0)
  const fornS=ps.filter(r=>MERC.test(r.categoria??'')).reduce((t,r)=>t+saldo(r),0)
  const fornV=ps.filter(r=>MERC.test(r.categoria??'')&&(r.data_vencimento??'').slice(0,10)&&(r.data_vencimento??'').slice(0,10)<hoje).reduce((t,r)=>t+saldo(r),0)
  const outS=ps.filter(r=>!MERC.test(r.categoria??'')).reduce((t,r)=>t+saldo(r),0)
  console.log(`\n${loja.nome}: TENHO fiado ${brl(fiadoS)} (vencido ${brl(fiadoV)}) · DEVO fornecedor ${brl(fornS)} (vencido ${brl(fornV)}) + outras ${brl(outS)}`)
}