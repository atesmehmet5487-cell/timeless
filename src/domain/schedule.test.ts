import { describe, expect, it } from 'vitest';
import { createPayment } from './payment';
import {
  buildOccurrences,
  dayPlan,
  makeOverride,
  overdueOccurrences,
  sumByCurrency,
} from './schedule';
import type { Override, Payment } from './types';

function kart(from = '2026-01-01'): Payment {
  return createPayment({
    title: 'Ziraat kart ödeme',
    amount: 1500,
    category: 'kart',
    recurrence: { type: 'monthly', day: 15, from },
  });
}

function maas(): Payment {
  return createPayment({
    title: 'Maaş ödeme',
    amount: 45000,
    category: 'maas',
    recurrence: { type: 'monthly', day: 16, from: '2026-09-01' },
  });
}

const TODAY = '2026-09-15';

describe('günlük plan', () => {
  it('o günün kalemlerini listeler', () => {
    // Geçmişi olmayan seriler — gecikmiş kalem toplamı kirletmesin
    const payments = [kart('2026-09-01'), maas()];
    const plan = dayPlan(payments, [], TODAY, TODAY);
    expect(plan.items.map((o) => o.payment.title)).toEqual(['Ziraat kart ödeme']);
    expect(plan.totals.TRY).toBe(1500);
  });

  it('ödendi işaretlenen kalem toplamdan düşer', () => {
    const p = kart('2026-09-01');
    const ov: Override = {
      id: 'o1',
      paymentId: p.id,
      originalDate: TODAY,
      status: 'paid',
      paidAt: '2026-09-15T10:00:00.000Z',
      updatedAt: '2026-09-15T10:00:00.000Z',
    };
    const plan = dayPlan([p], [ov], TODAY, TODAY);
    expect(plan.items[0].status).toBe('paid');
    expect(plan.totals.TRY).toBe(0);
  });
});

describe('erteleme — seriyi bozmamalı', () => {
  const p = kart();
  const ov: Override = {
    id: 'o1',
    paymentId: p.id,
    originalDate: '2026-09-15',
    status: 'deferred',
    deferredTo: '2026-09-20',
    updatedAt: '2026-09-15T10:00:00.000Z',
  };

  it('kalem taşındığı günde görünür', () => {
    const hedef = buildOccurrences([p], [ov], '2026-09-20', '2026-09-20', TODAY);
    expect(hedef).toHaveLength(1);
    expect(hedef[0].movedFrom).toBe('2026-09-15');
    expect(hedef[0].status).toBe('deferred');
  });

  it('kalem eski gününde artık görünmez', () => {
    expect(buildOccurrences([p], [ov], '2026-09-15', '2026-09-15', TODAY)).toHaveLength(0);
  });

  it('gelecek ayın 15\'i yerinde durur', () => {
    const ekim = buildOccurrences([p], [ov], '2026-10-01', '2026-10-31', TODAY);
    expect(ekim.map((o) => o.date)).toEqual(['2026-10-15']);
    expect(ekim[0].movedFrom).toBeUndefined();
    expect(ekim[0].status).toBe('pending');
  });

  it('aynı kalem iki kez sayılmaz', () => {
    const eylul = buildOccurrences([p], [ov], '2026-09-01', '2026-09-30', TODAY);
    expect(eylul).toHaveLength(1);
    expect(eylul[0].date).toBe('2026-09-20');
  });
});

describe('gecikmiş kayıtlar', () => {
  const p = kart();

  it('ödenmemiş geçmiş kalem gecikmiş sayılır', () => {
    const gecikmis = overdueOccurrences([p], [], TODAY);
    expect(gecikmis.length).toBeGreaterThan(0);
    expect(gecikmis.every((o) => o.overdue)).toBe(true);
    expect(gecikmis.every((o) => o.date < TODAY)).toBe(true);
  });

  it('ödenmiş geçmiş kalem gecikmiş sayılmaz', () => {
    const overrides: Override[] = ['2026-08-15', '2026-07-15', '2026-06-15', '2026-05-15',
      '2026-04-15', '2026-03-15', '2026-02-15', '2026-01-15'].map((d, i) => ({
      id: `o${i}`,
      paymentId: p.id,
      originalDate: d,
      status: 'paid' as const,
      updatedAt: '2026-09-01T00:00:00.000Z',
    }));
    expect(overdueOccurrences([p], overrides, TODAY)).toHaveLength(0);
  });

  it('bugünün planında gecikmişler ayrı blokta gelir', () => {
    const plan = dayPlan([p], [], TODAY, TODAY);
    expect(plan.overdue.length).toBeGreaterThan(0);
    expect(plan.items).toHaveLength(1);
    // Toplam: bugünkü + gecikmiş
    expect(plan.totals.TRY).toBe(1500 * (plan.overdue.length + 1));
  });

  it('geçmiş bir güne bakarken gecikmiş bloğu boş olur', () => {
    const plan = dayPlan([p], [], '2026-08-15', TODAY);
    expect(plan.overdue).toHaveLength(0);
  });
});

describe('arşiv ve silme', () => {
  it('silinmiş ve arşivlenmiş seriler listelenmez', () => {
    const silinmis = { ...kart(), deletedAt: '2026-09-01T00:00:00.000Z' };
    const arsiv = { ...maas(), archivedAt: '2026-09-01T00:00:00.000Z' };
    expect(buildOccurrences([silinmis, arsiv], [], '2026-09-01', '2026-09-30', TODAY)).toEqual([]);
  });
});

describe('toplamlar ve müdahale üretimi', () => {
  it('para birimlerini ayrı toplar', () => {
    const usd = createPayment({
      title: 'Sunucu',
      amount: 100,
      currency: 'USD',
      recurrence: { type: 'monthly', day: 15, from: '2026-01-01' },
    });
    const list = buildOccurrences([kart(), usd], [], TODAY, TODAY, TODAY);
    const t = sumByCurrency(list);
    expect(t.TRY).toBe(1500);
    expect(t.USD).toBe(100);
  });

  it('erteleme müdahalesi doğru alanları doldurur', () => {
    const p = kart();
    const occ = buildOccurrences([p], [], TODAY, TODAY, TODAY)[0];
    const ov = makeOverride(occ, { status: 'deferred', deferredTo: '2026-09-20' });
    expect(ov).toMatchObject({
      paymentId: p.id,
      originalDate: TODAY,
      status: 'deferred',
      deferredTo: '2026-09-20',
    });
  });

  it('ödendi müdahalesi erteleme tarihini temizler', () => {
    const p = kart();
    const occ = buildOccurrences([p], [], TODAY, TODAY, TODAY)[0];
    const ertelendi = makeOverride(occ, { status: 'deferred', deferredTo: '2026-09-20' });
    const odendi = makeOverride({ ...occ, override: ertelendi }, { status: 'paid' });
    expect(odendi.status).toBe('paid');
    expect(odendi.deferredTo).toBeUndefined();
    expect(odendi.paidAt).toBeTruthy();
  });
});
