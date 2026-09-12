/**
 * Türkçe komut ayrıştırıcının giriş noktası.
 *
 * Sesli ya da yazılı bir cümleyi alır, ne yapılmak istendiğini ve gereken
 * alanları çıkarır. Hiçbir şeyi kendiliğinden kaydetmez — sonucu onay ekranı
 * gösterir, kullanıcı düzeltebilir.
 */
import * as D from '../domain/date';
import type { NewPaymentInput } from '../domain/payment';
import type { Currency, ISODate, Recurrence } from '../domain/types';
import { extractDate, isRecurringExpr, toRecurrence, toSingleDate, type DateExpr } from './dates';
import { B, E, re } from './boundary';
import { cleanTitle, extractAmount, guessCategory } from './extract';
import { detectIntent, type Intent } from './intent';
import { normalize } from './normalize';

export interface ParseBase {
  intent: Intent;
  raw: string;
  normalized: string;
  /** 0-1. 0.7 altındaki sonuçlar kullanıcıya daha belirgin şekilde sorulur. */
  confidence: number;
  /** Kullanıcıya gösterilecek eksik/şüpheli noktalar. */
  warnings: string[];
}

export interface AddResult extends ParseBase {
  intent: 'add';
  payment: NewPaymentInput;
  /** Tarih hiç anlaşılamadıysa true — kullanıcı seçmeli. */
  dateMissing: boolean;
}

export interface DeferResult extends ParseBase {
  intent: 'defer';
  /** Hangi kaydın ertelendiği — serbest metin, eşleştirme ayrı yapılır. */
  query: string;
  /** Taşınacağı gün; anlaşılamadıysa null. */
  date: ISODate | null;
}

export interface MarkPaidResult extends ParseBase {
  intent: 'markPaid';
  query: string;
  amount?: number;
  /** Hangi güne ait ödeme; söylenmemişse bugün. */
  date: ISODate;
}

export interface DeleteResult extends ParseBase {
  intent: 'delete';
  query: string;
}

export interface SendResult extends ParseBase {
  intent: 'send';
  /** Kime gönderileceği (kişi adı); boş olabilir. */
  recipient: string;
  /** Hangi günün planı. */
  date: ISODate;
}

export interface ListResult extends ParseBase {
  intent: 'list';
  date: ISODate;
}

export type ParseResult =
  | AddResult
  | DeferResult
  | MarkPaidResult
  | DeleteResult
  | SendResult
  | ListResult;

/** Gönderme/listeleme komutlarında başlık sayılmaması gereken kelimeler. */
const LIST_NOUNS = re(
  B +
    '(?:liste|listesi|listesini|listeyi|listemi|plan|planı|planını|program|programı|' +
    '[öo]deme|[öo]demesi|[öo]demeleri|[öo]demelerini|[öo]demeler|tablo|dosya|bunu|[şs]unu|onu)' +
    E,
  'g',
);

/** Kişi adının sonundaki yönelme ekini atar: "ahmet'e" / "ahmet e" → "ahmet". */
const RECIPIENT_TAIL = /['\s]+(?:ye|ya|ne|na|e|a)$/;

function removeFirst(text: string, part: string): string {
  if (!part) return text;
  const index = text.indexOf(part);
  if (index === -1) return text;
  return (text.slice(0, index) + ' ' + text.slice(index + part.length)).replace(/\s+/g, ' ').trim();
}

export function parseCommand(raw: string, today: ISODate = D.today()): ParseResult {
  const normalized = normalize(raw);
  const intentMatch = detectIntent(normalized);
  let rest = removeFirst(normalized, intentMatch.matched);

  /** Niyet silinmiş, tarih/tutar hâlâ duran metin — erteleme ayrı tarar. */
  const intentRest = rest;

  const dateMatch = extractDate(rest, today);
  if (dateMatch) rest = removeFirst(rest, dateMatch.matched);

  const amountMatch = extractAmount(rest);
  if (amountMatch) rest = removeFirst(rest, amountMatch.matched);

  const base = { raw, normalized, warnings: [] as string[] };

  switch (intentMatch.intent) {
    case 'add':
      return buildAdd(base, rest, dateMatch?.expr, amountMatch, today);

    case 'defer': {
      const future = findFutureDate(intentRest, today);
      const date = future?.date ?? null;
      const query = cleanTitle(future ? future.rest : rest);
      const warnings: string[] = [];
      if (!date) warnings.push('Hangi güne taşınacağı anlaşılamadı.');
      if (!query) warnings.push('Hangi ödeme olduğu anlaşılamadı.');
      return {
        ...base,
        intent: 'defer',
        query,
        date,
        warnings,
        confidence: score([date ? 0.5 : 0, query ? 0.3 : 0, intentMatch.strength * 0.2]),
      };
    }

    case 'markPaid': {
      const query = cleanTitle(rest);
      return {
        ...base,
        intent: 'markPaid',
        query,
        amount: amountMatch?.amount,
        date: dateMatch ? toSingleDate(dateMatch.expr, today) : today,
        warnings: query ? [] : ['Hangi ödeme olduğu anlaşılamadı.'],
        confidence: score([query ? 0.6 : 0.1, intentMatch.strength * 0.4]),
      };
    }

    case 'delete': {
      const query = cleanTitle(rest);
      return {
        ...base,
        intent: 'delete',
        query,
        warnings: query ? [] : ['Hangi kaydın silineceği anlaşılamadı.'],
        confidence: score([query ? 0.6 : 0.1, intentMatch.strength * 0.4]),
      };
    }

    case 'send': {
      const recipient = cleanTitle(rest.replace(LIST_NOUNS, ' ')).replace(RECIPIENT_TAIL, '');
      return {
        ...base,
        intent: 'send',
        recipient,
        date: dateMatch ? toSingleDate(dateMatch.expr, today) : today,
        warnings: recipient ? [] : ['Kime gönderileceği söylenmedi.'],
        confidence: score([recipient ? 0.4 : 0.2, intentMatch.strength * 0.5]),
      };
    }

    case 'list':
      return {
        ...base,
        intent: 'list',
        date: dateMatch ? toSingleDate(dateMatch.expr, today) : today,
        warnings: [],
        confidence: score([0.5, intentMatch.strength * 0.5]),
      };
  }
}

function buildAdd(
  base: { raw: string; normalized: string; warnings: string[] },
  rest: string,
  expr: DateExpr | undefined,
  amountMatch: { amount: number; currency?: Currency } | null,
  today: ISODate,
): AddResult {
  const title = cleanTitle(rest);
  const warnings: string[] = [];

  if (!title) warnings.push('Ödemenin adı anlaşılamadı.');
  if (!expr) warnings.push('Tarih anlaşılamadı, lütfen seç.');

  const recurrence: Recurrence = expr
    ? toRecurrence(expr, today)
    : { type: 'once', date: today };

  if (expr && !isRecurringExpr(expr) && expr.kind === 'dayOfMonth') {
    warnings.push('Her ay tekrar edecek şekilde kaydedilecek.');
  }

  return {
    ...base,
    intent: 'add',
    dateMissing: !expr,
    warnings,
    payment: {
      title: title || 'Ödeme',
      amount: amountMatch?.amount,
      currency: amountMatch?.currency,
      category: guessCategory(title),
      recurrence,
    },
    confidence: score([title ? 0.45 : 0, expr ? 0.4 : 0, amountMatch ? 0.15 : 0.05]),
  };
}

/**
 * Ertelemede hedef gün her zaman gelecektedir. "bugün ziraat kartını ödemedim,
 * 20'sine yaz" cümlesinde ilk tarih "bugün"dür ama kastedilen 20'sidir; bu
 * yüzden geçmiş/bugün eşleşmeleri atlanarak devam edilir.
 */
function findFutureDate(
  text: string,
  today: ISODate,
): { date: ISODate; rest: string } | null {
  let rest = text;
  for (let i = 0; i < 3; i++) {
    const match = extractDate(rest, today);
    if (!match) return null;
    rest = removeFirst(rest, match.matched);
    const date = toSingleDate(match.expr, today);
    if (date > today) return { date, rest };
  }
  return null;
}

function score(parts: number[]): number {
  return Math.min(1, Number(parts.reduce((a, b) => a + b, 0).toFixed(2)));
}
