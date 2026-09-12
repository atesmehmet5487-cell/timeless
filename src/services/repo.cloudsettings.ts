/**
 * Bulut deposunun ayar tarafını cihazla birleştiren sarmalayıcı.
 *
 * Ayarların hepsi ekiple paylaşılmaz. Belge başlığı, para birimi, özel
 * kategoriler ve varsayılan kurallar ortak; **tema, renk, bildirim saatleri
 * ve PIN cihaza özeldir** — bir kişinin koyu temayı seçmesi ötekinin
 * ekranını değiştirmemeli, telefondaki PIN bilgisayara geçmemeli.
 *
 * Bu ayrım olmadan bulut modunda tema/renk/PIN değişiklikleri kayboluyordu:
 * kaydederken buluta yalnızca ortak alanlar yazılıyor, geri okurken kalanlar
 * varsayılana düşüyordu. Burada ortak alanlar buluttan, geri kalanı cihazdan
 * okunur; yazarken ikisine birden gider.
 */
import type { Contact, ISODate, Override, Payment, Settings } from '../domain/types';
import type { BackupData, Repository } from './repo';

/** Ekiple paylaşılan ayar alanları. */
const SHARED_KEYS = [
  'documentOwner',
  'customCategories',
  'defaultCurrency',
  'defaultWeekendPolicy',
  'defaultMonthEndPolicy',
] as const satisfies readonly (keyof Settings)[];

function sharedPart(settings: Settings): Pick<Settings, (typeof SHARED_KEYS)[number]> {
  return {
    documentOwner: settings.documentOwner,
    customCategories: settings.customCategories,
    defaultCurrency: settings.defaultCurrency,
    defaultWeekendPolicy: settings.defaultWeekendPolicy,
    defaultMonthEndPolicy: settings.defaultMonthEndPolicy,
  };
}

export class CloudWithDeviceSettings implements Repository {
  private readonly cloud: Repository;
  private readonly device: Repository;

  constructor(cloud: Repository, device: Repository) {
    this.cloud = cloud;
    this.device = device;
  }

  /* Ayarlar: ortak alanlar buluttan, cihaza özel olanlar cihazdan ----- */

  async getSettings(): Promise<Settings> {
    const [team, mine] = await Promise.all([this.cloud.getSettings(), this.device.getSettings()]);
    return { ...mine, ...sharedPart(team) };
  }

  async saveSettings(settings: Settings): Promise<void> {
    // Cihaza tamamı yazılır: çıkış yapınca tema ve PIN yerinde kalsın
    await Promise.all([this.cloud.saveSettings(settings), this.device.saveSettings(settings)]);
  }

  /* Geri kalan her şey doğrudan buluta ------------------------------- */

  init(): Promise<void> {
    return this.cloud.init();
  }
  listPayments(opts?: { includeDeleted?: boolean; includeArchived?: boolean }): Promise<Payment[]> {
    return this.cloud.listPayments(opts);
  }
  getPayment(id: string): Promise<Payment | undefined> {
    return this.cloud.getPayment(id);
  }
  savePayment(payment: Payment): Promise<void> {
    return this.cloud.savePayment(payment);
  }
  trashPayment(id: string): Promise<void> {
    return this.cloud.trashPayment(id);
  }
  restorePayment(id: string): Promise<void> {
    return this.cloud.restorePayment(id);
  }
  purgePayment(id: string): Promise<void> {
    return this.cloud.purgePayment(id);
  }
  purgeExpiredTrash(olderThanDays?: number): Promise<number> {
    return this.cloud.purgeExpiredTrash(olderThanDays);
  }
  listOverrides(from?: ISODate, to?: ISODate): Promise<Override[]> {
    return this.cloud.listOverrides(from, to);
  }
  saveOverride(override: Override): Promise<void> {
    return this.cloud.saveOverride(override);
  }
  deleteOverride(id: string): Promise<void> {
    return this.cloud.deleteOverride(id);
  }
  purgeOverridesBefore(date: ISODate): Promise<number> {
    return this.cloud.purgeOverridesBefore(date);
  }
  listContacts(): Promise<Contact[]> {
    return this.cloud.listContacts();
  }
  saveContact(contact: Contact): Promise<void> {
    return this.cloud.saveContact(contact);
  }
  deleteContact(id: string): Promise<void> {
    return this.cloud.deleteContact(id);
  }
  exportAll(): Promise<BackupData> {
    return this.cloud.exportAll();
  }
  importAll(data: BackupData, mode: 'replace' | 'merge'): Promise<void> {
    return this.cloud.importAll(data, mode);
  }
}
