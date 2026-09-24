/**
 * Excel çıktısının gerçekten üretildiğini ve doğru içeriği taşıdığını denetler.
 * .xlsx bir ZIP arşividir; burada açıp içindeki metinlere bakıyoruz.
 */
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { planToDoc, statsToDoc } from '../domain/doc';
import { createPayment } from '../domain/payment';
import { buildReport } from '../domain/report';
import { dayPlan } from '../domain/schedule';
import { summarizePeriod } from '../domain/stats';
import type { Payment } from '../domain/types';
import { createExcelBlob, excelFileName } from './excel';

const TODAY = '2026-09-15';

function payment(title: string, amount: number, category: string, day: number): Payment {
  return createPayment({
    title,
    amount,
    category,
    recurrence: { type: 'monthly', day, from: '2026-09-01' },
  });
}

/** Arşivdeki dosyaları açar; metin içerenleri döndürür. */
function readArchive(buffer: ArrayBuffer): string {
  const buf = Buffer.from(buffer);
  let text = '';
  let offset = 0;
  while (offset < buf.length - 4) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) {
      offset++;
      continue;
    }
    const method = buf.readUInt16LE(offset + 8);
    const size = buf.readUInt32LE(offset + 18);
    const nameLength = buf.readUInt16LE(offset + 26);
    const extraLength = buf.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLength + extraLength;
    const data = buf.subarray(start, start + size);
    try {
      text += method === 8 ? inflateRawSync(data).toString('utf8') : data.toString('utf8');
    } catch {
      /* ikili akış */
    }
    offset = start + size;
  }
  return text;
}

async function contentsOf(doc: Parameters<typeof createExcelBlob>[0]): Promise<string> {
  const blob = await createExcelBlob(doc);
  expect(blob.size).toBeGreaterThan(1000);
  return readArchive(await blob.arrayBuffer());
}

describe('günlük plan Excel çıktısı', () => {
  const plan = dayPlan([payment('Ziraat kart ödemesi', 8400, 'kart', 15)], [], TODAY, TODAY);
  const doc = planToDoc(buildReport(plan, TODAY, 'Mehmet Ateş'));

  it('dosya adı günün tarihini taşır', () => {
    expect(excelFileName(doc)).toBe('odeme-listesi-2026-09-15.xlsx');
  });

  it('başlık, sütunlar ve kayıt içeride', async () => {
    const xml = await contentsOf(doc);
    expect(xml).toContain('MEHMET ATEŞ · 15 EYLÜL 2026 ÖDEME PLANI');
    expect(xml).toContain('KATEGORİ');
    expect(xml).toContain('Ziraat kart ödemesi');
    expect(xml).toContain('ÖDENECEK TOPLAM');
  });

  it('tutar metin değil sayı olarak yazılır', async () => {
    const xml = await contentsOf(doc);
    // Sayı hücreleri <v>8400</v> biçiminde; metin olsaydı paylaşılan dizede olurdu
    expect(xml).toContain('<v>8400</v>');
    expect(xml).toContain('#,##0.00');
  });

  it('yeşil başlık dolgusu kullanılır', async () => {
    const xml = await contentsOf(doc);
    expect(xml.toUpperCase()).toContain('FF92D050');
  });

  it('not yoksa NOT sütunu eklenmez', () => {
    expect(doc.columns.map((c) => c.label)).not.toContain('NOT');
  });

  it('kayda yazılan not NOT sütununda görünür', async () => {
    const withNote = { ...payment('Aserva cari', 2500, 'cari', 15), note: 'Fatura no 1234' };
    const noted = planToDoc(buildReport(dayPlan([withNote], [], TODAY, TODAY), TODAY));
    const labels = noted.columns.map((c) => c.label);
    expect(labels).toContain('NOT');
    expect(noted.rows[0][labels.indexOf('NOT')].text).toBe('Fatura no 1234');
    expect(await contentsOf(noted)).toContain('Fatura no 1234');
  });
});

describe('gider tablosu Excel çıktısı', () => {
  const payments = [
    payment('Elektrik', 2000, 'fatura', 10),
    payment('Ziraat kart', 8400, 'kart', 15),
    payment('Aserva cari', 2500, 'cari', 20),
  ];
  const stats = summarizePeriod(payments, [], 'month', TODAY, { today: TODAY });
  const doc = statsToDoc(stats, 'Mehmet Ateş', TODAY);

  it('dosya adı dönemi taşır', () => {
    expect(excelFileName(doc)).toBe('gider-tablosu-2026-09-01_2026-09-30.xlsx');
  });

  it('başlık gider tablosunu söyler', async () => {
    const xml = await contentsOf(doc);
    expect(xml).toContain('MEHMET ATEŞ · EYLÜL 2026 GİDER TABLOSU');
  });

  it('kategori satırları ve toplamlar içeride', async () => {
    const xml = await contentsOf(doc);
    expect(xml).toContain('Kredi Kartı');
    expect(xml).toContain('Cari Hesap');
    expect(xml).toContain('Fatura');
    expect(xml).toContain('DÖNEM TOPLAMI');
    expect(xml).toContain('<v>12900</v>'); // 2000 + 8400 + 2500
  });

  it('pay sütunu oran olarak yazılır, yüzde biçimiyle gösterilir', async () => {
    const xml = await contentsOf(doc);
    // 8400 / 12900 — hücrede oran durur
    expect(xml).toContain('0.6511627906976745');
    // Excel'in yerleşik yüzde biçimi 9 numaralıdır (formatCode yazılmaz)
    expect(xml).toContain('numFmtId="9"');
  });
});
