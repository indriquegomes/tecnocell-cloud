// bot-whatsapp/testa-produtos.mjs
// Roda contra o Supabase de verdade. Uso: node bot-whatsapp/testa-produtos.mjs "termo de busca"
import { buscaProdutos, buscaEstoque } from './lib/produtos.mjs'

const DEPOSITO_PETROPOLIS_LOJA = '63d9054d59a9c829747233d4'

const termo = process.argv.slice(2).join(' ') || 'tela'
const produtos = await buscaProdutos(termo)
console.log(`Busca "${termo}": ${produtos.length} resultado(s)`)
for (const p of produtos) {
  const qtd = await buscaEstoque(p.id, DEPOSITO_PETROPOLIS_LOJA)
  console.log(`- ${p.nome} — R$ ${p.preco.toFixed(2)} — estoque Petrópolis: ${qtd}`)
}
