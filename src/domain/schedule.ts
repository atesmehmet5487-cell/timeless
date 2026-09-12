/**
 * Seriler + müdahaleler → ekranda görünen ödeme satırları.
 *
 * Buradaki tek kritik kural: bir örneğin ertelenmesi seriyi bozmaz.
 * Erteleme, `Override.originalDate` anahtarıyla sadece o güne yazılır.
 */
import * as D from './date';
import { paymentDates } from './recurrence';
import type { Currency, ISODate, Occurrence, Override, Payment } from './types';

/** Gecikmiş ödemeler kaç gün geriye kadar aranır. */
export const OVERDUE_LOOKBACK_DAYS = 400;

export function overrideKey(paymentId: string, originalDate: ISODate): string {
  return `${paymentId}|${originalDate}`;
}

export function indexOverrides(overrides: Override[]): Map<string, Override> {
  const map = new Map<string, Override>();
  for (const o of overrides) map.set(overrideKey(o.paymentId, o.originalDate), o);
  return map;
}

/** Listelerde görünmesi gereken seriler (silinmiş/arşivlenmiş olanlar hariç). */
export function activePayments(payments: Payment[]): Payment[] {
  return payments.filter((p) => !p.deletedAt && !p.archivedAt);
}

function toOccurrence(
  payment: Payment,
  originalDate: ISODate,
  override: Override | undefined,
  todayISO: ISODate,
): Occurrence {
  const status = override?.status ?? 'pending';
  const date = status === 'deferred' && override?.deferredTo ? override.deferredTo : originalDate;
  return {
    paymentId: payment.id,
    payment,
    originalDate,
    date,
    status,
    movedFrom: date !== originalDate ? originalDate : undefined,
    overdue: status !== 'paid' && status !== 'skipped' && date < todayISO,
    override,
  };
}

/**
 * [from, to] aralığında görünen tüm ödeme satırları.
 * Başka bir günden bu aralığa ertelenmiş kayıtlar da dahil edilir;
 * aralıktan dışarı ertelenmiş olanlar çıkarılır.
 */
export function buildOccurrences(
  payments: Payment[],
  overrides: Override[],
  from: ISODate,
  to: ISODate,
  todayISO: ISODate = D.today(),
): Occurrence[] {
  const active = activePayments(payments);
  const byId = new Map(active.map((p) => [p.id, p]));
  const index = indexOverrides(overrides);
  const out: Occurrence[] = [];
  const seen = new Set<string>();

  for (const payment of active) {
    for (const originalDate of paymentDates(payment, from, to)) {
      const override = index.get(overrideKey(payment.id, originalDate));
      const occ = toOccurrence(payment, originalDate, override, todayISO);
      // Aralığın dışına ertelenmişse burada gösterme — taşındığı günde görünecek.
      if (occ.date < from || occ.date > to) continue;
      seen.add(overrideKey(payment.id, originalDate));
      out.push(occ);
    }
  }

  // Aralığın dışından buraya ertelenmiş kayıtlar
  for (const o of overrides) {
    if (o.status !== 'deferred' || !o.deferredTo) continue;
    if (o.deferredTo < from || o.deferredTo > to) continue;
    const key = overrideKey(o.paymentId, o.originalDate);
    if (seen.has(key)) continue;
    const payment = byId.get(o.paymentId);
    if (!payment) continue;
    seen.add(key);
    out.push(toOccurrence(payment, o.originalDate, o, todayISO));
  }

  return sortOccurrences(out);
}

/** Gün → saat → başlık sırası. Gecikmişler en eskiden yeniye. */
export function sortOccurrences(list: Occurrence[]): Occurrence[] {
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return D.compare(a.date, b.date);
    const ta = a.payment.remindAt ?? '';
    const tb = b.payment.remindAt ?? '';
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.payment.title.localeCompare(b.payment.title, 'tr');
  });
}

/** Tarihi geçmiş ve hâlâ ödenmemiş kayıtlar. Otomatik taşınmazlar, listede kalırlar. */
export function overdueOccurrences(
  payments: Payment[],
  overrides: Override[],
  todayISO: ISODate = D.today(),
  lookbackDays = OVERDUE_LOOKBACK_DAYS,
): Occurrence[] {
  const from = D.addDays(todayISO, -lookbackDays);
  const to = D.addDays(todayISO, -1);
  return buildOccurrences(payments, overrides, from, to, todayISO).filter(
    (o) => o.status === 'pending' || o.status === 'deferred',
  );
}

export interface DayPlan {
  date: ISODate;
  /** O güne ait kayıtlar. */
  items: Occurrence[];
  /** Geçmişten devreden, hâlâ ödenmemiş kayıtlar (sadece bugünün planında dolu). */
  overdue: Occurrence[];
  totals: Record<Currency, number>;
}

/** Bir günün tam planı: o günün kalemleri + (bugünse) gecikmişler. */
export function dayPlan(
  payments: Payment[],
  overrides: Override[],
  date: ISODate,
  todayISO: ISODate = D.today(),
): DayPlan {
  const items = buildOccurrences(payments, overrides, date, date, todayISO);
  const overdue = date === todayISO ? overdueOccurrences(payments, overrides, todayISO) : [];
  return { date, items, overdue, totals: sumByCurrency([...overdue, ...items]) };
}

/** Ödenmemiş kalemlerin para birimi bazında toplamı. */
export function sumByCurrency(list: Occurrence[]): Record<Currency, number> {
  const totals: Record<Currency, number> = { TRY: 0, USD: 0, EUR: 0 };
  for (const o of list) {
    if (o.status === 'paid' || o.status === 'skipped') continue;
    if (typeof o.payment.amount === 'number') totals[o.payment.currency] += o.payment.amount;
  }
  return totals;
}

/** Bir örneğe müdahale kaydı üretir (kalıcılık repo katmanının işi). */
export function makeOverride(
  occurrence: Occurrence,
  patch: Partial<Pick<Override, 'status' | 'deferredTo' | 'paidAmount' | 'note'>>,
  now: Date = new Date(),
): Override {
  const base = occurrence.override;
  return {
    id: base?.id ?? crypto.randomUUID(),
    paymentId: occurrence.paymentId,
    originalDate: occurrence.originalDate,
    status: patch.status ?? base?.status ?? 'pending',
    deferredTo: patch.status === 'deferred' ? patch.deferredTo : undefined,
    paidAt: patch.status === 'paid' ? now.toISOString() : base?.paidAt,
    paidAmount: patch.paidAmount ?? base?.paidAmount,
    note: patch.note ?? base?.note,
    updatedAt: now.toISOString(),
  };
}
