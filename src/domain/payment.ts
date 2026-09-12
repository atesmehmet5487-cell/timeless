/** Yeni ödeme serisi üretimi ve küçük yardımcılar. */
import * as D from './date';
import { DEFAULT_SETTINGS } from './types';
import type { Currency, ISODate, Payment, Recurrence, Settings } from './types';

export interface NewPaymentInput {
  title: string;
  recurrence: Recurrence;
  amount?: number;
  currency?: Currency;
  category?: Payment['category'];
  /** Ödeme hesabı — zorunlu değil. */
  iban?: string;
  note?: string;
  remindAt?: string;
  remindDaysBefore?: number;
  monthEndPolicy?: Payment['monthEndPolicy'];
  weekendPolicy?: Payment['weekendPolicy'];
}

export function createPayment(
  input: NewPaymentInput,
  settings: Settings = DEFAULT_SETTINGS,
  now: Date = new Date(),
): Payment {
  const stamp = now.toISOString();
  return {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    amount: input.amount,
    currency: input.currency ?? settings.defaultCurrency,
    category: input.category ?? 'diger',
    iban: input.iban,
    note: input.note,
    recurrence: input.recurrence,
    monthEndPolicy: input.monthEndPolicy ?? settings.defaultMonthEndPolicy,
    weekendPolicy: input.weekendPolicy ?? settings.defaultWeekendPolicy,
    remindAt: input.remindAt,
    remindDaysBefore: input.remindDaysBefore ?? 0,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/** Aynı başlık + aynı tekrar günü → büyük ihtimalle mükerrer kayıt. */
export function findDuplicate(payments: Payment[], candidate: Payment): Payment | undefined {
  const norm = (s: string) => s.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
  return payments.find(
    (p) =>
      !p.deletedAt &&
      p.id !== candidate.id &&
      norm(p.title) === norm(candidate.title) &&
      JSON.stringify(p.recurrence) === JSON.stringify(candidate.recurrence),
  );
}

/** Tek seferlik ödeme kısayolu. */
export function onceOn(date: ISODate): Recurrence {
  return { type: 'once', date };
}

/** Her ayın belirli günü. */
export function monthlyOn(day: number, from: ISODate = D.today()): Recurrence {
  return { type: 'monthly', day, from };
}
