/**
 * Türkçe için kelime sınırı.
 *
 * JS'in \b sınırı ASCII tabanlıdır: "ödedim" kelimesinin başındaki ö harfi
 * "word char" sayılmadığı için /\bödedim\b/ hiç eşleşmez. Unicode harf/rakam
 * sınıfına bakan kendi sınırımızı kullanıyoruz.
 *
 * Dikkat: bu değerler RegExp'e metin olarak verilir, bu yüzden ters bölüler
 * kaynakta çift yazılır (`\\p{L}` → regex'te `\p{L}`).
 */

/** Kelime başı. */
export const B = '(?<![\\p{L}\\p{N}])';
/** Kelime sonu. */
export const E = '(?![\\p{L}\\p{N}])';

/** Unicode sınırlı, Türkçe uyumlu regex kurar. */
export function re(source: string, flags = ''): RegExp {
  return new RegExp(source, flags.includes('u') ? flags : flags + 'u');
}

/** `source`'u kelime sınırlarıyla sarar. */
export function word(source: string): string {
  return `${B}(?:${source})${E}`;
}
