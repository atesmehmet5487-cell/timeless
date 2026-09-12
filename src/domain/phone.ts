/** Telefon numarası biçimlendirme — WhatsApp bağlantıları için. */
import type { Contact } from './types';

/**
 * Türkiye numaralarını wa.me biçimine çevirir.
 * "0555 111 22 33" → "905551112233", "+90 555..." → "905551112233"
 */
export function normalizePhone(raw: string, countryCode = '90'): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith(countryCode) && digits.length > 10) return digits;
  if (digits.startsWith('0')) return countryCode + digits.slice(1);
  return countryCode + digits;
}

/** Okunabilir biçim: "0555 111 22 33" */
export function formatPhoneTR(raw: string): string {
  const digits = normalizePhone(raw).replace(/^90/, '');
  if (digits.length !== 10) return raw;
  return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`;
}

/** wa.me bağlantısı — kişi verilmezse WhatsApp sohbet seçiciyi açar. */
export function whatsappUrl(text: string, contact?: Contact): string {
  const encoded = encodeURIComponent(text);
  return contact
    ? `https://wa.me/${normalizePhone(contact.phone)}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}
