import { test, expect } from '@playwright/test'
import { login } from './helpers'

// IMEI desligado: as telas que exigiam série não podem mais bloquear.
const telas = [
  ['/painel/estoque/movimentar', 'Movimentar'],
  ['/painel/estoque/historico', 'Movimentações'],
  ['/painel/estoque/transferencias', 'Transferências'],
  ['/painel/compras', 'Notas'],
]

for (const [rota, nome] of telas) {
  test(`abre e não pede IMEI: ${nome}`, async ({ page }) => {
    await login(page)
    const r = await page.goto(rota)
    expect(r?.status()).toBeLessThan(400)
    await page.waitForTimeout(1200)
    const texto = (await page.locator('body').innerText()).toLowerCase()
    // nenhum campo pedindo IMEI de forma obrigatória na carga inicial
    const pedeImei = texto.includes('bipe o imei') || texto.includes('controla imei')
    expect(pedeImei).toBe(false)
  })
}
