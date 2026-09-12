/**
 * Hangi bildirimin ne zaman çıkacağını hesaplar.
 *
 * Saf fonksiyon: platform bilmiyor. Android'de sonuç işletim sistemine
 * zamanlanır, Windows'ta Electron zamanlayıcısına verilir, tarayıcıda
 * setTimeout ile kurulur — üçü de aynı listeyi kullanır.
 */
import * as D from './date';
import { dayPlan } from './schedule';
import { notificationBody, notificationTitle } from './summary';
import type { HHMM, ISODate, Override, Payment, Settings } from './types';

export type ReminderKind = 'dailySummary' | 'item' | 'eveningCheck';

export interface Reminder {
  /**
   * Aynı bildirimin iki kez kurulmaması için deterministik kimlik.
   * Yeniden zamanlama her açılışta yapıldığından bu şart.
   */
  id: string;
  kind: ReminderKind;
  /** Bildirimin çıkacağı gün. */
  date: ISODate;
  time: HHMM;
  title: string;
  body: string;
  /** Kalem hatırlatmalarında ilgili seri. */
  paymentId?: string;
  /** Kalem hatırlatmalarında müdahale anahtarı. */
  originalDate?: ISODate;
}

/**
 * Android'de aynı anda bekleyebilecek bildirim sayısı sınırlıdır (~500).
 * Güvenli tarafta kalıyoruz; liste her açılışta zaten yenileniyor.
 */
export const MAX_SCHEDULED = 400;

/** Varsayılan pencere: bugünden itibaren 60 gün. */
export const DEFAULT_HORIZON_DAYS = 60;

function toDate(date: ISODate, time: HHMM): Date {
  const { year, month, day } = D.parts(date);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

/** Bildirim zamanı geçmişte mi? */
export function isPast(reminder: Reminder, now: Date = new Date()): boolean {
  return toDate(reminder.date, reminder.time).getTime() <= now.getTime();
}

/** Şimdiye göre kaç milisaniye sonra çıkacak. */
export function delayMs(reminder: Reminder, now: Date = new Date()): number {
  return toDate(reminder.date, reminder.time).getTime() - now.getTime();
}

export function reminderAt(reminder: Reminder): Date {
  return toDate(reminder.date, reminder.time);
}

/**
 * Verilen pencere için bildirim listesi üretir.
 * Geçmiş zamanlar atlanır; sonuç zamana göre sıralıdır.
 */
export function buildReminders(
  payments: Payment[],
  overrides: Override[],
  settings: Settings,
  opts: { today?: ISODate; days?: number; now?: Date } = {},
): Reminder[] {
  const now = opts.now ?? new Date();
  const today = opts.today ?? D.today(now);
  const days = opts.days ?? DEFAULT_HORIZON_DAYS;
  const out: Reminder[] = [];

  for (let offset = 0; offset <= days; offset++) {
    const date = D.addDays(today, offset);
    const plan = dayPlan(payments, overrides, date, today);
    const pending = plan.items.filter((o) => o.status !== 'paid' && o.status !== 'skipped');
    const overdue = offset === 0 ? plan.overdue : [];

    // 1) Günün özeti
    if (settings.dailySummaryEnabled && (pending.length > 0 || overdue.length > 0)) {
      out.push({
        id: `daily|${date}`,
        kind: 'dailySummary',
        date,
        time: settings.dailySummaryAt,
        title: notificationTitle(plan, today),
        body: notificationBody(plan),
      });
    }

    // 2) Kalem başına ek hatırlatmalar
    for (const occurrence of pending) {
      const payment = occurrence.payment;
      if (!payment.remindAt) continue;
      const remindDate = D.addDays(occurrence.date, -(payment.remindDaysBefore ?? 0));
      if (remindDate < today) continue;
      const when =
        payment.remindDaysBefore > 0
          ? `${D.formatShortTR(occurrence.date)} tarihli ödeme`
          : 'Bugünkü ödeme';
      out.push({
        id: `item|${payment.id}|${occurrence.originalDate}`,
        kind: 'item',
        date: remindDate,
        time: payment.remindAt,
        title: payment.title,
        body: when,
        paymentId: payment.id,
        originalDate: occurrence.originalDate,
      });
    }

    // 3) Akşam kontrolü — sadece o gün ödenmemiş kalem varsa
    if (settings.eveningCheckEnabled && pending.length > 0) {
      out.push({
        id: `evening|${date}`,
        kind: 'eveningCheck',
        date,
        time: settings.eveningCheckAt,
        title: 'Ödemeleri işaretledin mi?',
        body: `${pending.length} ödeme hâlâ işaretlenmemiş görünüyor.`,
      });
    }
  }

  const unique = new Map<string, Reminder>();
  for (const reminder of out) {
    if (isPast(reminder, now)) continue;
    if (!unique.has(reminder.id)) unique.set(reminder.id, reminder);
  }

  return [...unique.values()]
    .sort((a, b) => reminderAt(a).getTime() - reminderAt(b).getTime())
    .slice(0, MAX_SCHEDULED);
}
