/** Türkçe tutar biçimlendirme ve ayrıştırma. */
import type { Currency } from './types';

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
};

/** 1500 → "1.500,00 ₺" */
export function formatMoney(amount: number, currency: Currency = 'TRY'): string {
  const n = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${n} ${CURRENCY_SYMBOLS[currency]}`;
}

/** 1500 → "1.500 ₺" (kuruş sıfırsa gizler) */
export function formatMoneyShort(amount: number, currency: Currency = 'TRY'): string {
  const hasCents = Math.round(amount * 100) % 100 !== 0;
  const n = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${n} ${CURRENCY_SYMBOLS[currency]}`;
}

/**
 * "1.500,50" / "1500.50" / "1,500.50" → 1500.5
 * Belirsiz durumlarda son ayırıcıyı ondalık kabul eder.
 */
export function parseMoney(text: string): number | null {
  const cleaned = text.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;

  if (lastComma === -1 && lastDot === -1) {
    normalized = cleaned;
  } else if (lastComma > lastDot) {
    // Türkçe biçim: nokta binlik, virgül ondalık
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    const decimals = cleaned.length - lastDot - 1;
    // "1.500" gibi tam 3 haneli kuyruk binlik ayırıcıdır, ondalık değil
    normalized =
      decimals === 3 && !cleaned.includes(',')
        ? cleaned.replace(/\./g, '')
        : cleaned.replace(/,/g, '');
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
