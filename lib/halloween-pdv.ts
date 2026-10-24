/** Halloween is explicit selection only; ordinary promotions keep their auto behavior. */
export function isAutomaticPromotion(promotion: { manual_only?: boolean }): boolean {
  return promotion.manual_only !== true
}
export function halloweenUnitDiscount(base: number, percent: number): number {
  if (!Number.isFinite(base) || base < 0 || !Number.isFinite(percent) || percent <= 0 || percent > 100) throw new Error('Preço ou percentual Halloween inválido.')
  return Math.round((base * percent / 100 + Number.EPSILON) * 100) / 100
}
