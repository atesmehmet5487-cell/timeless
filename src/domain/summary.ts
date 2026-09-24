/**
 * Günün planını insan diline çevirir.
 * Aynı metin hem bildirimde, hem sesli okumada, hem WhatsApp mesajında kullanılır.
 */
import * as D from './date';
import { formatMoneyShort } from './money';
import type { DayPlan } from './schedule';
import type { Currency, ISODate, Occurrence } from './types';

function amountPhrase(o: Occurrence): string {
  return typeof o.payment.amount === 'number'
    ? ` ${formatMoneyShort(o.payment.amount, o.payment.currency)}`
    : '';
}

function totalsPhrase(totals: Record<Currency, number>): string {
  const parts = (Object.entries(totals) as [Currency, number][])
    .filter(([, value]) => value > 0)
    .map(([currency, value]) => formatMoneyShort(value, currency));
  return parts.join(' + ');
}

/** Bildirim başlığı: "Bugün 3 ödeme var — 52.300 ₺" */
export function notificationTitle(plan: DayPlan, todayISO: ISODate = D.today()): string {
  const count = plan.items.filter((o) => o.status !== 'paid' && o.status !== 'skipped').length;
  const when = plan.date === todayISO ? 'Bugün' : D.formatShortTR(plan.date);
  if (count === 0 && plan.overdue.length === 0) return `${when} ödeme yok`;
  const totals = totalsPhrase(plan.totals);
  const head = count > 0 ? `${when} ${count} ödeme` : `${when} ödeme yok`;
  const late = plan.overdue.length > 0 ? ` · ${plan.overdue.length} gecikmiş` : '';
  return totals ? `${head}${late} — ${totals}` : `${head}${late}`;
}

/** Bildirim gövdesi: kalem adları. */
export function notificationBody(plan: DayPlan): string {
  const names = [...plan.overdue, ...plan.items]
    .filter((o) => o.status !== 'paid' && o.status !== 'skipped')
    .map((o) => o.payment.title);
  return names.join(' · ');
}

/**
 * Sesli okuma metni. Noktalama, konuşma sentezinin doğru duraklaması için önemli.
 */
export function speakableSummary(plan: DayPlan, todayISO: ISODate = D.today()): string {
  const when =
    plan.date === todayISO ? 'Bugün' : `${D.formatLongTR(plan.date, false)} tarihinde`;
  const pending = plan.items.filter((o) => o.status !== 'paid' && o.status !== 'skipped');
  const lines: string[] = [];

  if (plan.overdue.length > 0) {
    const late = plan.overdue
      .map((o) => `${o.payment.title}${amountPhrase(o)}, ${D.diffDays(o.date, todayISO)} gün gecikmiş`)
      .join('. ');
    lines.push(`Dikkat, ${plan.overdue.length} gecikmiş ödeme var. ${late}.`);
  }

  if (pending.length === 0) {
    lines.push(`${when} ödemen yok.`);
  } else {
    const items = pending.map((o) => `${o.payment.title}${amountPhrase(o)}`).join('. ');
    lines.push(`${when} ${pending.length} ödemen var. ${items}.`);
    const totals = totalsPhrase(plan.totals);
    if (totals) lines.push(`Toplam ${totals}.`);
  }

  const paid = plan.items.filter((o) => o.status === 'paid');
  if (paid.length > 0) lines.push(`${paid.length} ödeme tamamlanmış.`);

  return lines.join(' ');
}

/** WhatsApp / paylaşım metni — PDF'e eşlik eder. */
export function shareText(plan: DayPlan, todayISO: ISODate = D.today()): string {
  const header = `📋 ${D.formatLongTR(plan.date)} — Ödeme Planı`;
  const line = (o: Occurrence) => {
    const mark = o.status === 'paid' ? '✅' : o.overdue ? '⚠️' : '•';
    const amount = typeof o.payment.amount === 'number'
      ? ` — ${formatMoneyShort(o.payment.amount, o.payment.currency)}`
      : '';
    return `${mark} ${o.payment.title}${amount}`;
  };

  const parts = [header, ''];
  if (plan.overdue.length > 0) {
    parts.push(`GECİKMİŞ (${plan.overdue.length})`, ...plan.overdue.map(line), '');
  }
  if (plan.items.length > 0) parts.push(...plan.items.map(line));
  else if (plan.overdue.length === 0) parts.push('Bu güne ait ödeme yok.');

  const totals = totalsPhrase(plan.totals);
  if (totals) parts.push('', `Toplam: ${totals}`);
  if (plan.date === todayISO) parts.push('', 'Timeless ile hazırlandı');
  return parts.join('\n');
}
