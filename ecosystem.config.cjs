// Config do PM2 pro bot de WhatsApp.
//
// Hoje roda o bot MÍNIMO (bot-whatsapp/pix.mjs): responde só "qual é o PIX".
// O bot antigo (run.mjs, preço/estoque com IA) está no repositório, desligado —
// para voltar, troque o `script` de volta.
//
// SEM restart automático e SEM vigia (decisão do dono, 30/09): reinício em série
// corrompia a sessão do WhatsApp (Bad MAC) e derrubava o bot. Se cair, religa na
// mão e escaneia o QR uma vez.
// Para outra loja, mude BOT_WHATSAPP_LOJA (petropolis | teresopolis).
module.exports = {
  apps: [{
    name: 'tecnocell-bot',
    script: 'bot-whatsapp/pix.mjs',
    env: {
      BOT_WHATSAPP_LOJA: 'petropolis',
    },
    autorestart: false,
  }],
}
