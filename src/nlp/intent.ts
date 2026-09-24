/** Komutun ne yapmak istediğini bulur. */
import { re, word } from './boundary';

export type Intent = 'add' | 'defer' | 'markPaid' | 'delete' | 'send' | 'list';

export interface IntentMatch {
  intent: Intent;
  /** Metinde niyeti belli eden parça — başlık çıkarılırken silinir. */
  matched: string;
  /** 0-1: kalıp ne kadar belirgin eşleşti. */
  strength: number;
}

/**
 * Sıra önemlidir. "bugün ödemedim, 20'sine yaz" cümlesinde hem erteleme hem
 * "yaz" geçer; erteleme kalıbı önce denendiği için doğru sonuç çıkar.
 */
const PATTERNS: { intent: Intent; pattern: RegExp; strength: number }[] = [
  // Gönderme
  { intent: 'send', pattern: re(word('yolla\\w*|yollar\\w*|g[öo]nder\\w*|payla[şs]\\w*|ilet\\w*')), strength: 0.9 },
  { intent: 'send', pattern: re(word('pdf')), strength: 0.6 },

  // Silme
  { intent: 'delete', pattern: re(word('sil|siler|silelim|silsene|kaldır\\w*|iptal|temizle\\w*')), strength: 0.9 },

  // Erteleme — "ödemedim" en güçlü sinyal
  { intent: 'defer', pattern: re(word('[öo]de(?:me|ye)dim')), strength: 0.95 },
  { intent: 'defer', pattern: re(word('ertele\\w*|erteler\\w*|ertelendi')), strength: 0.95 },
  { intent: 'defer', pattern: re(word('kaydır\\w*|ta[şs]ı|ta[şs]ır\\w*|[öo]telendi')), strength: 0.85 },
  { intent: 'defer', pattern: re(word('yapamadım|yeti[şs]medi')), strength: 0.8 },
  { intent: 'defer', pattern: re(word('sonraya')), strength: 0.7 },

  // Ödendi
  { intent: 'markPaid', pattern: re(word('[öo]dedim|[öo]dedik|[öo]dendi|yatırdım|[öo]denmi[şs]')), strength: 0.95 },
  { intent: 'markPaid', pattern: re('havale\\s+ettim|eft\\s+ettim|yaptım|tamamdır|halloldu'), strength: 0.8 },

  // Listeleme / okuma
  { intent: 'list', pattern: re('ne\\s+var|neler\\s+var|ne\\s+kadar'), strength: 0.8 },
  { intent: 'list', pattern: re(word('listele\\w*|g[öo]ster\\w*|oku|okur\\w*|okusana')), strength: 0.8 },
  { intent: 'list', pattern: re(word('liste|listesi|listeyi|listemi')), strength: 0.6 },
];

export function detectIntent(text: string): IntentMatch {
  for (const { intent, pattern, strength } of PATTERNS) {
    const match = pattern.exec(text);
    if (match) return { intent, matched: match[0], strength };
  }
  return { intent: 'add', matched: '', strength: 0.5 };
}
