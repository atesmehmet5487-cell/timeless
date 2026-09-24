import { describe, expect, it } from 'vitest';
import {
  categoryLabel,
  categoryOptions,
  makeCategoryId,
  removeCategory,
  renameCategory,
  resolveCategory,
} from './category';
import { checkIban, formatIban, isTurkishIbanShape, isValidIban, normalizeIban } from './iban';

describe('IBAN biçimi', () => {
  it('boşluk ve işaretleri temizler', () => {
    expect(normalizeIban('TR33 0006 1005 1978 6457 8413 26')).toBe(
      'TR330006100519786457841326',
    );
    expect(normalizeIban('tr33-0006.1005')).toBe('TR3300061005');
  });

  it('dörtlü gruplar hâlinde yazar', () => {
    expect(formatIban('TR330006100519786457841326')).toBe(
      'TR33 0006 1005 1978 6457 8413 26',
    );
  });

  it('Türkiye IBAN uzunluğunu bilir', () => {
    expect(isTurkishIbanShape('TR330006100519786457841326')).toBe(true);
    expect(isTurkishIbanShape('TR3300061005')).toBe(false);
  });
});

describe('IBAN doğrulama', () => {
  it('geçerli IBAN’ı kabul eder', () => {
    // ISO 13616 örnek numaraları
    expect(isValidIban('TR330006100519786457841326')).toBe(true);
    expect(isValidIban('GB82 WEST 1234 5698 7654 32')).toBe(true);
    expect(isValidIban('DE89370400440532013000')).toBe(true);
  });

  it('rakamı değişmiş IBAN’ı reddeder', () => {
    expect(isValidIban('TR330006100519786457841327')).toBe(false);
    expect(isValidIban('GB82 WEST 1234 5698 7654 33')).toBe(false);
  });

  it('biçimi bozuk metni reddeder', () => {
    expect(isValidIban('merhaba')).toBe(false);
    expect(isValidIban('')).toBe(false);
  });
});

describe('IBAN geri bildirimi', () => {
  it('boş alan uyarı vermez — alan zorunlu değil', () => {
    expect(checkIban('').state).toBe('empty');
    expect(checkIban('   ').state).toBe('empty');
  });

  it('geçerli IBAN’ı onaylar', () => {
    expect(checkIban('TR33 0006 1005 1978 6457 8413 26').state).toBe('valid');
  });

  it('eksik Türkiye IBAN’ında uzunluğu söyler ama engellemez', () => {
    const result = checkIban('TR3300061005');
    expect(result.state).toBe('suspicious');
    expect(result.message).toContain('26 karakter');
  });
});

describe('kategoriler', () => {
  it('yerleşik kategorilerin adını verir', () => {
    expect(categoryLabel('cari')).toBe('Cari Hesap');
    expect(categoryLabel('kart')).toBe('Kredi Kartı');
  });

  it('özel kategoriyi listeden çözer', () => {
    const customCategories = [{ id: 'ozel-nakliye-1a2b', label: 'Nakliye' }];
    expect(categoryLabel('ozel-nakliye-1a2b', { customCategories })).toBe('Nakliye');
  });

  it('silinmiş özel kategori "Diğer" olarak görünür', () => {
    expect(categoryLabel('ozel-yok-9999', { customCategories: [] })).toBe('Diğer');
  });

  it('yerleşik kategorinin adı değiştirilebilir, boş ad özgün ada döner', () => {
    const renamed = renameCategory({}, 'cari', 'Tedarikçiler');
    expect(categoryLabel('cari', renamed)).toBe('Tedarikçiler');
    expect(categoryOptions(renamed).find((o) => o.id === 'cari')?.label).toBe('Tedarikçiler');
    expect(categoryLabel('cari', renameCategory(renamed, 'cari', '  '))).toBe('Cari Hesap');
  });

  it('özel kategorinin adı değiştirilir, kimliği aynı kalır', () => {
    const settings = { customCategories: [{ id: 'ozel-car-1', label: 'Car' }] };
    const renamed = renameCategory(settings, 'ozel-car-1', 'Araç');
    expect(renamed.customCategories).toEqual([{ id: 'ozel-car-1', label: 'Araç' }]);
  });

  it('silinen yerleşik kategori listeden çıkar, kayıtları "Diğer" görünür', () => {
    const settings = removeCategory({}, 'kira');
    expect(categoryOptions(settings).map((o) => o.id)).not.toContain('kira');
    expect(categoryLabel('kira', settings)).toBe('Diğer');
    expect(resolveCategory('kira', settings)).toBe('diger');
  });

  it('"Diğer" silinemez', () => {
    const settings = removeCategory({}, 'diger');
    expect(categoryOptions(settings).map((o) => o.id)).toContain('diger');
  });

  it('silinen özel kategori listeden çıkar', () => {
    const settings = removeCategory(
      { customCategories: [{ id: 'ozel-car-1', label: 'Car' }] },
      'ozel-car-1',
    );
    expect(settings.customCategories).toEqual([]);
    expect(categoryLabel('ozel-car-1', settings)).toBe('Diğer');
  });

  it('kimlik üretirken Türkçe harfleri sadeleştirir', () => {
    const id = makeCategoryId('Şirket Gideri');
    expect(id.startsWith('ozel-sirket-gideri-')).toBe(true);
  });

  it('seçenek listesi yerleşiklerle başlar, özeller sonda gelir', () => {
    const options = categoryOptions({ customCategories: [{ id: 'ozel-x-1', label: 'Nakliye' }] });
    expect(options[0].id).toBe('kart');
    expect(options[1].id).toBe('cari');
    expect(options[options.length - 1]).toEqual({
      id: 'ozel-x-1',
      label: 'Nakliye',
      custom: true,
    });
  });
});
