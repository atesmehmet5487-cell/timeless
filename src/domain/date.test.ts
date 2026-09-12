import { describe, expect, it } from 'vitest';
import * as D from './date';

describe('tarih yardımcıları', () => {
  it('ay uzunluklarını ve artık yılı bilir', () => {
    expect(D.daysInMonth(2026, 2)).toBe(28);
    expect(D.daysInMonth(2028, 2)).toBe(29); // artık yıl
    expect(D.daysInMonth(2026, 4)).toBe(30);
    expect(D.daysInMonth(2026, 12)).toBe(31);
  });

  it('gün ekler, ay sınırını doğru geçer', () => {
    expect(D.addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(D.addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(D.addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('ay eklerken taşan günü son güne çeker', () => {
    expect(D.addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(D.addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(D.addMonths('2026-11-15', 2)).toBe('2027-01-15');
    expect(D.addMonths('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('hafta gününü ISO sırasıyla verir', () => {
    expect(D.weekday('2026-09-14')).toBe(1); // Pazartesi
    expect(D.weekday('2026-09-19')).toBe(6); // Cumartesi
    expect(D.weekday('2026-09-20')).toBe(7); // Pazar
    expect(D.isWeekend('2026-09-19')).toBe(true);
    expect(D.isWeekend('2026-09-18')).toBe(false);
  });

  it('gün farkını hesaplar', () => {
    expect(D.diffDays('2026-09-12', '2026-09-15')).toBe(3);
    expect(D.diffDays('2026-09-15', '2026-09-12')).toBe(-3);
    expect(D.diffDays('2026-02-28', '2026-03-01')).toBe(1);
  });

  it('geçerli tarihi doğrular', () => {
    expect(D.isISODate('2026-09-15')).toBe(true);
    expect(D.isISODate('2026-02-30')).toBe(false);
    expect(D.isISODate('2026-13-01')).toBe(false);
    expect(D.isISODate('15.09.2026')).toBe(false);
  });

  it('Türkçe biçimlendirir', () => {
    expect(D.formatLongTR('2026-09-15')).toBe('15 Eylül 2026 Salı');
    expect(D.formatShortTR('2026-09-05')).toBe('05.09.2026');
    expect(D.formatRelativeTR('2026-09-13', '2026-09-12')).toBe('yarın');
    expect(D.formatRelativeTR('2026-09-12', '2026-09-12')).toBe('bugün');
    expect(D.formatRelativeTR('2026-09-11', '2026-09-12')).toBe('dün');
  });

  it('yerel günü saat diliminden etkilenmeden verir', () => {
    // 23:30'da bile gün ileri kaymamalı
    expect(D.today(new Date(2026, 8, 15, 23, 30))).toBe('2026-09-15');
    expect(D.today(new Date(2026, 8, 15, 0, 5))).toBe('2026-09-15');
  });
});

describe('Türkçe gün ekleri', () => {
  it('ayın gününü doğru çeker', () => {
    const cases: [number, string][] = [
      [1, "1'i"], [2, "2'si"], [3, "3'ü"], [4, "4'ü"], [5, "5'i"],
      [6, "6'sı"], [7, "7'si"], [8, "8'i"], [9, "9'u"], [10, "10'u"],
      [12, "12'si"], [15, "15'i"], [16, "16'sı"], [20, "20'si"],
      [25, "25'i"], [30, "30'u"], [31, "31'i"],
    ];
    for (const [day, expected] of cases) expect(D.dayOrdinalTR(day)).toBe(expected);
  });
});
