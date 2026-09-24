import { describe, expect, it } from 'vitest';
import { formatMoney } from './money';
import { createPayment } from './payment';
import { buildReport, reportHeading, totalsText } from './report';
import { dayPlan } from './schedule';
import type { Override, Payment } from './types';

const TODAY = '2026-09-15';

function kart(from = '2026-09-01'): Payment {
  return createPayment({
    title: 'Ziraat kart ödeme',
    amount: 1500,
    category: 'kart',
    recurrence: { type: 'monthly', day: 15, from },
  });
}

describe('belge başlığı', () => {
  it('ad girilmişse öne alır', () => {
    expect(reportHeading('2026-09-15', 'Mehmet Ateş')).toBe(
      'MEHMET ATEŞ · 15 EYLÜL 2026 ÖDEME PLANI',
    );
  });

  it('ad yoksa yalnızca tarih yazar', () => {
    expect(reportHeading('2026-09-15')).toBe('15 EYLÜL 2026 ÖDEME PLANI');
    expect(reportHeading('2026-09-15', '   ')).toBe('15 EYLÜL 2026 ÖDEME PLANI');
  });

  it('Türkçe büyük harfe doğru çevirir', () => {
    // "i" harfi İ olmalı, "ı" harfi I olmalı
    expect(reportHeading('2026-09-15', 'işlem ışık')).toContain('İŞLEM IŞIK');
  });
});

describe('rapor satırları', () => {
  it('gecikmişleri önce, günün kalemlerini sonra sıralar', () => {
    const report = buildReport(dayPlan([kart('2026-07-01')], [], TODAY, TODAY), TODAY);
    expect(report.rows.length).toBeGreaterThan(1);
    expect(report.rows[0].overdue).toBe(true);
    expect(report.rows[report.rows.length - 1].date).toBe(TODAY);
    expect(report.rows.map((r) => r.no)).toEqual(
      report.rows.map((_, index) => index + 1),
    );
  });

  it('tutarı olmayan kaydı null bırakır', () => {
    const p = createPayment({
      title: 'Vergi beyannamesi',
      recurrence: { type: 'monthly', day: 15, from: '2026-09-01' },
    });
    const report = buildReport(dayPlan([p], [], TODAY, TODAY), TODAY);
    expect(report.rows[0].amount).toBeNull();
  });

  it('durum metinlerini büyük harfle verir', () => {
    const p = kart();
    const paid: Override = {
      id: 'o1',
      paymentId: p.id,
      originalDate: TODAY,
      status: 'paid',
      updatedAt: '2026-09-15T09:00:00.000Z',
    };
    expect(buildReport(dayPlan([p], [paid], TODAY, TODAY), TODAY).rows[0].status).toBe('ÖDENDİ');
    expect(buildReport(dayPlan([p], [], TODAY, TODAY), TODAY).rows[0].status).toBe('ÖDENMEDİ');
  });

  it('gecikme gün sayısını yazar', () => {
    const report = buildReport(dayPlan([kart('2026-08-01')], [], TODAY, TODAY), TODAY);
    expect(report.rows[0].status).toBe('31 GÜN GECİKTİ');
  });

  it('boş günde satır üretmez ama başlık ve dipnot kalır', () => {
    const report = buildReport(dayPlan([], [], '2026-09-16', TODAY), TODAY);
    expect(report.rows).toEqual([]);
    expect(report.heading).toContain('ÖDEME PLANI');
    expect(report.footer).toContain('15.09.2026');
  });
});

describe('toplam metni', () => {
  it('tek para birimini biçimlendirir', () => {
    expect(totalsText({ TRY: 1500, USD: 0, EUR: 0 }, formatMoney)).toBe('1.500,00 ₺');
  });

  it('birden fazla para birimini birleştirir', () => {
    expect(totalsText({ TRY: 1500, USD: 100, EUR: 0 }, formatMoney)).toBe(
      '1.500,00 ₺   +   100,00 $',
    );
  });

  it('tutar yoksa tire koyar', () => {
    expect(totalsText({ TRY: 0, USD: 0, EUR: 0 }, formatMoney)).toBe('—');
  });
});
