// Catálogo de plataformas de e-commerce/marketplace que o SIGE já integra
// (mapeado ao vivo em ec.sigecloud.com.br, 18/08/2026). Nenhuma está
// conectada de verdade no TecnoCell ainda — cada conexão real vira um
// projeto próprio quando houver credencial da plataforma (ex: Mercado
// Livre precisa do TecnoCell virar app cadastrado no Mercado Livre
// Developers antes de qualquer código de OAuth).
export type Plataforma = { chave: string; nome: string }

export const PLATAFORMAS: Plataforma[] = [
  { chave: 'loja-integrada', nome: 'Loja Integrada' },
  { chave: 'magento',        nome: 'Magento' },
  { chave: 'magento2',       nome: 'Magento 2' },
  { chave: 'mercado-livre',  nome: 'Mercado Livre' },
  { chave: 'woocommerce',    nome: 'WooCommerce' },
  { chave: 'neo',            nome: 'NEO' },
  { chave: 'via-marketplace', nome: 'Via Marketplace' },
  { chave: 'moovin',         nome: 'Moovin' },
  { chave: 'magalu',         nome: 'Magazine Luiza Marketplace' },
  { chave: 'b2w',            nome: 'B2W' },
  { chave: 'nuvemshop',      nome: 'Nuvem Shop' },
  { chave: 'shopee',         nome: 'Shopee' },
  { chave: 'amazon',         nome: 'Amazon' },
  { chave: 'ecomece',        nome: 'Ecomece' },
]
