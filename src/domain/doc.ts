/**
 * Belge modeli: PDF ve Excel'in ortak dili.
 *
 * Hem günlük ödeme planı hem gider tablosu bu yapıya çevrilir; iki çıktı
 * biçimi de yalnızca bunu tanır. Böylece yeni bir tablo eklemek için
 * PDF/Excel kodlarına dokunmak gerekmiyor ve ikisi asla birbirinden ayrı
 * düşmüyor.
 */
import * as D from './date';
import { formatMoney } from './money';
import type { ReportData } from './report';
import type { PeriodStats } from './stats';
import type { Currency } from './types';

export type CellAlign = 'left' | 'center' | 'right';
/** Satır rengi: ödenmiş yeşil, gecikmiş kırmızı, diğerleri siyah. */
export type CellTone = 'normal' | 'paid' | 'overdue' | 'muted';

export interface DocCell {
  text: string;
  align?: CellAlign;
  bold?: boolean;
  tone?: CellTone;
  /** Doluysa Excel'e metin değil sayı yazılır (toplanabilsin diye). */
  number?: number;
  currency?: Currency;
  /** Yüzde hücresi — Excel'de 0-1 arası değer + % biçimi. */
  percent?: number;
}

export interface DocColumn {
  label: string;
  align: CellAlign;
  /** PDF sütun genişliği (punto); '*' kalan alanı kaplar. */
  width: number | '*';
  /** Excel sütun genişliği (karakter). */
  excelWidth: number;
}

export interface DocTable {
  /** Yeşil şeritteki tek satırlık başlık. */
  heading: string;
  /** Dosya adında kullanılan kök: "odeme-plani-2026-09-15". */
  fileStem: string;
  columns: DocColumn[];
  rows: DocCell[][];
  /** Tablonun altındaki vurgulu toplam satırları. */
  totals: { label: string; value: string; number?: number; currency?: Currency }[];
  footer: string;
  /** Boş tabloda gösterilecek not. */
  emptyNote?: string;
}

function money(value: number, currency: Currency): DocCell {
  return { text: formatMoney(value, currency), align: 'right', number: value, currency };
}

/* ------------------------------------------------------------------ */
/* Günlük ödeme planı                                                  */
/* ------------------------------------------------------------------ */

export function planToDoc(report: ReportData): DocTable {
  const columns: DocColumn[] = [
    { label: 'TARİH', align: 'center', width: 62, excelWidth: 13 },
    { label: 'ÖDEME', align: 'left', width: '*', excelWidth: 38 },
    { label: 'KATEGORİ', align: 'center', width: 78, excelWidth: 14 },
    report.hasIban
      ? { label: 'IBAN', align: 'center' as const, width: 148, excelWidth: 30 }
      : { label: 'TEKRAR', align: 'center' as const, width: 96, excelWidth: 20 },
    // Not sütunu yalnızca en az bir kayıtta not varsa; ödeme adıyla alanı paylaşır
    ...(report.hasNote
      ? [{ label: 'NOT', align: 'left' as const, width: '*' as const, excelWidth: 34 }]
      : []),
    { label: 'TUTAR', align: 'right', width: 88, excelWidth: 16 },
    { label: 'DURUM', align: 'center', width: 84, excelWidth: 18 },
  ];

  const rows = report.rows.map((row): DocCell[] => {
    const tone: CellTone = row.paid ? 'paid' : row.overdue ? 'overdue' : 'normal';
    return [
      { text: row.dateText, align: 'center', tone },
      { text: row.title, align: 'left', tone, bold: !row.paid },
      { text: row.category, align: 'center', tone },
      {
        text: report.hasIban ? (row.iban ?? '—') : row.recurrence,
        align: 'center',
        tone,
      },
      ...(report.hasNote ? [{ text: row.note ?? '', align: 'left' as const, tone }] : []),
      row.amount === null
        ? { text: '—', align: 'right', tone }
        : { ...money(row.amount, row.currency), tone, bold: !row.paid },
      { text: row.status, align: 'center', tone, bold: true },
    ];
  });

  const totals = (Object.entries(report.totals) as [Currency, number][])
    .filter(([, value]) => value > 0)
    .map(([currency, value]) => ({
      label: 'ÖDENECEK TOPLAM',
      value: formatMoney(value, currency),
      number: value,
      currency,
    }));

  return {
    heading: report.heading,
    fileStem: `odeme-plani-${report.date}`,
    columns,
    rows,
    totals: totals.length > 0 ? totals : [{ label: 'ÖDENECEK TOPLAM', value: '—' }],
    footer: report.footer,
    emptyNote: 'Bu güne ait ödeme yok.',
  };
}

/* ------------------------------------------------------------------ */
/* Gider tablosu                                                       */
/* ------------------------------------------------------------------ */

/** "MEHMET ATEŞ · EYLÜL 2026 GİDER TABLOSU" */
export function statsHeading(stats: PeriodStats, owner?: string): string {
  const base = `${stats.label} GİDER TABLOSU`.toLocaleUpperCase('tr');
  const name = owner?.trim();
  return name ? `${name.toLocaleUpperCase('tr')} · ${base}` : base;
}

export function statsToDoc(stats: PeriodStats, owner: string | undefined, todayISO: string): DocTable {
  const columns: DocColumn[] = [
    { label: 'KATEGORİ', align: 'left', width: '*', excelWidth: 28 },
    { label: 'ÖDEME SAYISI', align: 'center', width: 86, excelWidth: 15 },
    { label: 'TOPLAM', align: 'right', width: 96, excelWidth: 17 },
    { label: 'ÖDENEN', align: 'right', width: 96, excelWidth: 17 },
    { label: 'KALAN', align: 'right', width: 96, excelWidth: 17 },
    { label: 'PAY', align: 'center', width: 62, excelWidth: 10 },
  ];

  const rows = stats.byCategory.map((item): DocCell[] => [
    { text: item.label, align: 'left', bold: true },
    { text: String(item.count), align: 'center', number: item.count },
    { ...money(item.total, stats.currency), bold: true },
    { ...money(item.paid, stats.currency), tone: item.paid > 0 ? 'paid' : 'muted' },
    { ...money(item.pending, stats.currency), tone: item.pending > 0 ? 'normal' : 'muted' },
    {
      text: `%${Math.round(item.share * 100)}`,
      align: 'center',
      percent: item.share,
    },
  ]);

  const totals = [
    {
      label: 'DÖNEM TOPLAMI',
      value: formatMoney(stats.total, stats.currency),
      number: stats.total,
      currency: stats.currency,
    },
    {
      label: 'ÖDENEN',
      value: formatMoney(stats.paid, stats.currency),
      number: stats.paid,
      currency: stats.currency,
    },
    {
      label: 'KALAN',
      value: formatMoney(stats.pending, stats.currency),
      number: stats.pending,
      currency: stats.currency,
    },
  ];

  if (stats.overdue > 0) {
    totals.push({
      label: 'GECİKMİŞ',
      value: formatMoney(stats.overdue, stats.currency),
      number: stats.overdue,
      currency: stats.currency,
    });
  }

  return {
    heading: statsHeading(stats, owner),
    fileStem: `gider-tablosu-${stats.from}_${stats.to}`,
    columns,
    rows,
    totals,
    footer: `${D.formatShortTR(todayISO)} tarihinde Timeless ile hazırlandı · ${stats.from} – ${stats.to}`,
    emptyNote: 'Bu dönemde ödeme yok.',
  };
}
