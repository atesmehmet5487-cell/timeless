/**
 * Tekrar kuralından takvim günleri üretir.
 * Saf fonksiyonlar — veritabanı ya da "bugün" bilgisi gerekmez.
 */
import * as D from './date';
import type { ISODate, MonthEndPolicy, Payment, Recurrence, WeekendPolicy } from './types';

/** Sonsuz döngüye karşı güvenlik sınırı. */
const MAX_STEPS = 5000;

/** Hafta sonuna denk gelen günü politikaya göre kaydırır. */
export function applyWeekendPolicy(date: ISODate, policy: WeekendPolicy): ISODate {
  if (policy === 'none' || !D.isWeekend(date)) return date;
  const wd = D.weekday(date); // 6 = Cumartesi, 7 = Pazar
  if (policy === 'previousWorkday') return D.addDays(date, wd === 6 ? -1 : -2);
  return D.addDays(date, wd === 6 ? 2 : 1);
}

/**
 * Bir ayda istenen günü döndürür.
 * O ayda gün yoksa (31 Şubat gibi) politikaya göre son güne çeker ya da atlar.
 */
export function resolveMonthDay(
  year: number,
  month: number,
  day: number,
  policy: MonthEndPolicy,
): ISODate | null {
  const last = D.daysInMonth(year, month);
  if (day <= last) return D.toISO(year, month, day);
  return policy === 'clampToLastDay' ? D.toISO(year, month, last) : null;
}

/** Serinin başlangıç günü (bir kez olanlarda kendi tarihi). */
export function seriesStart(r: Recurrence): ISODate {
  return r.type === 'once' ? r.date : r.from;
}

/**
 * Kuralın ürettiği ham günler — hafta sonu kaydırması uygulanmadan önce.
 * `ends` sayacı serinin başından itibaren işler, pencereden bağımsızdır.
 */
function* rawDates(
  r: Recurrence,
  monthEndPolicy: MonthEndPolicy,
  until: ISODate,
): Generator<ISODate> {
  if (r.type === 'once') {
    if (r.date <= until) yield r.date;
    return;
  }

  const endsOn = r.ends?.kind === 'onDate' ? r.ends.date : undefined;
  const maxCount = r.ends?.kind === 'afterCount' ? r.ends.count : Infinity;
  const hardStop = endsOn ? D.min(endsOn, until) : until;

  let emitted = 0;
  let steps = 0;

  if (r.type === 'monthly') {
    let { year, month } = D.parts(r.from);
    while (steps++ < MAX_STEPS && emitted < maxCount) {
      const date = resolveMonthDay(year, month, r.day, monthEndPolicy);
      if (date && date > hardStop) return;
      if (date && date >= r.from) {
        emitted++;
        yield date;
      }
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }
    return;
  }

  if (r.type === 'weekly') {
    let cursor = r.from;
    const diff = (r.weekday - D.weekday(cursor) + 7) % 7;
    cursor = D.addDays(cursor, diff);
    while (steps++ < MAX_STEPS && emitted < maxCount && cursor <= hardStop) {
      emitted++;
      yield cursor;
      cursor = D.addDays(cursor, 7);
    }
    return;
  }

  if (r.type === 'yearly') {
    let year = D.parts(r.from).year;
    while (steps++ < MAX_STEPS && emitted < maxCount) {
      const date = resolveMonthDay(year, r.month, r.day, monthEndPolicy);
      if (date && date > hardStop) return;
      if (date && date >= r.from) {
        emitted++;
        yield date;
      }
      year++;
    }
    return;
  }

  // everyNDays
  const step = Math.max(1, Math.floor(r.interval));
  let cursor = r.from;
  while (steps++ < MAX_STEPS && emitted < maxCount && cursor <= hardStop) {
    emitted++;
    yield cursor;
    cursor = D.addDays(cursor, step);
  }
}

/**
 * [from, to] aralığına düşen ödeme günleri (hafta sonu kaydırması uygulanmış,
 * artan sırada, tekrarsız).
 *
 * Kaydırma günü pencerenin dışına taşıyabileceği için tarama penceresi
 * birkaç gün geniş tutulur.
 */
export function occurrenceDates(
  recurrence: Recurrence,
  opts: { monthEndPolicy: MonthEndPolicy; weekendPolicy: WeekendPolicy },
  from: ISODate,
  to: ISODate,
): ISODate[] {
  if (to < from) return [];
  const pad = opts.weekendPolicy === 'none' ? 0 : 3;
  const scanTo = D.addDays(to, pad);
  const scanFrom = D.addDays(from, -pad);

  const out: ISODate[] = [];
  const seen = new Set<ISODate>();
  for (const raw of rawDates(recurrence, opts.monthEndPolicy, scanTo)) {
    const date = applyWeekendPolicy(raw, opts.weekendPolicy);
    if (date < scanFrom || date < from || date > to) continue;
    if (seen.has(date)) continue;
    seen.add(date);
    out.push(date);
  }
  return out.sort(D.compare);
}

/** Bir ödeme serisinin verilen aralıktaki günleri. */
export function paymentDates(payment: Payment, from: ISODate, to: ISODate): ISODate[] {
  return occurrenceDates(
    payment.recurrence,
    { monthEndPolicy: payment.monthEndPolicy, weekendPolicy: payment.weekendPolicy },
    from,
    to,
  );
}

/** `after` gününden sonraki ilk ödeme günü (yoksa null). Varsayılan ufuk 5 yıl. */
export function nextDate(payment: Payment, after: ISODate, horizonDays = 1830): ISODate | null {
  const dates = paymentDates(payment, D.addDays(after, 1), D.addDays(after, horizonDays));
  return dates[0] ?? null;
}

/** İnsan okunabilir tekrar açıklaması: "Her ayın 15'i". */
export function describeRecurrence(payment: Payment): string {
  const r = payment.recurrence;
  const suffix = (() => {
    if (!('ends' in r) || !r.ends || r.ends.kind === 'never') return '';
    if (r.ends.kind === 'onDate') return ` (${D.formatShortTR(r.ends.date)} tarihine kadar)`;
    return ` (${r.ends.count} kez)`;
  })();

  switch (r.type) {
    case 'once':
      return D.formatLongTR(r.date);
    case 'monthly': {
      const isLast = r.day === 31 && payment.monthEndPolicy === 'clampToLastDay';
      return (isLast ? 'Her ayın son günü' : `Her ayın ${D.dayOrdinalTR(r.day)}`) + suffix;
    }
    case 'weekly':
      return `Her hafta ${D.weekdayNameTR(D.addDays('2026-01-05', r.weekday - 1))}` + suffix;
    case 'yearly':
      return `Her yıl ${r.day} ${D.monthNameTR(r.month)}` + suffix;
    case 'everyNDays':
      return `${r.interval} günde bir` + suffix;
  }
}
