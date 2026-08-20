import path from 'node:path'
import { iniciaSessao } from './sessao.mjs'
import { RAIZ_REPO } from '../bot/lib/env.mjs'

const DIR_DATA = path.join(RAIZ_REPO, 'bot-whatsapp', 'data')

// BOT_WHATSAPP_TESTE=1 liga só UMA sessão, numa pasta de auth separada — pra
// testar com um celular que não é o número real da loja (ver spec, seção
// "Teste antes de valer pra cliente real") antes de conectar de verdade.
const MODO_TESTE = process.env.BOT_WHATSAPP_TESTE === '1'

const LOJAS = MODO_TESTE
  ? [{ slug: 'teste', depositoId: '63d9054d59a9c829747233d4', pastaAuth: path.join(DIR_DATA, 'auth_teste') }]
  : [
      { slug: 'petropolis', depositoId: '63d9054d59a9c829747233d4', pastaAuth: path.join(DIR_DATA, 'auth_petropolis') },
      { slug: 'teresopolis', depositoId: '63e4dc8ede713ef765366d69', pastaAuth: path.join(DIR_DATA, 'auth_teresopolis') },
    ]

console.log(MODO_TESTE ? '[bot-whatsapp] MODO TESTE — uma sessão só, pasta auth_teste' : '[bot-whatsapp] modo normal — Petrópolis + Teresópolis')

for (const loja of LOJAS) iniciaSessao(loja)
