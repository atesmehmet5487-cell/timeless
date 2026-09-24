import { describe, expect, it } from 'vitest';
import { normalize, wordsToNumber } from './normalize';
import { parseCommand, type AddResult, type DeferResult } from './parse';

/** Testlerin sabit "bugün"ü: 12 Eylül 2026, Cumartesi. */
const TODAY = '2026-09-12';

function add(text: string): AddResult {
  const result = parseCommand(text, TODAY);
  if (result.intent !== 'add') throw new Error(`'add' bekleniyordu, '${result.intent}' geldi: ${text}`);
  return result;
}

describe('normalizasyon', () => {
  it('Türkçe büyük harfleri doğru küçültür', () => {
    expect(normalize('ZİRAAT Kart')).toBe('ziraat kart');
    expect(normalize('IĞDIR')).toBe('ığdır');
  });

  it('sayı kelimelerini rakama çevirir', () => {
    expect(wordsToNumber(['on', 'beş'])).toBe(15);
    expect(wordsToNumber(['bin', 'beş', 'yüz'])).toBe(1500);
    expect(wordsToNumber(['kırk', 'beş', 'bin'])).toBe(45000);
    expect(normalize('ayın onbeşinde')).toContain('15');
  });

  it('sayıya yapışık ekleri ayırır', () => {
    expect(normalize("ayın 15'inde")).toBe('ayın 15 inde');
    expect(normalize('ayın 16 sında')).toBe('ayın 16 sında');
  });

  it('tutardaki ayırıcıları korur', () => {
    expect(normalize('1.500,50 TL')).toBe('1.500,50 tl');
  });
});

describe('ödeme ekleme', () => {
  it("ayın 15'inde ziraat kart ödeme", () => {
    const r = add("ayın 15'inde ziraat kart ödeme");
    expect(r.payment.recurrence).toEqual({ type: 'monthly', day: 15, from: TODAY });
    expect(r.payment.title).toBe('Ziraat kart ödeme');
    expect(r.payment.category).toBe('kart');
    expect(r.confidence).toBeGreaterThan(0.7);
  });

  it("her ayın 16'sında maaş ödeme 45.000 lira", () => {
    const r = add("her ayın 16'sında maaş ödeme 45.000 lira");
    expect(r.payment.recurrence).toEqual({ type: 'monthly', day: 16, from: TODAY });
    expect(r.payment.title).toBe('Maaş ödeme');
    expect(r.payment.amount).toBe(45000);
    expect(r.payment.currency).toBe('TRY');
    expect(r.payment.category).toBe('maas');
  });

  it('sayıyı harfle söyleyince de anlar', () => {
    const r = add('ayın onbeşinde kira bin beş yüz lira');
    expect(r.payment.recurrence).toEqual({ type: 'monthly', day: 15, from: TODAY });
    expect(r.payment.amount).toBe(1500);
    expect(r.payment.category).toBe('kira');
  });

  it('ayın sonunda elektrik faturası', () => {
    const r = add('ayın sonunda elektrik faturası');
    expect(r.payment.recurrence).toEqual({ type: 'monthly', day: 31, from: TODAY });
    expect(r.payment.category).toBe('fatura');
  });

  it('15 Ekim de vergi 3.250 TL', () => {
    const r = add("15 Ekim'de vergi 3.250 TL");
    expect(r.payment.recurrence).toEqual({ type: 'once', date: '2026-10-15' });
    expect(r.payment.amount).toBe(3250);
    expect(r.payment.category).toBe('vergi');
  });

  it('geçmiş bir gün söylenirse gelecek yıla taşır', () => {
    const r = add('3 Mart ta muhasebe ücreti');
    expect(r.payment.recurrence).toEqual({ type: 'once', date: '2027-03-03' });
  });

  it('yarın kira', () => {
    const r = add('yarın kira');
    expect(r.payment.recurrence).toEqual({ type: 'once', date: '2026-09-13' });
  });

  it('haftaya salı sigorta', () => {
    const r = add('haftaya salı sigorta');
    // 12 Eylül Cumartesi → gelecek hafta pazartesi 14, salı 15
    expect(r.payment.recurrence).toEqual({ type: 'once', date: '2026-09-15' });
    expect(r.payment.category).toBe('sigorta');
  });

  it('her yıl 3 Nisan da araç muayene', () => {
    const r = add('her yıl 3 Nisan da araç muayene');
    expect(r.payment.recurrence).toEqual({ type: 'yearly', month: 4, day: 3, from: TODAY });
  });

  it('her hafta perşembe tedarikçi ödemesi', () => {
    const r = add('her hafta perşembe tedarikçi ödemesi');
    expect(r.payment.recurrence).toEqual({ type: 'weekly', weekday: 4, from: TODAY });
  });

  it('15 günde bir stok ödemesi', () => {
    const r = add('her 15 günde bir stok ödemesi');
    expect(r.payment.recurrence).toEqual({ type: 'everyNDays', interval: 15, from: TODAY });
  });

  it('sayısal tarih biçimini okur', () => {
    const r = add('20.11.2026 kasko 8.400 TL');
    expect(r.payment.recurrence).toEqual({ type: 'once', date: '2026-11-20' });
    expect(r.payment.amount).toBe(8400);
    expect(r.payment.category).toBe('sigorta');
  });

  it('dolar ve euro tutarlarını ayırır', () => {
    expect(add('ayın 5 inde sunucu 100 dolar').payment.currency).toBe('USD');
    expect(add('ayın 5 inde lisans 49 euro').payment.currency).toBe('EUR');
  });

  it('tarih söylenmezse uyarır ama kaydı hazırlar', () => {
    const r = add('muhasebeciye ödeme');
    expect(r.dateMissing).toBe(true);
    expect(r.warnings.join(' ')).toContain('Tarih');
    expect(r.payment.title).toBe('Muhasebeciye ödeme');
  });

  it('küçük sayıları tutar sanmaz', () => {
    const r = add("ayın 15'inde ziraat kart ödeme");
    expect(r.payment.amount).toBeUndefined();
  });
});

describe('erteleme', () => {
  function defer(text: string): DeferResult {
    const r = parseCommand(text, TODAY);
    if (r.intent !== 'defer') throw new Error(`'defer' bekleniyordu, '${r.intent}' geldi: ${text}`);
    return r;
  }

  it("bugün ziraat kartı ödemedim, 20'sine yaz", () => {
    const r = defer("bugün ziraat kartı ödemedim, 20'sine yaz");
    expect(r.date).toBe('2026-09-20');
    expect(r.query.toLocaleLowerCase('tr')).toContain('ziraat');
  });

  it('kirayı yarına kaydır', () => {
    const r = defer('kirayı yarına kaydır');
    expect(r.date).toBe('2026-09-13');
    expect(r.query.toLocaleLowerCase('tr')).toContain('kira');
  });

  it("maaşı ayın 18'ine ertele", () => {
    const r = defer("maaşı ayın 18'ine ertele");
    expect(r.date).toBe('2026-09-18');
  });

  it('geçmiş bir güne ertelenirse gelecek aya taşır', () => {
    // Bugün 12 Eylül; "5'ine" denince Ekim'in 5'i kastedilmiştir
    const r = defer("faturayı 5'ine ertele");
    expect(r.date).toBe('2026-10-05');
  });

  it('gün söylenmezse uyarır', () => {
    const r = defer('kirayı erteledim');
    expect(r.date).toBeNull();
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('diğer niyetler', () => {
  it('ödendi işaretleme', () => {
    const r = parseCommand('ziraat kartını ödedim', TODAY);
    expect(r.intent).toBe('markPaid');
    if (r.intent === 'markPaid') {
      expect(r.query.toLocaleLowerCase('tr')).toContain('ziraat');
      expect(r.date).toBe(TODAY);
    }
  });

  it('kısmi tutarla ödendi', () => {
    const r = parseCommand('kirayı ödedim 12.000 TL', TODAY);
    expect(r.intent).toBe('markPaid');
    if (r.intent === 'markPaid') expect(r.amount).toBe(12000);
  });

  it('silme', () => {
    const r = parseCommand('kira kaydını sil', TODAY);
    expect(r.intent).toBe('delete');
    if (r.intent === 'delete') expect(r.query.toLocaleLowerCase('tr')).toContain('kira');
  });

  it('gönderme — kişi adıyla', () => {
    const r = parseCommand("bugünün ödeme listesini Ahmet'e yolla", TODAY);
    expect(r.intent).toBe('send');
    if (r.intent === 'send') {
      expect(r.recipient.toLocaleLowerCase('tr')).toBe('ahmet');
      expect(r.date).toBe(TODAY);
    }
  });

  it('gönderme — yarının listesi', () => {
    const r = parseCommand('yarınki listeyi pdf olarak gönder', TODAY);
    expect(r.intent).toBe('send');
    if (r.intent === 'send') expect(r.date).toBe('2026-09-13');
  });

  it('listeleme', () => {
    const r = parseCommand('bugün ne var', TODAY);
    expect(r.intent).toBe('list');
    if (r.intent === 'list') expect(r.date).toBe(TODAY);
  });

  it('okuma', () => {
    const r = parseCommand('bugünün listesini oku', TODAY);
    expect(['list', 'send']).toContain(r.intent);
  });

  it('ödemedim ile ödedim karışmaz', () => {
    expect(parseCommand('kirayı ödemedim yarına at', TODAY).intent).toBe('defer');
    expect(parseCommand('kirayı ödedim', TODAY).intent).toBe('markPaid');
  });
});
