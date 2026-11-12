// Vínculo de trabalho: quando acaba e o que isso significa.
//
// Desligar NÃO é apagar. O perfil continua no banco porque vendas, batidas de
// ponto e salários pagos apontam para ele — apagar deixaria esse histórico sem
// dono. O que muda é que a pessoa sai de tudo que é de gente trabalhando:
// folha, escala, espelho de ponto e login.
//
// A data de demissão é o que manda. Data até hoje = vínculo encerrado, mesmo que
// o cadastro ainda esteja marcado ativo (demissão com data futura que venceu, ou
// alguém que reativou o perfil por engano).

// `data` chega como 'YYYY-MM-DD' (coluna date) ou como timestamptz do Postgres.
// Só os 10 primeiros caracteres interessam, e a comparação é de texto porque
// data ISO em texto já ordena certo — sem Date, sem fuso, sem risco de virar
// o dia anterior.
export function vinculoEncerrado(data: string | null | undefined, hoje: string): boolean {
  if (!data) return false
  return data.slice(0, 10) <= hoje
}
