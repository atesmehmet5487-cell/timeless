import { describe, expect, it } from 'vitest';
import { formatMoney, formatMoneyShort, parseMoney } from './money';

describe('tutar ayrıştırma', () => {
  it('Türkçe biçimi okur', () => {
    expect(parseMoney('1.500')).toBe(1500);
    expect(parseMoney('1.500,50')).toBe(1500.5);
    expect(parseMoney('45.000,00')).toBe(45000);
    expect(parseMoney('1500')).toBe(1500);
    expect(parseMoney('1500,75')).toBe(1500.75);
  });

  it('İngilizce biçimi de okur', () => {
    expect(parseMoney('1,500.50')).toBe(1500.5);
    expect(parseMoney('1500.50')).toBe(1500.5);
  });

  it('para birimi eklerini yok sayar', () => {
    expect(parseMoney('1.500 TL')).toBe(1500);
    expect(parseMoney('₺1.500')).toBe(1500);
    expect(parseMoney('3.250 lira')).toBe(3250);
  });

  it('rakam yoksa null döner', () => {
    expect(parseMoney('lira')).toBeNull();
    expect(parseMoney('')).toBeNull();
  });
});

describe('tutar biçimlendirme', () => {
  it('kuruşlu yazar', () => {
    expect(formatMoney(1500)).toBe('1.500,00 ₺');
    expect(formatMoney(1500.5, 'USD')).toBe('1.500,50 $');
  });

  it('kuruş sıfırsa gizler', () => {
    expect(formatMoneyShort(1500)).toBe('1.500 ₺');
    expect(formatMoneyShort(1500.5)).toBe('1.500,50 ₺');
    expect(formatMoneyShort(45000, 'EUR')).toBe('45.000 €');
  });
});
