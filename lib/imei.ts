// IMEI / NÚMERO DE SÉRIE — DESLIGADO NO APP INTEIRO (decisão do dono, 04/11/2026).
//
// O dono pediu para retirar o controle por IMEI do app. Em vez de apagar cada
// tela (Compras, Movimentar, Histórico, Transferência, Conferência, Pedidos,
// PDV), o interruptor fica num lugar só: aqui.
//
// - `IMEI_ATIVO = false` faz `controlaSerie()` responder sempre false, então
//   nenhuma tela pede série.
// - Os dados antigos de `numeros_serie` ficam intactos (nada apagado).
// - Ligar de volta = trocar para true. Nada mais precisa ser mexido.
export const IMEI_ATIVO = false

/** O produto controla número de série? (sempre false enquanto IMEI_ATIVO = false) */
export const controlaSerie = (_flag: boolean | null | undefined): boolean => IMEI_ATIVO && !!_flag
