/**
 * Gider özeti: bir dönemde ne kadar ödeme var, ne kadarı hangi kategoriden.
 *
 * Saf hesap katmanı — ekran bilmiyor. Gün/hafta/ay/yıl aynı işlevden çıkar,
 * böylece "bugün" ile "bu ay" arasında tutarsızlık olamaz.
 */
import { categoryLabel, type CustomCategory } from './category';
import * as D from './date';
import { buildOccurrences } from './schedule';
import type { Currency, ISODate, Occurrence, Override, Payment } from './types';

export type PeriodKind = 'day' | 'week' | 'month' | 'year';

export interface PeriodRange {
  kind: PeriodKind;
  from: ISODate;
  to: ISODate;
  /** "12 Eylül 2026" / "7 – 13 Eylül 2026" / "Eylül 2026" / "2026" */
  label: string;
}

export interface CategoryStat {
  id: string;
  label: string;
  total: number;
  paid: number;
  pending: number;
  count: number;
  /** Dönem toplamı içindeki payı, 0-1 arası. */
  share: number;
}

export interface PeriodStats extends PeriodRange {
  currency: Currency;
  /** Dönemdeki tüm kalemler (ödenmiş + ödenmemiş). */
  total: number;
  paid: number;
  pending: number;
  /** Tarihi geçmiş ve hâlâ ödenmemiş tutar. */
  overdue: number;
  count: number;
  paidCount: number;
  overdueCount: number;
  byCategory: CategoryStat[];
  /** Seçili para birimi dışındaki toplamlar — gizlenmesin diye ayrıca taşınır. */
  otherCurrencies: { currency: Currency; total: number }[];
  /** Günlük ortalama — dönem uzunluğuna bölünmüş toplam. */
  dailyAverage: number;
}

const MONTHS_GENITIVE = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

/** Dönemin sınırları ve okunur adı. Hafta Pazartesi başlar. */
export function periodRange(kind: PeriodKind, anchor: ISODate): PeriodRange {
  const { year, month, day } = D.parts(anchor);

  if (kind === 'day') {
    return { kind, from: anchor, to: anchor, label: D.formatLongTR(anchor, false) };
  }

  if (kind === 'week') {
    const from = D.addDays(anchor, -(D.weekday(anchor) - 1));
    const to = D.addDays(from, 6);
    const a = D.parts(from);
    const b = D.parts(to);
    const label =
      a.month === b.month
        ? `${a.day} – ${b.day} ${MONTHS_GENITIVE[a.month - 1]} ${b.year}`
        : `${a.day} ${MONTHS_GENITIVE[a.month - 1]} – ${b.day} ${MONTHS_GENITIVE[b.month - 1]} ${b.year}`;
    return { kind, from, to, label };
  }

  if (kind === 'month') {
    const from = D.toISO(year, month, 1);
    return {
      kind,
      from,
      to: D.lastDayOfMonth(from),
      label: `${MONTHS_GENITIVE[month - 1]} ${year}`,
    };
  }

  void day;
  return { kind, from: D.toISO(year, 1, 1), to: D.toISO(year, 12, 31), label: String(year) };
}

/** Bir dönem ileri/geri gider. */
export function shiftPeriod(kind: PeriodKind, anchor: ISODate, step: number): ISODate {
  if (kind === 'day') return D.addDays(anchor, step);
  if (kind === 'week') return D.addDays(anchor, step * 7);
  if (kind === 'month') return D.addMonths(D.startOfMonth(anchor), step);
  return D.addYears(D.toISO(D.parts(anchor).year, 1, 1), step);
}

export const PERIOD_LABELS: Record<PeriodKind, string> = {
  day: 'Gün',
  week: 'Hafta',
  month: 'Ay',
  year: 'Yıl',
};

function amountOf(o: Occurrence): number {
  return typeof o.payment.amount === 'number' ? o.payment.amount : 0;
}

/** Dönemin gider özeti. */
export function summarizePeriod(
  payments: Payment[],
  overrides: Override[],
  kind: PeriodKind,
  anchor: ISODate,
  opts: { today?: ISODate; currency?: Currency; categories?: CustomCategory[] } = {},
): PeriodStats {
  const today = opts.today ?? D.today();
  const currency = opts.currency ?? 'TRY';
  const categories = opts.categories ?? [];
  const range = periodRange(kind, anchor);

  const all = buildOccurrences(payments, overrides, range.from, range.to, today);
  const mine = all.filter((o) => o.payment.currency === currency && o.status !== 'skipped');

  let total = 0;
  let paid = 0;
  let overdue = 0;
  let paidCount = 0;
  let overdueCount = 0;

  const buckets = new Map<string, CategoryStat>();

  for (const o of mine) {
    const value = amountOf(o);
    total += value;
    if (o.status === 'paid') {
      paid += value;
      paidCount++;
    } else if (o.overdue) {
      overdue += value;
      overdueCount++;
    }

    const id = String(o.payment.category);
    const bucket = buckets.get(id) ?? {
      id,
      label: categoryLabel(o.payment.category, categories),
      total: 0,
      paid: 0,
      pending: 0,
      count: 0,
      share: 0,
    };
    bucket.total += value;
    bucket.count++;
    if (o.status === 'paid') bucket.paid += value;
    else bucket.pending += value;
    buckets.set(id, bucket);
  }

  const byCategory = [...buckets.values()]
    .map((bucket) => ({ ...bucket, share: total > 0 ? bucket.total / total : 0 }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'tr'));

  // Diğer para birimleri ayrı gösterilir; tek toplamda karıştırmak yanıltıcı olur
  const others = new Map<Currency, number>();
  for (const o of all) {
    if (o.payment.currency === currency || o.status === 'skipped') continue;
    others.set(o.payment.currency, (others.get(o.payment.currency) ?? 0) + amountOf(o));
  }

  const days = D.diffDays(range.from, range.to) + 1;

  return {
    ...range,
    currency,
    total,
    paid,
    pending: total - paid,
    overdue,
    count: mine.length,
    paidCount,
    overdueCount,
    byCategory,
    otherCurrencies: [...others.entries()]
      .filter(([, value]) => value > 0)
      .map(([c, value]) => ({ currency: c, total: value })),
    dailyAverage: days > 0 ? total / days : 0,
  };
}
