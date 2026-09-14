/**
 * Depolama arayüzü.
 *
 * İki implementasyonu var:
 *  - repo.dexie.ts     → Android + tarayıcı (IndexedDB)
 *  - repo.electron.ts  → Windows (IPC ile main process'teki JSON dosyası;
 *                        bildirim zamanlayıcısı uygulama kapalıyken de
 *                        aynı veriyi okumak zorunda olduğu için)
 *
 * UI yalnızca bu arayüzü bilir.
 */
import type { Contact, ISODate, Override, Payment, Settings } from '../domain/types';

/** Çöp kutusundaki kayıtların kalıcı silinmeden önce bekleme süresi. */
export const TRASH_RETENTION_DAYS = 30;

export interface BackupData {
  version: 1;
  exportedAt: string;
  payments: Payment[];
  overrides: Override[];
  contacts: Contact[];
  settings: Settings;
}

export interface Repository {
  /** Depoyu hazırlar (şema/dosya oluşturma). */
  init(): Promise<void>;

  listPayments(opts?: { includeDeleted?: boolean; includeArchived?: boolean }): Promise<Payment[]>;
  getPayment(id: string): Promise<Payment | undefined>;
  savePayment(payment: Payment): Promise<void>;
  /** Çöp kutusuna taşır (geri alınabilir). */
  trashPayment(id: string): Promise<void>;
  restorePayment(id: string): Promise<void>;
  /** Kalıcı siler — kaydın müdahaleleri de gider. */
  purgePayment(id: string): Promise<void>;
  /** Süresi dolmuş çöp kayıtlarını temizler, silinen sayısını döner. */
  purgeExpiredTrash(olderThanDays?: number): Promise<number>;

  listOverrides(from?: ISODate, to?: ISODate): Promise<Override[]>;
  saveOverride(override: Override): Promise<void>;
  deleteOverride(id: string): Promise<void>;
  /** Verilen tarihten eski, ödenmiş müdahaleleri siler (arşiv temizliği). */
  purgeOverridesBefore(date: ISODate): Promise<number>;

  listContacts(): Promise<Contact[]>;
  saveContact(contact: Contact): Promise<void>;
  deleteContact(id: string): Promise<void>;

  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;

  /**
   * Veri başka bir yerden (öbür cihaz) değişince onChange çağrılır; abonelikten
   * çıkma işlevini döndürür. Yalnızca bulut deposunda var — cihaz depolarını
   * değiştiren tek şey bu uygulamanın kendisi.
   */
  watch?(onChange: () => void): () => void;

  exportAll(): Promise<BackupData>;
  importAll(data: BackupData, mode: 'replace' | 'merge'): Promise<void>;
}
