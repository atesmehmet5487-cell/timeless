/**
 * Ayrıştırılmış komutu uygulanabilir bir eyleme dönüştürür.
 *
 * Burada hiçbir şey kaydedilmez; sadece "ne yapılacak, hangi kayıt üzerinde,
 * emin miyiz" sorularının cevabı hazırlanır. Kaydetme kararı kullanıcınındır.
 */
import * as D from '../domain/date';
import { formatMoneyShort } from '../domain/money';
import { describeRecurrence } from '../domain/recurrence';
import type { NewPaymentInput } from '../domain/payment';
import type { ISODate, Occurrence, Payment } from '../domain/types';
import { bestMatch, rankOccurrences, rankPayments } from './match';
import type { ParseResult } from './parse';

export type Action =
  | { kind: 'add'; payment: NewPaymentInput; summary: string }
  | { kind: 'defer'; occurrence: Occurrence; date: ISODate; summary: string }
  | { kind: 'markPaid'; occurrence: Occurrence; amount?: number; summary: string }
  | { kind: 'delete'; payment: Payment; summary: string }
  | { kind: 'send'; date: ISODate; recipient: string; summary: string }
  | { kind: 'list'; date: ISODate; summary: string }
  /** Hedef seçilemedi — kullanıcıya aday listesi gösterilecek. */
  | { kind: 'chooseOccurrence'; candidates: Occurrence[]; next: PendingOccurrenceAction }
  | { kind: 'choosePayment'; candidates: Payment[]; next: { kind: 'delete' } }
  /** Eksik bilgi var, komut uygulanamaz. */
  | { kind: 'incomplete'; reason: string };

export type PendingOccurrenceAction =
  | { kind: 'defer'; date: ISODate }
  | { kind: 'markPaid'; amount?: number };

export interface CommandContext {
  today: ISODate;
  /** Bugün ve gecikmişler dahil, eşleştirmeye açık kalemler. */
  openOccurrences: Occurrence[];
  payments: Payment[];
}

/** Ekleme taslağını tek cümlede özetler — onay ekranında gösterilir. */
export function describePayment(input: NewPaymentInput, today: ISODate): string {
  const parts = [input.title];
  const fake = {
    recurrence: input.recurrence,
    monthEndPolicy: 'clampToLastDay' as const,
  } as Payment;
  parts.push(describeRecurrence({ ...fake, recurrence: input.recurrence }));
  if (typeof input.amount === 'number') {
    parts.push(formatMoneyShort(input.amount, input.currency ?? 'TRY'));
  }
  if (input.recurrence.type === 'once') {
    parts[1] = D.formatLongTR(input.recurrence.date, input.recurrence.date !== today);
  }
  return parts.join(' · ');
}

export function planAction(result: ParseResult, ctx: CommandContext): Action {
  switch (result.intent) {
    case 'add':
      return {
        kind: 'add',
        payment: result.payment,
        summary: describePayment(result.payment, ctx.today),
      };

    case 'defer': {
      if (!result.date) return { kind: 'incomplete', reason: 'Hangi güne taşınacağı anlaşılamadı.' };
      const matches = rankOccurrences(result.query, ctx.openOccurrences);
      const target = bestMatch(matches);
      if (!target) {
        return matches.length > 0
          ? {
              kind: 'chooseOccurrence',
              candidates: matches.slice(0, 5).map((m) => m.item),
              next: { kind: 'defer', date: result.date },
            }
          : {
              kind: 'chooseOccurrence',
              candidates: ctx.openOccurrences,
              next: { kind: 'defer', date: result.date },
            };
      }
      return {
        kind: 'defer',
        occurrence: target,
        date: result.date,
        summary: `${target.payment.title} · ${D.formatShortTR(target.date)} → ${D.formatLongTR(result.date, false)}`,
      };
    }

    case 'markPaid': {
      const matches = rankOccurrences(result.query, ctx.openOccurrences);
      const target = bestMatch(matches);
      if (!target) {
        return {
          kind: 'chooseOccurrence',
          candidates: matches.length > 0 ? matches.slice(0, 5).map((m) => m.item) : ctx.openOccurrences,
          next: { kind: 'markPaid', amount: result.amount },
        };
      }
      const amount = result.amount ?? target.payment.amount;
      return {
        kind: 'markPaid',
        occurrence: target,
        amount: result.amount,
        summary:
          `${target.payment.title} ödendi olarak işaretlenecek` +
          (typeof amount === 'number'
            ? ` · ${formatMoneyShort(amount, target.payment.currency)}`
            : ''),
      };
    }

    case 'delete': {
      const active = ctx.payments.filter((p) => !p.deletedAt);
      const matches = rankPayments(result.query, active);
      const target = bestMatch(matches);
      if (!target) {
        return {
          kind: 'choosePayment',
          candidates: matches.length > 0 ? matches.slice(0, 5).map((m) => m.item) : active,
          next: { kind: 'delete' },
        };
      }
      return {
        kind: 'delete',
        payment: target,
        summary: `${target.title} çöp kutusuna taşınacak (30 gün geri alınabilir)`,
      };
    }

    case 'send':
      return {
        kind: 'send',
        date: result.date,
        recipient: result.recipient,
        summary:
          `${D.formatLongTR(result.date, false)} planı` +
          (result.recipient ? ` · ${result.recipient}` : ''),
      };

    case 'list':
      return {
        kind: 'list',
        date: result.date,
        summary: `${D.formatLongTR(result.date, false)} listesi`,
      };
  }
}

/** Niyetin Türkçe adı — onay ekranı başlığı. */
export const INTENT_LABELS: Record<ParseResult['intent'], string> = {
  add: 'Yeni ödeme',
  defer: 'Başka güne taşı',
  markPaid: 'Ödendi işaretle',
  delete: 'Kaydı sil',
  send: 'Listeyi gönder',
  list: 'Listeyi göster',
};
