/**
 * Sesli okuma (Türkçe).
 *
 * Tarayıcı ve Electron: Web Speech API.
 * Android: TextToSpeech eklentisi — Android WebView'da `speechSynthesis`
 *   nesnesi **yoktur**, bu yüzden telefonda web yolu sessizce hiçbir şey
 *   yapmıyordu. Cihazın kendi TTS servisi eklenti üzerinden çağrılır.
 *
 * İki yol da aynı arayüzü sunar; ekranlar hangisinin çalıştığını bilmez.
 */
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { platformKind } from './platform';

let cachedVoice: SpeechSynthesisVoice | null | undefined;

function isAndroid(): boolean {
  return platformKind() === 'android';
}

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
  return isAndroid() || typeof speechSynthesis !== 'undefined';
}

/** Metni sesli okur. Önceki okuma varsa keser. */
export function speak(text: string, opts: { rate?: number } = {}): void {
  if (!text.trim()) return;

  if (isAndroid()) {
    void (async () => {
      try {
        await TextToSpeech.stop();
        await TextToSpeech.speak({
          text,
          lang: 'tr-TR',
          rate: opts.rate ?? 1,
          pitch: 1,
          volume: 1,
          category: 'playback',
        });
      } catch {
        // Cihazda Türkçe TTS verisi yoksa sessizce geçilir; ekrandaki
        // yazılı liste zaten aynı bilgiyi veriyor.
      }
    })();
    return;
  }

  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'tr-TR';
  utterance.rate = opts.rate ?? 1;
  const voice = turkishVoice();
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (isAndroid()) {
    void TextToSpeech.stop().catch(() => undefined);
    return;
  }
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

/** Sesler geç yüklenir; hazır olduğunda önbelleği tazeler. */
export function warmUpVoices(): void {
  if (isAndroid() || typeof speechSynthesis === 'undefined') return;
  cachedVoice = undefined;
  speechSynthesis.getVoices();
  speechSynthesis.addEventListener?.('voiceschanged', () => {
    cachedVoice = undefined;
  });
}
