/**
 * Türkçe metin normalizasyonu.
 *
 * Konuşma tanıma çıktısı düzensizdir: "Ayın 15'inde", "ayın onbeşinde",
 * "ayin 15 inde" hepsi aynı şeyi söyler. Buradaki işlem zinciri hepsini
 * aynı biçime indirger, sonraki adımlar sade metinle çalışır.
 */
import { B, E, re } from './boundary';

/** Türkçe küçük harf — I/İ ayrımı doğru yapılır. */
export function lower(text: string): string {
  return text.replace(/İ/g, 'i').replace(/I/g, 'ı').toLocaleLowerCase('tr');
}

/** Farklı kesme işaretlerini tek biçime indirger. */
function normalizeApostrophes(text: string): string {
  return text.replace(/[‘’ʼ`´]/g, "'");
}

const NUMBER_WORDS: Record<string, number> = {
  sıfır: 0,
  bir: 1,
  iki: 2,
  üç: 3,
  dört: 4,
  beş: 5,
  altı: 6,
  yedi: 7,
  sekiz: 8,
  dokuz: 9,
  on: 10,
  yirmi: 20,
  otuz: 30,
  kırk: 40,
  elli: 50,
  altmış: 60,
  yetmiş: 70,
  seksen: 80,
  doksan: 90,
  yüz: 100,
  bin: 1000,
  milyon: 1_000_000,
};

const ONES = 'bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz';
const TENS = 'on|yirmi|otuz|kırk|elli|altmış|yetmiş|seksen|doksan';
const ALL_NUMBER_WORDS = Object.keys(NUMBER_WORDS).join('|');

/** Sayıya yapışan iyelik/hâl ekleri: "15'inde", "beşinde", "16sında". */
const SUFFIXES =
  'sinde|sında|sunda|sünde|sine|sına|suna|süne|inde|ında|unda|ünde|ine|ına|une|üne|' +
  'inci|ıncı|uncu|üncü|si|sı|su|sü|de|da|te|ta|i|ı|u|ü|e|a';

/** Bitişik yazılan onluklar: "onbeş", "yirmibir". */
const GLUED = re(`${B}(${TENS})(${ONES})`, 'g');
/** Sayı kelimesine yapışık ek: "beşinde" → "beş inde". */
const WORD_SUFFIX = re(`${B}(${ALL_NUMBER_WORDS})(${SUFFIXES})${E}`, 'g');
/** Rakama yapışık ek: "15'inde" / "16sında" → "15 inde". */
const DIGIT_APOSTROPHE = /(\d+)'\s*([a-zçğıöşü]+)/g;
const DIGIT_SUFFIX = re(`(\\d+)(${SUFFIXES})${E}`, 'g');

export function isNumberWord(word: string): boolean {
  return word in NUMBER_WORDS;
}

/**
 * Ardışık sayı kelimelerini tek sayıya çevirir.
 * "bin beş yüz" → 1500, "kırk beş bin" → 45000, "on beş" → 15
 */
export function wordsToNumber(words: string[]): number | null {
  if (words.length === 0 || !words.every(isNumberWord)) return null;
  let total = 0;
  let current = 0;
  for (const w of words) {
    const value = NUMBER_WORDS[w];
    if (value === 100) current = (current || 1) * 100;
    else if (value === 1000 || value === 1_000_000) {
      total += (current || 1) * value;
      current = 0;
    } else current += value;
  }
  return total + current;
}

/**
 * Metindeki sayı kelimesi öbeklerini rakama çevirir.
 * Tek başına duran "bir" sayı değil, belirteç kabul edilir ("bir ödeme ekle").
 */
export function digitizeNumberWords(text: string): string {
  const tokens = text.split(' ');
  const out: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    const isLoneBir = buffer.length === 1 && buffer[0] === 'bir';
    const value = isLoneBir ? null : wordsToNumber(buffer);
    out.push(value === null ? buffer.join(' ') : String(value));
    buffer = [];
  };

  for (const token of tokens) {
    if (isNumberWord(token)) buffer.push(token);
    else {
      flush();
      out.push(token);
    }
  }
  flush();
  return out.join(' ');
}

/** Sayılara yapışmış ekleri ayırır; ek metni tarih kalıpları için gerekli. */
export function splitNumberSuffixes(text: string): string {
  return text
    .replace(GLUED, '$1 $2')
    .replace(WORD_SUFFIX, '$1 $2')
    .replace(DIGIT_APOSTROPHE, '$1 $2')
    .replace(DIGIT_SUFFIX, '$1 $2');
}

/** Sonraki adımların beklediği sade biçim. */
export function normalize(raw: string): string {
  let text = normalizeApostrophes(raw);
  text = lower(text);
  // Tutarlardaki ayırıcılar korunur, diğer noktalama boşluğa çevrilir
  text = text.replace(/[?!;:()[\]{}"“”]/g, ' ');
  text = text.replace(/,(?!\d)/g, ' ');
  text = text.replace(/\.(?!\d)/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  text = splitNumberSuffixes(text);
  text = digitizeNumberWords(text);
  return text.replace(/\s+/g, ' ').trim();
}

/** Kelime listesi. */
export function tokenize(text: string): string[] {
  return text.split(' ').filter(Boolean);
}

/** Türkçe ekleri kabaca atarak kök benzeri bir biçim üretir (eşleştirme için). */
export function stem(word: string): string {
  return word.replace(
    /(larını|lerini|ların|lerin|ları|leri|lara|lere|sını|sini|nın|nin|nun|nün|ını|ini|unu|ünü|ya|ye|na|ne|dan|den|tan|ten|da|de|ta|te|ı|i|u|ü|a|e)$/,
    '',
  );
}
