/**
 * Günün planından tablo satırları üretir.
 *
 * PDF ve Excel aynı kaynaktan beslenir; böylece iki çıktı hiçbir zaman
 * birbirinden ayrı düşmez.
 */
import * as D from './date';
import { describeRecurrence } from './recurrence';
import type { DayPlan } from './schedule';
import { categoryLabel, type CustomCategory } from './category';
import type { Currency, ISODate, Occurrence } from './types';

export interface ReportRow {
  /** Sıra numarası. */
  no: number;
  date: ISODate;
  /** "12.09.2026" */
  dateText: string;
  title: string;
  category: string;
  /** Ödeme hesabı; girilmemişse null. */
  iban: string | null;
  recurrence: string;
  /** Tutar yoksa null — Excel'de boş hücre, PDF'te tire. */
  amount: number | null;
  currency: Currency;
  status: string;
  /** Gecikmiş satırlar kırmızı gösterilir. */
  overdue: boolean;
  paid: boolean;
}

export interface ReportData {
  /** Yeşil şeritteki tek satırlık başlık. */
  heading: string;
  date: ISODate;
  rows: ReportRow[];
  /** IBAN sütunu gösterilsin mi? */
  hasIban: boolean;
  totals: Record<Currency, number>;
  /** "12.09.2026 tarihinde hazırlandı" */
  footer: string;
}

/** IBAN sütunu yalnızca en az bir kayıtta IBAN varsa eklenir. */
export const REPORT_COLUMNS = ['TARİH', 'ÖDEME', 'KATEGORİ', 'IBAN', 'TUTAR', 'DURUM'] as const;
export const REPORT_COLUMNS_NO_IBAN = [
  'TARİH',
  'ÖDEME',
  'KATEGORİ',
  'TEKRAR',
  'TUTAR',
  'DURUM',
] as const;

function statusText(o: Occurrence, todayISO: ISODate): string {
  if (o.status === 'paid') return 'ÖDENDİ';
  if (o.status === 'skipped') return 'ATLANDI';
  if (o.overdue) return `${D.diffDays(o.date, todayISO)} GÜN GECİKTİ`;
  if (o.status === 'deferred') return 'ERTELENDİ';
  return 'ÖDENMEDİ';
}

function toRow(
  o: Occurrence,
  index: number,
  todayISO: ISODate,
  custom: CustomCategory[],
): ReportRow {
  return {
    no: index + 1,
    date: o.date,
    dateText: D.formatShortTR(o.date),
    title: o.payment.title,
    category: categoryLabel(o.payment.category, custom),
    iban: o.payment.iban?.trim() || null,
    recurrence: describeRecurrence(o.payment),
    amount: typeof o.payment.amount === 'number' ? o.payment.amount : null,
    currency: o.payment.currency,
    status: statusText(o, todayISO),
    overdue: o.overdue,
    paid: o.status === 'paid',
  };
}

/**
 * Başlık metni: "MEHMET ATEŞ · 12 EYLÜL 2026 ÖDEME PLANI"
 * Ayarlarda isim girilmemişse yalnızca tarih kısmı yazılır.
 */
export function reportHeading(date: ISODate, owner?: string): string {
  const datePart = `${D.formatLongTR(date, false)} ÖDEME PLANI`.toLocaleUpperCase('tr');
  const name = owner?.trim();
  return name ? `${name.toLocaleUpperCase('tr')} · ${datePart}` : datePart;
}

/** Gecikmişler önce, sonra günün kalemleri — ekrandaki sırayla aynı. */
export function buildReport(
  plan: DayPlan,
  todayISO: ISODate,
  owner?: string,
  custom: CustomCategory[] = [],
): ReportData {
  const all = [...plan.overdue, ...plan.items];
  const rows = all.map((o, i) => toRow(o, i, todayISO, custom));
  return {
    heading: reportHeading(plan.date, owner),
    date: plan.date,
    rows,
    // Kimsede IBAN yoksa boş bir sütun göstermenin anlamı yok
    hasIban: rows.some((row) => row.iban !== null),
    totals: plan.totals,
    footer: `${D.formatShortTR(todayISO)} tarihinde Timeless ile hazırlandı`,
  };
}

/** Toplam satırının metni: "13.500,00 ₺" ya da birden fazla para birimi. */
export function totalsText(
  totals: Record<Currency, number>,
  format: (value: number, currency: Currency) => string,
): string {
  const parts = (Object.entries(totals) as [Currency, number][])
    .filter(([, value]) => value > 0)
    .map(([currency, value]) => format(value, currency));
  return parts.length > 0 ? parts.join('   +   ') : '—';
}
