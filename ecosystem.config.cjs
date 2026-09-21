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
    // Watch: reinicia sozinho quando o CÓDIGO do bot muda (pra não rodar versão
    // velha depois de corrigir). NUNCA vigia data/ — auth/QR/mapas mudam o tempo
    // todo em runtime; vigiar isso causaria loop de restart + sessão corrompida.
    watch: ['bot-whatsapp', 'bot'],
    ignore_watch: ['bot-whatsapp/data'],
  }],
}
