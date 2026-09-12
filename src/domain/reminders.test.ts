import { describe, expect, it } from 'vitest';
import { createPayment } from './payment';
import { buildReminders, MAX_SCHEDULED } from './reminders';
import { DEFAULT_SETTINGS } from './types';
import type { Override, Payment, Settings } from './types';

/** 12 Eylül 2026 Cumartesi, saat 08:00. */
const NOW = new Date(2026, 8, 12, 8, 0, 0);
const TODAY = '2026-09-12';

const settings: Settings = { ...DEFAULT_SETTINGS, dailySummaryAt: '09:00' };

function kart(day = 12): Payment {
  return createPayment({
    title: 'Ziraat kart ödeme',
    amount: 1500,
    category: 'kart',
    recurrence: { type: 'monthly', day, from: '2026-09-01' },
  });
}

describe('günlük özet bildirimi', () => {
  it('ödeme olan günler için kurulur', () => {
    const list = buildReminders([kart()], [], settings, { today: TODAY, days: 40, now: NOW });
    const daily = list.filter((r) => r.kind === 'dailySummary');
    expect(daily.map((r) => r.date)).toEqual(['2026-09-12', '2026-10-12']);
    expect(daily[0].time).toBe('09:00');
    expect(daily[0].title).toContain('Bugün 1 ödeme');
    expect(daily[0].body).toBe('Ziraat kart ödeme');
  });

  it('ödeme olmayan günler için kurulmaz', () => {
    const list = buildReminders([], [], settings, { today: TODAY, days: 30, now: NOW });
    expect(list).toEqual([]);
  });

  it('kapatılınca hiç kurulmaz', () => {
    const list = buildReminders([kart()], [], { ...settings, dailySummaryEnabled: false }, {
      today: TODAY,
      days: 40,
      now: NOW,
    });
    expect(list.filter((r) => r.kind === 'dailySummary')).toEqual([]);
  });

  it('ödendi işaretlenen gün için kurulmaz', () => {
    const p = kart();
    const paid: Override = {
      id: 'o1',
      paymentId: p.id,
      originalDate: TODAY,
      status: 'paid',
      updatedAt: NOW.toISOString(),
    };
    const list = buildReminders([p], [paid], settings, { today: TODAY, days: 20, now: NOW });
    expect(list.some((r) => r.date === TODAY)).toBe(false);
  });

  it('ertelenen kalem yeni gününde hatırlatılır', () => {
    const p = kart();
    const deferred: Override = {
      id: 'o1',
      paymentId: p.id,
      originalDate: TODAY,
      status: 'deferred',
      deferredTo: '2026-09-20',
      updatedAt: NOW.toISOString(),
    };
    const list = buildReminders([p], [deferred], settings, { today: TODAY, days: 30, now: NOW });
    const daily = list.filter((r) => r.kind === 'dailySummary').map((r) => r.date);
    expect(daily).toContain('2026-09-20');
    expect(daily).not.toContain('2026-09-12');
  });
});

describe('zamanı geçmiş bildirimler', () => {
  it('bugünün saati geçtiyse atlanır', () => {
    const geceYarisi = new Date(2026, 8, 12, 23, 30, 0);
    const list = buildReminders([kart()], [], settings, {
      today: TODAY,
      days: 40,
      now: geceYarisi,
    });
    expect(list.some((r) => r.date === TODAY)).toBe(false);
    expect(list.some((r) => r.date === '2026-10-12')).toBe(true);
  });

  it('saat henüz gelmediyse kurulur', () => {
    const sabah = new Date(2026, 8, 12, 7, 0, 0);
    const list = buildReminders([kart()], [], settings, { today: TODAY, days: 5, now: sabah });
    expect(list.some((r) => r.date === TODAY)).toBe(true);
  });
});

describe('kalem hatırlatmaları', () => {
  it('kendi saatinde kurulur', () => {
    const p = createPayment({
      title: 'Kira',
      recurrence: { type: 'monthly', day: 15, from: '2026-09-01' },
      remindAt: '10:30',
    });
    const list = buildReminders([p], [], settings, { today: TODAY, days: 10, now: NOW });
    const item = list.find((r) => r.kind === 'item');
    expect(item).toMatchObject({ date: '2026-09-15', time: '10:30', title: 'Kira' });
    expect(item?.paymentId).toBe(p.id);
  });

  it('gün öncesinden hatırlatır', () => {
    const p = createPayment({
      title: 'Vergi',
      recurrence: { type: 'monthly', day: 15, from: '2026-09-01' },
      remindAt: '09:00',
      remindDaysBefore: 2,
    });
    const list = buildReminders([p], [], settings, { today: TODAY, days: 10, now: NOW });
    const item = list.find((r) => r.kind === 'item');
    expect(item?.date).toBe('2026-09-13');
    expect(item?.body).toContain('15.09.2026');
  });

  it('saat verilmemişse kalem hatırlatması yok', () => {
    const list = buildReminders([kart()], [], settings, { today: TODAY, days: 10, now: NOW });
    expect(list.some((r) => r.kind === 'item')).toBe(false);
  });
});

describe('akşam kontrolü', () => {
  it('açıkken ödenmemiş kalem varsa kurulur', () => {
    const list = buildReminders([kart()], [], { ...settings, eveningCheckEnabled: true }, {
      today: TODAY,
      days: 1,
      now: NOW,
    });
    const evening = list.find((r) => r.kind === 'eveningCheck');
    expect(evening).toMatchObject({ date: TODAY, time: '20:00' });
  });

  it('varsayılan olarak kapalıdır', () => {
    const list = buildReminders([kart()], [], settings, { today: TODAY, days: 1, now: NOW });
    expect(list.some((r) => r.kind === 'eveningCheck')).toBe(false);
  });
});

describe('liste bütünlüğü', () => {
  it('zamana göre sıralıdır', () => {
    const payments = [kart(12), kart(13), kart(20)];
    const list = buildReminders(payments, [], settings, { today: TODAY, days: 60, now: NOW });
    const times = list.map((r) => `${r.date} ${r.time}`);
    expect([...times].sort()).toEqual(times);
  });

  it('aynı bildirim iki kez kurulmaz', () => {
    const list = buildReminders([kart()], [], settings, { today: TODAY, days: 60, now: NOW });
    expect(new Set(list.map((r) => r.id)).size).toBe(list.length);
  });

  it('platform sınırını aşmaz', () => {
    const payments = Array.from({ length: 30 }, (_, i) =>
      createPayment({
        title: `Ödeme ${i}`,
        recurrence: { type: 'everyNDays', interval: 1, from: '2026-09-01' },
        remindAt: '11:00',
      }),
    );
    const list = buildReminders(payments, [], { ...settings, eveningCheckEnabled: true }, {
      today: TODAY,
      days: 60,
      now: NOW,
    });
    expect(list.length).toBeLessThanOrEqual(MAX_SCHEDULED);
  });
});
