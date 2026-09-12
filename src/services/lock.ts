/**
 * PIN kilidi.
 *
 * Ekranda maaş, borç ve hesap numaraları duruyor; uygulamayı açan herkesin
 * bunları görmesi gerekmez. PIN düz metin olarak saklanmaz — SHA-256 özeti
 * tutulur, doğrulama özetler karşılaştırılarak yapılır.
 *
 * Bu bir şifreleme değil: veri dosyası hâlâ okunabilir. Amaç, cihazı eline
 * alan birinin uygulamayı açıp listeye bakmasını engellemek.
 */

const PIN_LENGTH = 4;

export function isValidPinShape(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export const PIN_DIGITS = PIN_LENGTH;

/** SHA-256 özeti — onaltılık metin. */
export async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(`timeless:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPin(pin: string, hash: string | undefined): Promise<boolean> {
  if (!hash) return true;
  return (await hashPin(pin)) === hash;
}
