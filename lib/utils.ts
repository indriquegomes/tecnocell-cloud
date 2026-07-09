import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatDate(iso: string): string {
  if (!iso) return ''
  // date-only "YYYY-MM-DD" → fixa meio-dia pra timezone não pular o dia (-1)
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T12:00:00') : new Date(iso)
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(d)
}

// "hoje" em YYYY-MM-DD no fuso America/Sao_Paulo (NÃO usar toISOString, que é UTC
// e vira o dia seguinte depois das 21h). Aceita offset em dias (ex: -30).
export function hojeSP(offsetDias = 0): string {
  const d = new Date(Date.now() + offsetDias * 86400000)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
