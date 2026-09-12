/**
 * "ziraat kartını ödedim" derken hangi kaydın kastedildiğini bulur.
 *
 * Ekleme dışındaki bütün komutlar önce bir kaydı işaret etmek zorunda;
 * eşleşme zayıfsa kullanıcıya liste gösterilir, tahminle iş yapılmaz.
 */
import type { Occurrence, Payment } from '../domain/types';
import { lower, stem, tokenize } from './normalize';

export interface Match<T> {
  item: T;
  score: number;
}

/** Bu eşiğin altındaki eşleşmeler kullanıcıya sorulur. */
export const MATCH_THRESHOLD = 0.45;

function keywords(text: string): string[] {
  return tokenize(lower(text))
    .map(stem)
    .filter((w) => w.length >= 3);
}

/** 0-1 arası benzerlik: sorgu kelimelerinin başlıkta bulunma oranı. */
export function similarity(query: string, title: string): number {
  const q = keywords(query);
  if (q.length === 0) return 0;
  const t = keywords(title);
  if (t.length === 0) return 0;

  let hits = 0;
  for (const word of q) {
    if (t.some((other) => other === word || other.startsWith(word) || word.startsWith(other))) {
      hits++;
    }
  }
  const coverage = hits / q.length;
  // Başlığın tamamı sorguyla örtüşüyorsa güveni artır
  const titleCoverage = hits / t.length;
  return Math.min(1, coverage * 0.75 + titleCoverage * 0.25);
}

/** Serileri sorguya göre sıralar (en iyi eşleşme başta). */
export function rankPayments(query: string, payments: Payment[]): Match<Payment>[] {
  return payments
    .map((item) => ({ item, score: similarity(query, item.title) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** Gün listesindeki kalemleri sorguya göre sıralar. */
export function rankOccurrences(query: string, list: Occurrence[]): Match<Occurrence>[] {
  return list
    .map((item) => ({ item, score: similarity(query, item.payment.title) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Tek bir kaydı kesin olarak seçebiliyor muyuz?
 * En iyi eşleşme eşiği geçmeli ve ikinciyle arasında belirgin fark olmalı.
 */
export function bestMatch<T>(matches: Match<T>[]): T | null {
  const [first, second] = matches;
  if (!first || first.score < MATCH_THRESHOLD) return null;
  if (second && first.score - second.score < 0.15) return null;
  return first.item;
}
