import test from 'node:test'
import assert from 'node:assert/strict'
import { semanaSegSab, calcMotoboy } from '@/lib/motoboy'

// semana seg-sáb
test('sábado 17/10/2026 → seg 12, sáb 17', () => {
  assert.deepEqual(semanaSegSab('2026-10-17'), { seg: '2026-10-12', sab: '2026-10-17' })
})
test('segunda 12/10/2026 → seg 12, sáb 17', () => {
  assert.deepEqual(semanaSegSab('2026-10-12'), { seg: '2026-10-12', sab: '2026-10-17' })
})
test('domingo 18/10/2026 → semana ANTERIOR seg 12, sáb 17 (a que acabou)', () => {
  assert.deepEqual(semanaSegSab('2026-10-18'), { seg: '2026-10-12', sab: '2026-10-17' })
})
test('virada de mês: 01/11/2026 (dom) → seg 26/10, sáb 31/10', () => {
  assert.deepEqual(semanaSegSab('2026-11-01'), { seg: '2026-10-26', sab: '2026-10-31' })
})
test('virada de ano: 03/01/2027 (dom) → seg 28/12/26, sáb 02/01/27', () => {
  assert.deepEqual(semanaSegSab('2027-01-03'), { seg: '2026-12-28', sab: '2027-01-02' })
})
test('sábado 31/10/2026 → seg 26, sáb 31', () => {
  assert.deepEqual(semanaSegSab('2026-10-31'), { seg: '2026-10-26', sab: '2026-10-31' })
})

// calcMotoboy
test('fixo 950 sem entregas → total 950, ehFixo true', () => {
  assert.deepEqual(calcMotoboy('fixo', 950, 0, 0, 5, 2), { total: 950, ehFixo: true })
})
test('fixo IGNORA entregas/extras mesmo se tiver', () => {
  assert.deepEqual(calcMotoboy('fixo', 950, 5, 5, 10, 10), { total: 950, ehFixo: true })
})
test('variavel 0 fixo, 5/ent, 5/extra, 10 ent, 2 extra → 60', () => {
  assert.deepEqual(calcMotoboy('variavel', 0, 5, 5, 10, 2), { total: 60, ehFixo: false })
})
test('variavel IGNORA fixo (mesmo se cadastro errado tiver fixo)', () => {
  assert.deepEqual(calcMotoboy('variavel', 110, 5, 5, 10, 2), { total: 60, ehFixo: false })
})
test('variavel só extra', () => {
  assert.deepEqual(calcMotoboy('variavel', 0, 0, 5, 0, 4), { total: 20, ehFixo: false })
})
test('variavel zero entregas zero extra → 0', () => {
  assert.deepEqual(calcMotoboy('variavel', 0, 5, 5, 0, 0), { total: 0, ehFixo: false })
})
test('arredonda centavos: 7.5 ent × 3.33 = 24.975 → 24.98', () => {
  assert.deepEqual(calcMotoboy('variavel', 0, 3.33, 0, 7.5, 0), { total: 24.98, ehFixo: false })
})
