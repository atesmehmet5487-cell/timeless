/**
 * Windows deposu: veriyi main process'teki JSON dosyasında tutar.
 *
 * Dexie sürümüyle aynı arayüzü uygular, bu yüzden ekranlar hangi kabukta
 * olduğunu bilmez. Veri kümesi küçük (ayda birkaç düzine kayıt), bu yüzden
 * her işlemde dosyanın tamamı okunup yazılır — indeks/karmaşık sorgu yok.
 */
import * as D from '../domain/date';
import { DEFAULT_SETTINGS } from '../domain/types';
import type { Contact, ISODate, Override, Payment, Settings } from '../domain/types';
import { TRASH_RETENTION_DAYS, type BackupData, type Repository } from './repo';

interface RawDatabase {
  version: 1;
  payments: Payment[];
  overrides: Override[];
  contacts: Contact[];
  settings: Settings | null;
}

interface ElectronDbBridge {
  read(): Promise<RawDatabase>;
  write(data: RawDatabase): Promise<boolean>;
}

function bridge(): ElectronDbBridge {
  const api = (window as unknown as { timeless?: { db?: ElectronDbBridge } }).timeless;
  if (!api?.db) throw new Error('Electron köprüsü bulunamadı (preload yüklenmemiş).');
  return api.db;
}

export class ElectronRepository implements Repository {
  private cache: RawDatabase | null = null;

  private async load(): Promise<RawDatabase> {
    if (!this.cache) {
      const data = await bridge().read();
      this.cache = {
        version: 1,
        payments: data.payments ?? [],
        overrides: data.overrides ?? [],
        contacts: data.contacts ?? [],
        settings: data.settings ?? null,
      };
    }
    return this.cache;
  }

  private async save(mutate: (data: RawDatabase) => void): Promise<void> {
    const data = await this.load();
    mutate(data);
    await bridge().write(data);
  }

  async init(): Promise<void> {
    await this.load();
  }

  async listPayments(opts?: {
    includeDeleted?: boolean;
    includeArchived?: boolean;
  }): Promise<Payment[]> {
    const { payments } = await this.load();
    return payments.filter(
      (p) => (opts?.includeDeleted || !p.deletedAt) && (opts?.includeArchived || !p.archivedAt),
    );
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    return (await this.load()).payments.find((p) => p.id === id);
  }

  async savePayment(payment: Payment): Promise<void> {
    await this.save((data) => {
      const index = data.payments.findIndex((p) => p.id === payment.id);
      if (index === -1) data.payments.push(payment);
      else data.payments[index] = payment;
    });
  }

  async trashPayment(id: string): Promise<void> {
    const stamp = new Date().toISOString();
    await this.save((data) => {
      const payment = data.payments.find((p) => p.id === id);
      if (payment) payment.deletedAt = stamp;
    });
  }

  async restorePayment(id: string): Promise<void> {
    await this.save((data) => {
      const payment = data.payments.find((p) => p.id === id);
      if (payment) delete payment.deletedAt;
    });
  }

  async purgePayment(id: string): Promise<void> {
    await this.save((data) => {
      data.payments = data.payments.filter((p) => p.id !== id);
      data.overrides = data.overrides.filter((o) => o.paymentId !== id);
    });
  }

  async purgeExpiredTrash(olderThanDays = TRASH_RETENTION_DAYS): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString();
    let removed = 0;
    await this.save((data) => {
      const expired = data.payments.filter((p) => p.deletedAt && p.deletedAt < cutoff);
      removed = expired.length;
      if (removed === 0) return;
      const ids = new Set(expired.map((p) => p.id));
      data.payments = data.payments.filter((p) => !ids.has(p.id));
      data.overrides = data.overrides.filter((o) => !ids.has(o.paymentId));
    });
    return removed;
  }

  async listOverrides(from?: ISODate, to?: ISODate): Promise<Override[]> {
    const { overrides } = await this.load();
    if (!from && !to) return overrides;
    return overrides.filter((o) => {
      const dates = [o.originalDate, o.deferredTo].filter(Boolean) as ISODate[];
      return dates.some((d) => (!from || d >= from) && (!to || d <= to));
    });
  }

  async saveOverride(override: Override): Promise<void> {
    await this.save((data) => {
      const index = data.overrides.findIndex(
        (o) => o.paymentId === override.paymentId && o.originalDate === override.originalDate,
      );
      if (index === -1) data.overrides.push(override);
      else data.overrides[index] = { ...override, id: data.overrides[index].id };
    });
  }

  async deleteOverride(id: string): Promise<void> {
    await this.save((data) => {
      data.overrides = data.overrides.filter((o) => o.id !== id);
    });
  }

  async purgeOverridesBefore(date: ISODate): Promise<number> {
    let removed = 0;
    await this.save((data) => {
      const before = data.overrides.length;
      data.overrides = data.overrides.filter(
        (o) => !(o.status === 'paid' && (o.deferredTo ?? o.originalDate) < date),
      );
      removed = before - data.overrides.length;
    });
    return removed;
  }

  async listContacts(): Promise<Contact[]> {
    const { contacts } = await this.load();
    return [...contacts].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }

  async saveContact(contact: Contact): Promise<void> {
    await this.save((data) => {
      const index = data.contacts.findIndex((c) => c.id === contact.id);
      if (index === -1) data.contacts.push(contact);
      else data.contacts[index] = contact;
    });
  }

  async deleteContact(id: string): Promise<void> {
    await this.save((data) => {
      data.contacts = data.contacts.filter((c) => c.id !== id);
    });
  }

  async getSettings(): Promise<Settings> {
    const { settings } = await this.load();
    return { ...DEFAULT_SETTINGS, ...settings };
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.save((data) => {
      data.settings = settings;
    });
  }

  async exportAll(): Promise<BackupData> {
    const data = await this.load();
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      payments: data.payments,
      overrides: data.overrides,
      contacts: data.contacts,
      settings: { ...DEFAULT_SETTINGS, ...data.settings },
    };
  }

  async importAll(incoming: BackupData, mode: 'replace' | 'merge'): Promise<void> {
    await this.save((data) => {
      if (mode === 'replace') {
        data.payments = [...incoming.payments];
        data.overrides = [...incoming.overrides];
        data.contacts = [...incoming.contacts];
      } else {
        data.payments = mergeById(data.payments, incoming.payments);
        data.overrides = mergeById(data.overrides, incoming.overrides);
        data.contacts = mergeById(data.contacts, incoming.contacts);
      }
      data.settings = incoming.settings;
    });
  }
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const map = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) map.set(item.id, item);
  return [...map.values()];
}

/** Yedek dosyası adı: "timeless-yedek-2026-09-15.json" */
export function backupFileName(now: Date = new Date()): string {
  return `timeless-yedek-${D.today(now)}.json`;
}
