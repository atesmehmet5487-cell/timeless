/** Tutar, para birimi, kategori ve başlık çıkarımı. */
import { parseMoney } from '../domain/money';
import { B, re } from './boundary';
import type { BuiltinCategory } from '../domain/category';
import type { Currency } from '../domain/types';

export interface AmountMatch {
  amount: number;
  currency?: Currency;
  matched: string;
}

const CURRENCY_WORDS: [RegExp, Currency][] = [
  [/^(tl|lira|liraya|lirayı|₺|try|turk lirası|türk lirası)$/, 'TRY'],
  [/^(dolar|dolara|doları|\$|usd)$/, 'USD'],
  [/^(euro|avro|euroya|€|eur)$/, 'EUR'],
];

const CURRENCY_RE =
  'tl|lira|liraya|lirayı|liralık|₺|try|dolar|dolara|doları|\\$|usd|euro|avro|euroya|€|eur';
const AMOUNT_RE = re(`${B}(\\d[\\d.,]*)\\s*(${CURRENCY_RE})?`, 'g');

/** Birimi yazılmamış sayılar ancak bu eşikten büyükse tutar sayılır. */
const BARE_AMOUNT_MIN = 100;

/**
 * Metindeki tutarı bulur. Tarih ifadesi önceden çıkarılmış olmalıdır,
 * aksi hâlde "15 ekim" gibi bir parçadaki sayı tutar sanılabilir.
 */
export function extractAmount(text: string): AmountMatch | null {
  AMOUNT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = AMOUNT_RE.exec(text))) {
    const raw = match[1];
    const unit = match[2];
    const value = parseMoney(raw);
    if (value === null || value === 0) continue;
    if (!unit && value < BARE_AMOUNT_MIN) continue;

    const currency = unit
      ? CURRENCY_WORDS.find(([pattern]) => pattern.test(unit))?.[1]
      : undefined;
    return { amount: value, currency, matched: match[0].trim() };
  }
  return null;
}

const CATEGORY_KEYWORDS: [BuiltinCategory, string[]][] = [
  ['kart', ['kart', 'kredi kartı', 'kredikartı', 'visa', 'mastercard', 'ekstre']],
  ['cari', ['cari', 'tedarikçi', 'tedarikci', 'müşteri', 'musteri', 'bayi', 'firma', 'esnaf']],
  ['maas', ['maaş', 'maas', 'ücret', 'personel', 'bordro']],
  ['kira', ['kira', 'kiracı', 'kirası']],
  ['fatura', ['fatura', 'elektrik', 'su', 'doğalgaz', 'dogalgaz', 'internet', 'telefon', 'aidat']],
  ['vergi', ['vergi', 'kdv', 'muhtasar', 'stopaj', 'mtv', 'beyanname', 'harç']],
  ['sigorta', ['sigorta', 'kasko', 'dask', 'bes', 'poliçe', 'police', 'sgk']],
  ['taksit', ['taksit', 'senet']],
  ['kredi', ['kredi', 'borç', 'borc', 'banka']],
];

/** Başlıktan kategori tahmin eder; emin değilse "diger". */
export function guessCategory(title: string): BuiltinCategory {
  const text = title.toLocaleLowerCase('tr');
  for (const [category, words] of CATEGORY_KEYWORDS) {
    if (words.some((w) => text.includes(w))) return category;
  }
  return 'diger';
}

/** Başlıkta işi olmayan dolgu kelimeleri. */
const FILLER_WORDS = new Set([
  'bir',
  've',
  'de',
  'da',
  'ile',
  'için',
  'icin',
  'lütfen',
  'lutfen',
  'ekle',
  'ekler',
  'eklermisin',
  'kaydet',
  'kaydeder',
  'yaz',
  'yazar',
  'not',
  'hatırlat',
  'hatirlat',
  'hatırlatır',
  'bana',
  'benim',
  'var',
  'olacak',
  'olsun',
  'tarihinde',
  'tarihli',
  'günü',
  'gunu',
  'saat',
  'ayarla',
  'kur',
  'mısın',
  'misin',
  'musun',
  'müsün',
]);

/**
 * Komut ve tarih parçaları silindikten sonra kalan metni başlığa çevirir.
 * İlk harf büyütülür, dolgu kelimeleri atılır.
 */
export function cleanTitle(rest: string): string {
  const words = rest
    .split(' ')
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !FILLER_WORDS.has(w));
  const title = words.join(' ').replace(/\s+/g, ' ').trim();
  if (!title) return '';
  return title.charAt(0).toLocaleUpperCase('tr') + title.slice(1);
}
