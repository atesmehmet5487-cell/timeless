import { describe, expect, it } from 'vitest';
import { createPayment } from './payment';
import { periodRange, shiftPeriod, summarizePeriod } from './stats';
import type { Override, Payment } from './types';

/** 15 Eylül 2026, Salı. */
const TODAY = '2026-09-15';

function payment(
  title: string,
  amount: number,
  category: string,
  day: number,
  currency: 'TRY' | 'USD' = 'TRY',
): Payment {
  return createPayment({
    title,
    amount,
    currency,
    category,
    recurrence: { type: 'monthly', day, from: '2026-09-01' },
  });
}

describe('dönem sınırları', () => {
  it('gün', () => {
    const r = periodRange('day', TODAY);
    expect([r.from, r.to]).toEqual([TODAY, TODAY]);
    expect(r.label).toBe('15 Eylül 2026');
  });

  it('hafta pazartesi başlar', () => {
    const r = periodRange('week', TODAY);
    expect([r.from, r.to]).toEqual(['2026-09-14', '2026-09-20']);
    expect(r.label).toBe('14 – 20 Eylül 2026');
  });

  it('iki aya yayılan haftayı doğru adlandırır', () => {
    const r = periodRange('week', '2026-10-01');
    expect(r.label).toBe('28 Eylül – 4 Ekim 2026');
  });

  it('ay', () => {
    const r = periodRange('month', TODAY);
    expect([r.from, r.to]).toEqual(['2026-09-01', '2026-09-30']);
    expect(r.label).toBe('Eylül 2026');
  });

  it('yıl', () => {
    const r = periodRange('year', TODAY);
    expect([r.from, r.to]).toEqual(['2026-01-01', '2026-12-31']);
    expect(r.label).toBe('2026');
  });
});

describe('dönem gezinme', () => {
  it('ileri ve geri gider', () => {
    expect(shiftPeriod('day', TODAY, 1)).toBe('2026-09-16');
    expect(shiftPeriod('week', TODAY, -1)).toBe('2026-09-08');
    expect(shiftPeriod('month', TODAY, 1)).toBe('2026-10-01');
    expect(shiftPeriod('year', TODAY, -1)).toBe('2025-01-01');
  });
});

describe('kategori dağılımı', () => {
  const payments = [
    payment('Elektrik', 2000, 'fatura', 10),
    payment('Su', 500, 'fatura', 12),
    payment('Ziraat kart', 5000, 'kart', 15),
    payment('Aserva cari', 2500, 'cari', 20),
  ];

  it('kategorileri büyükten küçüğe sıralar', () => {
    const stats = summarizePeriod(payments, [], 'month', TODAY, { today: TODAY });
    expect(stats.byCategory.map((c) => c.label)).toEqual([
      'Kredi Kartı',
      'Cari Hesap',
      'Fatura',
    ]);
    expect(stats.byCategory[0].total).toBe(5000);
    expect(stats.byCategory[2].total).toBe(2500); // 2000 + 500
  });

  it('payları toplamda 1 eder', () => {
    const stats = summarizePeriod(payments, [], 'month', TODAY, { today: TODAY });
    const sum = stats.byCategory.reduce((acc, c) => acc + c.share, 0);
    expect(sum).toBeCloseTo(1, 5);
    expect(stats.total).toBe(10000);
  });

  it('özel kategori adını çözer', () => {
    const custom = [{ id: 'ozel-nakliye-1', label: 'Nakliye' }];
    const stats = summarizePeriod([payment('Tır', 900, 'ozel-nakliye-1', 15)], [], 'month', TODAY, {
      today: TODAY,
      categories: custom,
    });
    expect(stats.byCategory[0].label).toBe('Nakliye');
  });

  it('gün dönemi yalnızca o günü sayar', () => {
    const stats = summarizePeriod(payments, [], 'day', TODAY, { today: TODAY });
    expect(stats.total).toBe(5000);
    expect(stats.count).toBe(1);
  });
});

describe('ödenen / kalan / gecikmiş', () => {
  const p = payment('Ziraat kart', 5000, 'kart', 15);

  it('ödenmiş kalemi ayırır', () => {
    const paid: Override = {
      id: 'o1',
      paymentId: p.id,
      originalDate: TODAY,
      status: 'paid',
      updatedAt: '2026-09-15T09:00:00.000Z',
    };
    const stats = summarizePeriod([p], [paid], 'month', TODAY, { today: TODAY });
    expect(stats.paid).toBe(5000);
    expect(stats.pending).toBe(0);
    expect(stats.paidCount).toBe(1);
  });

  it('gecikmişleri sayar', () => {
    const gecmis = payment('Kira', 12000, 'kira', 5); // 5 Eylül, bugün 15'i
    const stats = summarizePeriod([gecmis], [], 'month', TODAY, { today: TODAY });
    expect(stats.overdue).toBe(12000);
    expect(stats.overdueCount).toBe(1);
  });

  it('atlanan kalemi hiç saymaz', () => {
    const skipped: Override = {
      id: 'o1',
      paymentId: p.id,
      originalDate: TODAY,
      status: 'skipped',
      updatedAt: '2026-09-15T09:00:00.000Z',
    };
    const stats = summarizePeriod([p], [skipped], 'month', TODAY, { today: TODAY });
    expect(stats.total).toBe(0);
    expect(stats.count).toBe(0);
  });
});

describe('para birimleri', () => {
  it('farklı para birimini toplama karıştırmaz', () => {
    const payments = [
      payment('Kira', 10000, 'kira', 15),
      payment('Sunucu', 100, 'diger', 15, 'USD'),
    ];
    const stats = summarizePeriod(payments, [], 'month', TODAY, { today: TODAY });
    expect(stats.total).toBe(10000);
    expect(stats.otherCurrencies).toEqual([{ currency: 'USD', total: 100 }]);
  });
});

describe('günlük ortalama', () => {
  it('dönem uzunluğuna böler', () => {
    const stats = summarizePeriod([payment('Kira', 3000, 'kira', 15)], [], 'week', TODAY, {
      today: TODAY,
    });
    expect(stats.dailyAverage).toBeCloseTo(3000 / 7, 5);
  });

  it('boş dönemde sıfırdır', () => {
    const stats = summarizePeriod([], [], 'month', TODAY, { today: TODAY });
    expect(stats.total).toBe(0);
    expect(stats.dailyAverage).toBe(0);
    expect(stats.byCategory).toEqual([]);
  });
});
