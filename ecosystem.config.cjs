// Config do PM2 pro bot de WhatsApp (preço/estoque).
// A pedido do dono (30/09): SEM restart automático e SEM vigia. Reiniciar o bot
// repetido corrompia a sessão do WhatsApp (Bad MAC) e derrubava o bot. Agora, se
// cair, é religado na mão + escanear o QR uma vez só.
// Pra ligar as DUAS lojas depois, tire o BOT_WHATSAPP_LOJA (ou mude pra vazio).
module.exports = {
  apps: [{
    name: 'tecnocell-bot',
    script: 'bot-whatsapp/run.mjs',
    env: {
      BOT_WHATSAPP_LOJA: 'petropolis',
    },
    autorestart: false,
  }],
}
