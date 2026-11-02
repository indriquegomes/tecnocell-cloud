// Avisos de regra do caixa.
//
// A loja troca de funcionário no meio do dia, então o caixa fecha mais de uma vez
// por dia — e é aí que dinheiro se perde: sessão fechada com Pix de fornecedor
// ainda não baixado, contagem com falta, caixa que ficou aberto de um dia pro outro.
// Nada aqui BLOQUEIA o fechamento sozinho: 'conferir' pede ciência explícita de
// quem fecha, 'info' só informa. Funções puras — dá pra testar sem banco.

export type AvisoCaixa = {
  /** conferir = pede confirmação explícita · info = só informa */
  nivel: 'conferir' | 'info'
  titulo: string
  detalhe?: string
}

const brl = (v: number) =>
  (Math.round(v * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export type EntradaAvisos = {
  /** ISO de quando a sessão abriu */
  abertoEm: string
  /** ISO do "agora" — comparado em data de São Paulo (AAAA-MM-DD) */
  agora: string
  /** quanto foi contado menos o esperado (0 = confere) */
  divergencia?: number
  /** Pix do dia que foram para fornecedor e ainda não tiveram baixa */
  pixFornecedorSemBaixa?: { total: number; comprovantes: number }
  /** PIX da sessão sem comprovante no grupo */
  pixSemComprovante?: number
  /** reforços/retiradas sem motivo escrito */
  movimentosSemMotivo?: number
  valorAbertura?: number
  /** troco fixo da loja (saldo inicial da conta Caixa) — 0 = não cadastrado */
  trocoPadrao?: number
  /** dinheiro que o sistema espera na gaveta agora (abertura + entradas − saídas) */
  saldoGaveta?: number
  /**
   * Mostrar o valor da diferença na tela? Use false enquanto o operador ainda
   * pode mexer na contagem: ver "falta 37,50" antes de confirmar convida a
   * ajustar o número ao esperado e esconder uma falta de verdade.
   */
  divergenciaComValor?: boolean
}

const diaSP = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })   // AAAA-MM-DD
}

export function avisosDeFechamento(e: EntradaAvisos): AvisoCaixa[] {
  const avisos: AvisoCaixa[] = []

  // 1. O MAIS CARO: Pix que o cliente pagou ao fornecedor e ninguém deu baixa.
  // Depois que a sessão fecha, esses comprovantes não voltam na próxima — a
  // dívida fica em aberto e é baixada de novo (ou nunca).
  const sem = e.pixFornecedorSemBaixa
  if (sem && sem.total > 0.005) {
    avisos.push({
      nivel: 'conferir',
      titulo: `${sem.comprovantes} comprovante${sem.comprovantes === 1 ? '' : 's'} de PIX a fornecedor somando ${brl(sem.total)} ainda sem baixa`,
      detalhe: 'Dê a baixa na dívida aqui em cima antes de fechar. Depois de fechar esta sessão, esses comprovantes não aparecem mais.',
    })
  }

  // 2. Contagem diferente do esperado.
  if (typeof e.divergencia === 'number' && Math.abs(e.divergencia) > 0.005) {
    const falta = e.divergencia < 0
    const comValor = e.divergenciaComValor !== false
    avisos.push({
      nivel: 'conferir',
      titulo: comValor
        ? `${falta ? 'Falta' : 'Sobra'} de ${brl(Math.abs(e.divergencia))} na contagem da gaveta`
        : 'A contagem não confere com o esperado',
      detalhe: falta
        ? 'Confira a gaveta e o envelope do cofre antes de fechar. Fechando assim, a falta fica registrada no seu nome.'
        : 'Confira se sobrou dinheiro de outra sessão ou se o envelope do cofre saiu com valor menor.',
    })
  }

  // 3. Caixa que atravessou a noite: as vendas de dois dias na mesma sessão.
  const diaAbertura = diaSP(e.abertoEm)
  const diaAgora = diaSP(e.agora)
  if (diaAbertura && diaAgora && diaAbertura !== diaAgora) {
    avisos.push({
      nivel: 'info',
      titulo: `Este caixa foi aberto em ${diaAbertura.split('-').reverse().join('/')}, não hoje`,
      detalhe: 'A venda dos dois dias está nesta mesma sessão. Confira se é isso mesmo antes de fechar.',
    })
  }

  // 4. PIX do sistema sem comprovante no grupo da loja.
  if ((e.pixSemComprovante ?? 0) > 0) {
    avisos.push({
      nivel: 'conferir',
      titulo: `${e.pixSemComprovante} PIX lançado${(e.pixSemComprovante ?? 0) === 1 ? '' : 's'} no caixa sem comprovante no grupo`,
      detalhe: 'Cobre o comprovante antes de fechar: sem ele, ninguém consegue provar que o dinheiro entrou.',
    })
  }

  // 5. Reforço/retirada sem motivo — quem conferir depois não vai saber o que foi.
  if ((e.movimentosSemMotivo ?? 0) > 0) {
    avisos.push({
      nivel: 'info',
      titulo: `${e.movimentosSemMotivo} reforço${(e.movimentosSemMotivo ?? 0) === 1 ? '' : 's'}/retirada${(e.movimentosSemMotivo ?? 0) === 1 ? '' : 's'} sem motivo escrito`,
      detalhe: 'O motivo ajuda a conferir depois. Ainda dá tempo de explicar nas observações do fechamento.',
    })
  }

  // 6. Sessão aberta com valor diferente do troco fixo: o excedente deveria ter
  // ido para o cofre no fechamento anterior (ou a troca de turno não separou).
  if (
    typeof e.valorAbertura === 'number' && typeof e.trocoPadrao === 'number' &&
    e.trocoPadrao > 0 && Math.abs(e.valorAbertura - e.trocoPadrao) > 0.005
  ) {
    avisos.push({
      nivel: 'info',
      titulo: `A sessão abriu com ${brl(e.valorAbertura)} e o troco fixo é ${brl(e.trocoPadrao)}`,
      detalhe: 'O dinheiro a mais deveria ter ido para o cofre na troca de turno — confira se ele está no envelope.',
    })
  }

  // 7. Gaveta com menos dinheiro do que a sessão abriu: saiu cédula sem registro
  // (ou alguém guardou o envelope antes da hora).
  if (
    typeof e.saldoGaveta === 'number' && typeof e.valorAbertura === 'number' &&
    e.saldoGaveta < e.valorAbertura - 0.005
  ) {
    avisos.push({
      nivel: 'conferir',
      titulo: `A gaveta está com ${brl(e.valorAbertura - e.saldoGaveta)} a menos do que a abertura da sessão`,
      detalhe: 'Se foi devolução em dinheiro ou retirada, confira se está lançada. Se não foi, o dinheiro saiu sem registro.',
    })
  }

  return avisos
}

/** Precisa de ciência explícita de quem fecha? */
export function precisaCiencia(avisos: AvisoCaixa[]): boolean {
  return avisos.some((a) => a.nivel === 'conferir')
}
