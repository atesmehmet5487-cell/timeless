/**
 * Konuşma tanıma (Türkçe).
 *
 * Tarayıcı ve Electron: Web Speech API (Chromium'da yerleşik).
 * Android: Capacitor SpeechRecognition eklentisi — WebView'da Web Speech API
 * bulunmadığı için telefonda tek çalışan yol bu.
 *
 * İki yol da aynı arayüzü sunar, ekranlar hangisinin çalıştığını bilmez.
 * Tanıma her cihazda kullanılabilir olmadığı için yazılı giriş her zaman açık.
 */
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { platformKind } from './platform';

export interface SpeechEvents {
  /** Konuşma sürerken gelen ara metin. */
  onPartial?: (text: string) => void;
  /** Tanıma bittiğinde son metin. */
  onResult: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<
    ArrayLike<{ transcript: string }> & { isFinal: boolean }
  >;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

function getConstructor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as RecognitionCtor | null;
}

/** Bu cihazda sesli giriş var mı? */
export function isSpeechSupported(): boolean {
  if (platformKind() === 'android') return true;
  return getConstructor() !== null;
}

export interface SpeechSession {
  stop(): void;
  cancel(): void;
}

/**
 * Android tarafı: izin istenir, dinleme başlar, ara sonuçlar aktarılır.
 * Eklenti sonucu dizi olarak verir; ilk seçenek en olasıdır.
 */
function startNative(events: SpeechEvents, lang: string): SpeechSession {
  let cancelled = false;
  let finished = false;

  const finish = (text: string) => {
    if (finished || cancelled) return;
    finished = true;
    events.onEnd?.();
    if (text.trim()) events.onResult(text.trim());
  };

  void (async () => {
    try {
      // Bazı telefonlarda (Google uygulaması kapalı/kaldırılmış) tanıma
      // servisi hiç yoktur. Bunu söylemezsek mikrofona basmak sessizce
      // hiçbir şey yapmış gibi görünür.
      const availability = await SpeechRecognition.available();
      if (availability?.available === false) {
        events.onError?.(
          'Bu telefonda konuşma tanıma servisi bulunamadı. Google uygulamasının kurulu ve açık olması gerekiyor — komutu yazabilirsin.',
        );
        events.onEnd?.();
        return;
      }

      const permission = await SpeechRecognition.checkPermissions();
      if (permission.speechRecognition !== 'granted') {
        const asked = await SpeechRecognition.requestPermissions();
        if (asked.speechRecognition !== 'granted') {
          events.onError?.('Mikrofon izni verilmedi.');
          events.onEnd?.();
          return;
        }
      }

      await SpeechRecognition.addListener('partialResults', (data: { matches: string[] }) => {
        const text = data.matches?.[0];
        if (text) events.onPartial?.(text);
      });

      const result = await SpeechRecognition.start({
        language: lang,
        maxResults: 1,
        partialResults: true,
        popup: false,
      });
      finish(result?.matches?.[0] ?? '');
    } catch (error) {
      events.onError?.(error instanceof Error ? error.message : 'Ses tanınamadı.');
      events.onEnd?.();
    } finally {
      void SpeechRecognition.removeAllListeners();
    }
  })();

  return {
    stop: () => void SpeechRecognition.stop(),
    cancel: () => {
      cancelled = true;
      void SpeechRecognition.stop();
    },
  };
}

/** Dinlemeyi başlatır. Döndürülen nesneyle durdurulabilir. */
export function startListening(events: SpeechEvents, lang = 'tr-TR'): SpeechSession | null {
  if (platformKind() === 'android') return startNative(events, lang);

  const Ctor = getConstructor();
  if (!Ctor) {
    events.onError?.('Bu cihazda sesli giriş desteklenmiyor.');
    return null;
  }

  const recognition = new Ctor();
  recognition.lang = lang;
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let finalText = '';
  let cancelled = false;

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0]?.transcript ?? '';
      if (result.isFinal) finalText += transcript;
      else interim += transcript;
    }
    if (interim) events.onPartial?.((finalText + interim).trim());
  };

  recognition.onerror = (event) => {
    const messages: Record<string, string> = {
      'no-speech': 'Ses alınamadı, tekrar dener misin?',
      'audio-capture': 'Mikrofon bulunamadı.',
      'not-allowed': 'Mikrofon izni verilmedi.',
      network: 'Ses tanıma için internet gerekiyor.',
    };
    events.onError?.(messages[event.error ?? ''] ?? 'Ses tanınamadı.');
  };

  recognition.onend = () => {
    events.onEnd?.();
    const text = finalText.trim();
    if (!cancelled && text) events.onResult(text);
  };

  recognition.start();

  return {
    stop: () => recognition.stop(),
    cancel: () => {
      cancelled = true;
      recognition.abort();
    },
  };
}
