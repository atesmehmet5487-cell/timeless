import { describe, expect, it } from 'vitest';
import { normalizePhone, formatPhoneTR, whatsappUrl } from './phone';
import { createPayment } from './payment';
import { dayPlan } from './schedule';
import { notificationBody, notificationTitle, shareText, speakableSummary } from './summary';
import type { Contact, Override, Payment } from './types';

const TODAY = '2026-09-15';

function kart(from = '2026-09-01'): Payment {
  return createPayment({
    title: 'Ziraat kart ödeme',
    amount: 1500,
    category: 'kart',
    recurrence: { type: 'monthly', day: 15, from },
  });
}

function kira(): Payment {
  return createPayment({
    title: 'Kira',
    amount: 12000,
    category: 'kira',
    recurrence: { type: 'monthly', day: 15, from: '2026-09-01' },
  });
}

describe('bildirim metinleri', () => {
  it('başlıkta sayı ve toplam olur', () => {
    const plan = dayPlan([kart(), kira()], [], TODAY, TODAY);
    expect(notificationTitle(plan, TODAY)).toBe('Bugün 2 ödeme — 13.500 ₺');
    expect(notificationBody(plan)).toBe('Kira · Ziraat kart ödeme');
  });

  it('ödeme yoksa bunu söyler', () => {
    const plan = dayPlan([], [], TODAY, TODAY);
    expect(notificationTitle(plan, TODAY)).toBe('Bugün ödeme yok');
  });

  it('başka bir gün için tarih yazar', () => {
    const plan = dayPlan([kart()], [], '2026-10-15', TODAY);
    expect(notificationTitle(plan, TODAY)).toContain('15.10.2026');
  });
});

describe('sesli okuma metni', () => {
  it('kalemleri ve toplamı okur', () => {
    const plan = dayPlan([kart()], [], TODAY, TODAY);
    const text = speakableSummary(plan, TODAY);
    expect(text).toContain('Bugün 1 ödemen var');
    expect(text).toContain('Ziraat kart ödeme 1.500 ₺');
    expect(text).toContain('Toplam');
  });

  it('ödeme yoksa kısa cümle kurar', () => {
    const plan = dayPlan([], [], TODAY, TODAY);
    expect(speakableSummary(plan, TODAY)).toBe('Bugün ödemen yok.');
  });

  it('gecikmişleri önce söyler', () => {
    // Serinin Ağustos örneği ödenmemiş kalır
    const plan = dayPlan([kart('2026-08-01')], [], TODAY, TODAY);
    const text = speakableSummary(plan, TODAY);
    expect(text.startsWith('Dikkat')).toBe(true);
    expect(text).toContain('gecikmiş');
  });

  it('ödenmiş kalemleri ayrıca belirtir', () => {
    const p = kart();
    const paid: Override = {
      id: 'o1',
      paymentId: p.id,
      originalDate: TODAY,
      status: 'paid',
      updatedAt: '2026-09-15T09:00:00.000Z',
    };
    const text = speakableSummary(dayPlan([p], [paid], TODAY, TODAY), TODAY);
    expect(text).toContain('1 ödeme tamamlanmış');
  });
});

describe('paylaşım metni', () => {
  it('başlık, kalemler ve toplam içerir', () => {
    const text = shareText(dayPlan([kart(), kira()], [], TODAY, TODAY), TODAY);
    expect(text).toContain('15 Eylül 2026 Salı — Ödeme Planı');
    expect(text).toContain('• Kira — 12.000 ₺');
    expect(text).toContain('Toplam: 13.500 ₺');
  });

  it('ödenmiş kalemi işaretler', () => {
    const p = kart();
    const paid: Override = {
      id: 'o1',
      paymentId: p.id,
      originalDate: TODAY,
      status: 'paid',
      updatedAt: '2026-09-15T09:00:00.000Z',
    };
    expect(shareText(dayPlan([p], [paid], TODAY, TODAY), TODAY)).toContain('✅');
  });

  it('boş günü açıkça yazar', () => {
    expect(shareText(dayPlan([], [], '2026-09-16', TODAY), TODAY)).toContain(
      'Bu güne ait ödeme yok',
    );
  });
});

describe('telefon numaraları', () => {
  it('yerel numarayı uluslararası biçime çevirir', () => {
    expect(normalizePhone('0555 111 22 33')).toBe('905551112233');
    expect(normalizePhone('+90 555 111 22 33')).toBe('905551112233');
    expect(normalizePhone('00905551112233')).toBe('905551112233');
    expect(normalizePhone('555 111 22 33')).toBe('905551112233');
  });

  it('okunabilir biçime döndürür', () => {
    expect(formatPhoneTR('905551112233')).toBe('0555 111 22 33');
  });

  it('wa.me bağlantısı kurar', () => {
    const contact: Contact = {
      id: 'c1',
      name: 'Ahmet',
      phone: '0555 111 22 33',
      createdAt: '2026-09-01T00:00:00.000Z',
    };
    const url = whatsappUrl('Merhaba', contact);
    expect(url).toBe('https://wa.me/905551112233?text=Merhaba');
    expect(whatsappUrl('Merhaba')).toBe('https://wa.me/?text=Merhaba');
  });

  it('Türkçe karakterleri kodlar', () => {
    expect(whatsappUrl('Ödeme Planı')).toContain('%C3%96deme%20Plan%C4%B1');
  });
});
