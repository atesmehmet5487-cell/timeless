/**
 * IBAN biçimlendirme ve doğrulama.
 *
 * Alan zorunlu değil: boş bırakılabilir, hatalı yazılmış olsa bile kayıt
 * engellenmez — yalnızca uyarı gösterilir. Amaç ödeme anında numarayı elde
 * hazır bulundurmak, muhasebe denetimi yapmak değil.
 */

/** Boşlukları ve noktalama işaretlerini atar, büyük harfe çevirir. */
export function normalizeIban(raw: string): string {
  return raw.replace(/[\s.\-_]/g, '').toUpperCase();
}

/** "TR12 3456 7890 1234 5678 9012 34" — dörtlü gruplar hâlinde. */
export function formatIban(raw: string): string {
  const clean = normalizeIban(raw);
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

/** Türkiye IBAN'ı 26 karakterdir: TR + 24 rakam. */
export function isTurkishIbanShape(raw: string): boolean {
  return /^TR\d{24}$/.test(normalizeIban(raw));
}

/**
 * IBAN sağlama toplamı (ISO 13616 / mod-97).
 * İlk dört karakter sona alınır, harfler sayıya çevrilir, kalan 1 olmalıdır.
 */
export function isValidIban(raw: string): boolean {
  const clean = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(clean)) return false;

  const rearranged = clean.slice(4) + clean.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));

  // Sayı 2^53'ü aştığı için parça parça mod alınır
  let remainder = 0;
  for (const digit of digits) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export type IbanCheck = { state: 'empty' | 'valid' | 'suspicious'; message?: string };

/** Kullanıcıya gösterilecek yumuşak geri bildirim. */
export function checkIban(raw: string): IbanCheck {
  const clean = normalizeIban(raw);
  if (!clean) return { state: 'empty' };
  if (isValidIban(clean)) return { state: 'valid' };
  if (clean.startsWith('TR') && !isTurkishIbanShape(clean)) {
    return {
      state: 'suspicious',
      message: `Türkiye IBAN'ı 26 karakter olmalı (şu an ${clean.length}). Yine de kaydedebilirsin.`,
    };
  }
  return { state: 'suspicious', message: 'IBAN doğrulanamadı. Yine de kaydedebilirsin.' };
}
