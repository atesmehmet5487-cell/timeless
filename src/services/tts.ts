/**
 * Sesli okuma (Türkçe).
 * Web Speech API hem tarayıcıda hem Electron'da hem Android WebView'da çalışır.
 */

let cachedVoice: SpeechSynthesisVoice | null | undefined;

function turkishVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;
  if (typeof speechSynthesis === 'undefined') return (cachedVoice = null);
  const voices = speechSynthesis.getVoices();
  cachedVoice =
    voices.find((v) => v.lang?.toLowerCase().startsWith('tr')) ??
    voices.find((v) => v.name?.toLowerCase().includes('turk')) ??
    null;
  return cachedVoice;
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof speechSynthesis !== 'undefined';
}

/** Metni sesli okur. Önceki okuma varsa keser. */
export function speak(text: string, opts: { rate?: number } = {}): void {
  if (!isSpeechSynthesisSupported() || !text.trim()) return;
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'tr-TR';
  utterance.rate = opts.rate ?? 1;
  const voice = turkishVoice();
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) speechSynthesis.cancel();
}

/** Sesler geç yüklenir; hazır olduğunda önbelleği tazeler. */
export function warmUpVoices(): void {
  if (!isSpeechSynthesisSupported()) return;
  cachedVoice = undefined;
  speechSynthesis.getVoices();
  speechSynthesis.addEventListener?.('voiceschanged', () => {
    cachedVoice = undefined;
  });
}
