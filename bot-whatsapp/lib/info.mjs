// Manual da loja — respostas fixas do bot (endereço, horário, cadastro, política).
// Alimentado com o que a própria loja já manda no WhatsApp. Só texto, sem segredo.

export const ENDERECO = `📍 Endereço: R. Dezesseis de Março, Galeria 336 - Lj 23 - Centro, Petrópolis - RJ, 25620-040`

export const HORARIO = `⏰ Horário de funcionamento:
• Segunda a Sexta: 08h às 19h
• Sábado: 08h às 17h
• Domingo: fechado`

// Resposta quando chega mensagem fora do expediente (o robô fica 24h, mas avisa o horário)
export const FORA_HORARIO = `Oi! No momento estamos fora do horário de atendimento — nosso horário:
• Segunda a Sexta: 08h às 19h
• Sábado: 08h às 17h
• Domingo: fechado

Mas eu sigo por aqui 24h! Me manda o modelo da peça que te digo o preço e se temos em estoque. 😊`

export const CADASTRO = `📋 Para fazer seu cadastro, é bem simples!

Me informe os seguintes dados:
👉 Nome completo;
👉 RG;
👉 CPF;
👉 Endereço e CEP;
👉 E-mail;
👉 Data de nascimento;

E a etapa mais importante — provar que você é técnico e/ou lojista:
📸 Tire uma foto sua, em frente à sua loja ou à sua bancada de técnico.

Trabalha como técnico autônomo e caseiro? Não se preocupe, você também é bem-vindo! Só precisa provar que trabalha com isso.`

// Entregas por zona — a fonte de verdade fica no PAINEL (configuracoes.chave='entregas').
// O bot lê de lá e formata; isto aqui é só o fallback se o painel nunca gravou.
const ZONAS_ENTREGA = [
  ['itaipava', 'ITAIPAVA'],
  ['bairro', 'BAIRRO'],
  ['centro', 'CENTRO'],
]

function formataHorarios(txt) {
  return (txt || '').split(',').map((s) => s.trim()).filter(Boolean).join(', ')
}

export function montaEntregas(obj) {
  const o = obj || {}
  const linhas = ['🚚 LOGÍSTICA DE ENTREGAS (GRATUITAS)']
  for (const [key, label] of ZONAS_ENTREGA) {
    const z = o[key] || {}
    const semana = formataHorarios(z.semana)
    const sabado = formataHorarios(z.sabado)
    if (!semana && !sabado) continue
    linhas.push(`📍 ${label}`)
    if (semana) linhas.push(`• Seg a Sex: ${semana}`)
    if (sabado) linhas.push(`• Sábado: ${sabado}`)
    linhas.push('')
  }
  return linhas.join('\n').trimEnd()
}

export const ENTREGAS_PADRAO = montaEntregas({
  itaipava: { semana: '11h30, 16h30', sabado: '11h30, 15h30' },
  bairro: { semana: '10h00, 14h30', sabado: '13h30' },
  centro: { semana: '10h00, 10h40, 11h20, 12h00, 12h40, 13h20, 14h00, 15h20, 16h00, 16h40, 17h20, 18h00', sabado: '10h00, 10h40, 11h20, 12h00, 12h40, 13h20, 14h00, 14h40, 16h00, 16h40' },
})

const POLITICA_TOPO = `📢 POLÍTICA DE ATENDIMENTO – TECNOCELL

⏰ HORÁRIO DE FUNCIONAMENTO
• Segunda a Sexta: 08h às 19h
• Sábado: 08h às 17h
• Domingo: fechado`

const POLITICA_RODAPE = `⚠️ Regras de Ouro:
• Pedido mínimo: R$ 20,00.`

export function montaPolitica(entregasTexto) {
  return `${POLITICA_TOPO}\n\n${entregasTexto || ENTREGAS_PADRAO}\n\n${POLITICA_RODAPE}`
}

export const POLITICA = montaPolitica(ENTREGAS_PADRAO)

export const ENCOMENDA = `📦 REGRAS DE ENCOMENDA – TECNOCELL

1️⃣ Não aceitamos devoluções de itens encomendados (são itens específicos).

2️⃣ Reposição de encomendas a cada 10 dias. Se sua peça encomendada precisar de troca, será preciso esperar até a próxima data de encomenda.

3️⃣ É preciso um sinal de 50% do item, em cima da média base.

4️⃣ Envie todas as informações necessárias da sua encomenda — assim a chance de vir item errado é mínima.`

export const VENDEDORA = `Perfeito! 😊 Vou te mandar pra vendedora, ela finaliza seu pedido. Chama ela aqui 👉 https://wa.me/5524998266051`

export const PERGUNTA_APARELHO = `Temos várias opções! 😊 Pra qual aparelho você precisa? Me diz o modelo (ex: iPhone 13, Moto G54).`
