// Config do PM2 pro bot de WhatsApp (preço/estoque).
// Roda sempre: reinicia sozinho se cair e sobe junto com o Windows (pm2 startup + save).
// Pra ligar as DUAS lojas depois, tire o BOT_WHATSAPP_LOJA (ou mude pra vazio).
module.exports = {
  apps: [{
    name: 'tecnocell-bot',
    script: 'bot-whatsapp/run.mjs',
    env: {
      BOT_WHATSAPP_LOJA: 'petropolis',
    },
    max_memory_restart: '512M',
    autorestart: true,
    // SEM watch mode de propósito: reiniciar a cada mudança de arquivo CORROMPIA a
    // sessão do WhatsApp (MessageCounterError / Bad MAC) e derrubava o bot o tempo
    // todo. Código novo entra com restart manual controlado (pm2 restart), nunca sozinho.
  }, {
    name: 'tecnocell-bot-monitor',
    script: 'bot-whatsapp/monitor.mjs',
    autorestart: true,
  }],
}
