/**
 * Timeless çekirdek veri modeli.
 * Bu dosyadaki hiçbir şey tarayıcıya/Electron'a bağlı değildir — saf TypeScript.
 *
 * Tarihler her yerde "YYYY-AA-GG" biçiminde yerel gün olarak tutulur (ISODate).
 * Kasıtlı olarak Date/UTC kullanılmaz: "ayın 15'i" saat dilimi kaymasından
 * etkilenmemeli.
 */

import type { Category, CustomCategory } from './category';

/** Yerel takvim günü, "2026-09-15" biçiminde. */
export type ISODate = string;

/** Günün saati, "09:00" biçiminde (24 saat). */
export type HHMM = string;

export type Currency = 'TRY' | 'USD' | 'EUR';

export type { Category, CustomCategory } from './category';

/** Pazartesi = 1 ... Pazar = 7 (ISO-8601). */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Recurrence =
  | { type: 'once'; date: ISODate }
  /** Her ayın belirli günü. day = 31 ise "ayın son günü" anlamına gelir. */
  | { type: 'monthly'; day: number; from: ISODate; ends?: RecurrenceEnd }
  | { type: 'weekly'; weekday: Weekday; from: ISODate; ends?: RecurrenceEnd }
  | { type: 'yearly'; month: number; day: number; from: ISODate; ends?: RecurrenceEnd }
  | { type: 'everyNDays'; interval: number; from: ISODate; ends?: RecurrenceEnd };

export type RecurrenceEnd =
  | { kind: 'never' }
  | { kind: 'onDate'; date: ISODate }
  | { kind: 'afterCount'; count: number };

/** Ayın 31'i gibi bir gün o ayda yoksa ne yapılacağı. */
export type MonthEndPolicy = 'clampToLastDay' | 'skip';

/** Ödeme hafta sonuna denk gelirse ne yapılacağı. */
export type WeekendPolicy = 'none' | 'previousWorkday' | 'nextWorkday';

/**
 * Bir "seri": tek seferlik ya da tekrarlayan ödeme tanımı.
 * Tek tek günler burada tutulmaz, `recurrence`'tan hesaplanır.
 */
export interface Payment {
  id: string;
  title: string;
  amount?: number;
  currency: Currency;
  category: Category;
  /** Ödemenin yapılacağı hesap — zorunlu değil. */
  iban?: string;
  note?: string;
  recurrence: Recurrence;
  monthEndPolicy: MonthEndPolicy;
  weekendPolicy: WeekendPolicy;
  /** Günlük özet dışında bu kalem için ek hatırlatma saati. */
  remindAt?: HHMM;
  /** Kaç gün önceden de hatırlatılsın (0 = sadece o gün). */
  remindDaysBefore: number;
  createdAt: string;
  updatedAt: string;
  /** Dolu ise seri artık listelerde görünmez (arşiv). */
  archivedAt?: string;
  /** Dolu ise çöp kutusunda; 30 gün sonra kalıcı silinir. */
  deletedAt?: string;
}

export type OccurrenceStatus = 'pending' | 'paid' | 'deferred' | 'skipped';

/**
 * Bir serinin TEK bir örneğine yapılan müdahale.
 * Seriyi bozmaz: "bu ayın 15'ini 20'sine al" gelecek ayları etkilemez.
 */
export interface Override {
  id: string;
  paymentId: string;
  /** Serinin ürettiği özgün tarih — kaydın kimliği budur. */
  originalDate: ISODate;
  status: OccurrenceStatus;
  /** status === 'deferred' ise taşındığı gün. */
  deferredTo?: ISODate;
  paidAt?: string;
  paidAmount?: number;
  note?: string;
  updatedAt: string;
}

/** Bir günün listesinde görünen tek satır: seri + tarih + durum. */
export interface Occurrence {
  paymentId: string;
  payment: Payment;
  /** Serinin ürettiği özgün tarih (override anahtarı). */
  originalDate: ISODate;
  /** Ekranda göründüğü tarih — erteleme varsa taşınan gün. */
  date: ISODate;
  status: OccurrenceStatus;
  /** Bu örnek başka bir günden ertelenerek buraya geldiyse true. */
  movedFrom?: ISODate;
  /** Ödenmemiş ve tarihi geçmiş. */
  overdue: boolean;
  override?: Override;
}

export interface Contact {
  id: string;
  name: string;
  /** Sadece rakam, ülke kodu dahil: "905551112233". */
  phone: string;
  createdAt: string;
}

/** Uygulama rengi — Ayarlar'dan seçilir. */
export type AccentName = 'mavi' | 'yesil' | 'mor' | 'turuncu' | 'turkuaz' | 'kiraz';

/** Açık/koyu tercihi; 'system' cihaz ayarını izler. */
export type ThemeMode = 'system' | 'light' | 'dark';

export const ACCENTS: { name: AccentName; label: string; swatch: string }[] = [
  { name: 'mavi', label: 'Mavi', swatch: '#2f6bff' },
  { name: 'yesil', label: 'Yeşil', swatch: '#12a150' },
  { name: 'mor', label: 'Mor', swatch: '#7c5cff' },
  { name: 'turuncu', label: 'Turuncu', swatch: '#ef7611' },
  { name: 'turkuaz', label: 'Turkuaz', swatch: '#0d9488' },
  { name: 'kiraz', label: 'Kiraz', swatch: '#e11d48' },
];

export interface Settings {
  /** Günlük özet bildiriminin saati. */
  dailySummaryAt: HHMM;
  dailySummaryEnabled: boolean;
  /** Akşam "işaretledin mi?" kontrolü. */
  eveningCheckAt: HHMM;
  eveningCheckEnabled: boolean;
  defaultCurrency: Currency;
  defaultWeekendPolicy: WeekendPolicy;
  defaultMonthEndPolicy: MonthEndPolicy;
  ttsEnabled: boolean;
  pinHash?: string;
  lastBackupAt?: string;
  theme: ThemeMode;
  accent: AccentName;
  /** Kullanıcının eklediği kategoriler. */
  customCategories: CustomCategory[];
  /** Yerleşik kategorilere verilen yeni adlar: { cari: 'Tedarikçiler' }. */
  categoryNames: Record<string, string>;
  /** Silinen yerleşik kategoriler. */
  hiddenCategories: string[];
  /**
   * PDF/Excel başlığında görünen ad: "MEHMET ATEŞ · 12 EYLÜL 2026 ÖDEME PLANI".
   * Boşsa yalnızca tarih kısmı yazılır.
   */
  documentOwner: string;
}

export const DEFAULT_SETTINGS: Settings = {
  dailySummaryAt: '09:00',
  dailySummaryEnabled: true,
  eveningCheckAt: '20:00',
  eveningCheckEnabled: false,
  defaultCurrency: 'TRY',
  defaultWeekendPolicy: 'none',
  defaultMonthEndPolicy: 'clampToLastDay',
  ttsEnabled: true,
  theme: 'system',
  accent: 'mavi',
  documentOwner: '',
  customCategories: [],
  categoryNames: {},
  hiddenCategories: [],
};

