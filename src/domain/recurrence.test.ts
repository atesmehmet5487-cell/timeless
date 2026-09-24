import { describe, expect, it } from 'vitest';
import { createPayment } from './payment';
import {
  applyWeekendPolicy,
  describeRecurrence,
  nextDate,
  occurrenceDates,
  paymentDates,
  resolveMonthDay,
} from './recurrence';
import type { Recurrence } from './types';

const clamp = { monthEndPolicy: 'clampToLastDay' as const, weekendPolicy: 'none' as const };
const skip = { monthEndPolicy: 'skip' as const, weekendPolicy: 'none' as const };

describe('aylık tekrar', () => {
  it("her ayın 15'ini üretir", () => {
    const r: Recurrence = { type: 'monthly', day: 15, from: '2026-09-01' };
    expect(occurrenceDates(r, clamp, '2026-09-01', '2026-12-31')).toEqual([
      '2026-09-15',
      '2026-10-15',
      '2026-11-15',
      '2026-12-15',
    ]);
  });

  it('başlangıç gününden önceki günleri üretmez', () => {
    const r: Recurrence = { type: 'monthly', day: 15, from: '2026-09-20' };
    expect(occurrenceDates(r, clamp, '2026-09-01', '2026-11-30')).toEqual([
      '2026-10-15',
      '2026-11-15',
    ]);
  });

  it("ayın 31'i olmayan aylarda son güne çeker", () => {
    const r: Recurrence = { type: 'monthly', day: 31, from: '2026-01-01' };
    expect(occurrenceDates(r, clamp, '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it("'skip' politikasında olmayan günü atlar", () => {
    const r: Recurrence = { type: 'monthly', day: 31, from: '2026-01-01' };
    expect(occurrenceDates(r, skip, '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-03-31',
    ]);
  });

  it('artık yılda 29 Şubat üretir', () => {
    const r: Recurrence = { type: 'monthly', day: 30, from: '2028-01-01' };
    expect(occurrenceDates(r, clamp, '2028-02-01', '2028-02-29')).toEqual(['2028-02-29']);
  });

  it('bitiş tarihine kadar üretir', () => {
    const r: Recurrence = {
      type: 'monthly',
      day: 5,
      from: '2026-01-01',
      ends: { kind: 'onDate', date: '2026-03-31' },
    };
    expect(occurrenceDates(r, clamp, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-05',
      '2026-02-05',
      '2026-03-05',
    ]);
  });

  it('sayaç serinin başından işler, pencereden değil', () => {
    const r: Recurrence = {
      type: 'monthly',
      day: 5,
      from: '2026-01-01',
      ends: { kind: 'afterCount', count: 3 },
    };
    // Pencere Şubat'tan başlasa bile seri Mart'ta biter
    expect(occurrenceDates(r, clamp, '2026-02-01', '2026-12-31')).toEqual([
      '2026-02-05',
      '2026-03-05',
    ]);
  });
});

describe('hafta sonu politikası', () => {
  it('bir önceki iş gününe çeker', () => {
    expect(applyWeekendPolicy('2026-09-19', 'previousWorkday')).toBe('2026-09-18'); // Cmt → Cuma
    expect(applyWeekendPolicy('2026-09-20', 'previousWorkday')).toBe('2026-09-18'); // Paz → Cuma
    expect(applyWeekendPolicy('2026-09-18', 'previousWorkday')).toBe('2026-09-18'); // Cuma sabit
  });

  it('sonraki iş gününe iter', () => {
    expect(applyWeekendPolicy('2026-09-19', 'nextWorkday')).toBe('2026-09-21');
    expect(applyWeekendPolicy('2026-09-20', 'nextWorkday')).toBe('2026-09-21');
  });

  it('aylık seride hafta sonuna denk gelen ayı kaydırır', () => {
    // 2026-11-15 Pazar → 13 Kasım Cuma
    const r: Recurrence = { type: 'monthly', day: 15, from: '2026-09-01' };
    const dates = occurrenceDates(
      r,
      { monthEndPolicy: 'clampToLastDay', weekendPolicy: 'previousWorkday' },
      '2026-09-01',
      '2026-12-31',
    );
    expect(dates).toEqual(['2026-09-15', '2026-10-15', '2026-11-13', '2026-12-15']);
  });
});

describe('diğer tekrar tipleri', () => {
  it('tek seferlik', () => {
    const r: Recurrence = { type: 'once', date: '2026-10-15' };
    expect(occurrenceDates(r, clamp, '2026-01-01', '2026-12-31')).toEqual(['2026-10-15']);
    expect(occurrenceDates(r, clamp, '2026-11-01', '2026-12-31')).toEqual([]);
  });

  it('haftalık — ilk uygun günden başlar', () => {
    // 2026-09-12 Cumartesi; ilk Perşembe (4) → 17 Eylül
    const r: Recurrence = { type: 'weekly', weekday: 4, from: '2026-09-12' };
    expect(occurrenceDates(r, clamp, '2026-09-01', '2026-10-05')).toEqual([
      '2026-09-17',
      '2026-09-24',
      '2026-10-01',
    ]);
  });

  it('yıllık', () => {
    const r: Recurrence = { type: 'yearly', month: 4, day: 3, from: '2026-01-01' };
    expect(occurrenceDates(r, clamp, '2026-01-01', '2028-12-31')).toEqual([
      '2026-04-03',
      '2027-04-03',
      '2028-04-03',
    ]);
  });

  it('n günde bir', () => {
    const r: Recurrence = { type: 'everyNDays', interval: 10, from: '2026-09-01' };
    expect(occurrenceDates(r, clamp, '2026-09-01', '2026-10-01')).toEqual([
      '2026-09-01',
      '2026-09-11',
      '2026-09-21',
      '2026-10-01',
    ]);
  });
});

describe('ödeme serisi yardımcıları', () => {
  const p = createPayment({
    title: 'Ziraat kart ödeme',
    recurrence: { type: 'monthly', day: 15, from: '2026-09-01' },
  });

  it('bir sonraki ödeme gününü bulur', () => {
    expect(nextDate(p, '2026-09-15')).toBe('2026-10-15');
    expect(nextDate(p, '2026-09-01')).toBe('2026-09-15');
  });

  it('seriyi Türkçe anlatır', () => {
    expect(describeRecurrence(p)).toBe("Her ayın 15'i");
    const yirmi = createPayment({
      title: 'Kira',
      recurrence: { type: 'monthly', day: 20, from: '2026-09-01' },
    });
    expect(describeRecurrence(yirmi)).toBe("Her ayın 20'si");
    const oniki = createPayment({
      title: 'Fatura',
      recurrence: { type: 'monthly', day: 12, from: '2026-09-01' },
    });
    expect(describeRecurrence(oniki)).toBe("Her ayın 12'si");
    const last = createPayment({
      title: 'Elektrik',
      recurrence: { type: 'monthly', day: 31, from: '2026-09-01' },
    });
    expect(describeRecurrence(last)).toBe('Her ayın son günü');
    const weekly = createPayment({
      title: 'Tedarikçi',
      recurrence: { type: 'weekly', weekday: 4, from: '2026-09-01' },
    });
    expect(describeRecurrence(weekly)).toBe('Her hafta Perşembe');
  });

  it('pencere dışı istekte boş döner', () => {
    expect(paymentDates(p, '2026-10-01', '2026-09-01')).toEqual([]);
  });
});

describe('ay günü çözümleme', () => {
  it('var olan günü aynen verir', () => {
    expect(resolveMonthDay(2026, 9, 15, 'clampToLastDay')).toBe('2026-09-15');
  });
  it('olmayan günü çeker ya da atlar', () => {
    expect(resolveMonthDay(2026, 2, 31, 'clampToLastDay')).toBe('2026-02-28');
    expect(resolveMonthDay(2026, 2, 31, 'skip')).toBeNull();
  });
});
