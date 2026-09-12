/** IndexedDB (Dexie) tabanlı depo — Android ve tarayıcı için. */
import Dexie, { type EntityTable } from 'dexie';
import * as D from '../domain/date';
import { DEFAULT_SETTINGS } from '../domain/types';
import type { Contact, ISODate, Override, Payment, Settings } from '../domain/types';
import { TRASH_RETENTION_DAYS, type BackupData, type Repository } from './repo';

interface SettingsRow {
  key: 'settings';
  value: Settings;
}

class TimelessDB extends Dexie {
  payments!: EntityTable<Payment, 'id'>;
  overrides!: EntityTable<Override, 'id'>;
  contacts!: EntityTable<Contact, 'id'>;
  settings!: EntityTable<SettingsRow, 'key'>;

  constructor() {
    super('timeless');
    this.version(1).stores({
      payments: 'id, title, deletedAt, archivedAt',
      overrides: 'id, paymentId, originalDate, deferredTo, status, [paymentId+originalDate]',
      contacts: 'id, name',
      settings: 'key',
    });
  }
}

export class DexieRepository implements Repository {
  private db = new TimelessDB();

  async init(): Promise<void> {
    await this.db.open();
  }

  async listPayments(opts?: {
    includeDeleted?: boolean;
    includeArchived?: boolean;
  }): Promise<Payment[]> {
    const all = await this.db.payments.toArray();
    return all.filter(
      (p) =>
        (opts?.includeDeleted || !p.deletedAt) && (opts?.includeArchived || !p.archivedAt),
    );
  }

  getPayment(id: string): Promise<Payment | undefined> {
    return this.db.payments.get(id);
  }

  async savePayment(payment: Payment): Promise<void> {
    await this.db.payments.put(payment);
  }

  async trashPayment(id: string): Promise<void> {
    await this.db.payments.update(id, { deletedAt: new Date().toISOString() });
  }

  async restorePayment(id: string): Promise<void> {
    await this.db.payments.update(id, { deletedAt: undefined });
  }

  async purgePayment(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.payments, this.db.overrides, async () => {
      await this.db.overrides.where('paymentId').equals(id).delete();
      await this.db.payments.delete(id);
    });
  }

  async purgeExpiredTrash(olderThanDays = TRASH_RETENTION_DAYS): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString();
    const expired = await this.db.payments
      .filter((p) => !!p.deletedAt && p.deletedAt < cutoff)
      .toArray();
    for (const p of expired) await this.purgePayment(p.id);
    return expired.length;
  }

  async listOverrides(from?: ISODate, to?: ISODate): Promise<Override[]> {
    const all = await this.db.overrides.toArray();
    if (!from && !to) return all;
    // Erteleme kaydı iki tarihten biriyle pencereye girebilir
    return all.filter((o) => {
      const dates = [o.originalDate, o.deferredTo].filter(Boolean) as ISODate[];
      return dates.some((d) => (!from || d >= from) && (!to || d <= to));
    });
  }

  async saveOverride(override: Override): Promise<void> {
    const existing = await this.db.overrides
      .where('[paymentId+originalDate]')
      .equals([override.paymentId, override.originalDate])
      .first();
    await this.db.overrides.put(existing ? { ...override, id: existing.id } : override);
  }

  async deleteOverride(id: string): Promise<void> {
    await this.db.overrides.delete(id);
  }

  async purgeOverridesBefore(date: ISODate): Promise<number> {
    const stale = await this.db.overrides
      .filter((o) => o.status === 'paid' && (o.deferredTo ?? o.originalDate) < date)
      .toArray();
    await this.db.overrides.bulkDelete(stale.map((o) => o.id));
    return stale.length;
  }

  listContacts(): Promise<Contact[]> {
    return this.db.contacts.orderBy('name').toArray();
  }

  async saveContact(contact: Contact): Promise<void> {
    await this.db.contacts.put(contact);
  }

  async deleteContact(id: string): Promise<void> {
    await this.db.contacts.delete(id);
  }

  async getSettings(): Promise<Settings> {
    const row = await this.db.settings.get('settings');
    return { ...DEFAULT_SETTINGS, ...row?.value };
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.db.settings.put({ key: 'settings', value: settings });
  }

  async exportAll(): Promise<BackupData> {
    const [payments, overrides, contacts, settings] = await Promise.all([
      this.db.payments.toArray(),
      this.db.overrides.toArray(),
      this.db.contacts.toArray(),
      this.getSettings(),
    ]);
    return { version: 1, exportedAt: new Date().toISOString(), payments, overrides, contacts, settings };
  }

  async importAll(data: BackupData, mode: 'replace' | 'merge'): Promise<void> {
    await this.db.transaction(
      'rw',
      [this.db.payments, this.db.overrides, this.db.contacts, this.db.settings],
      async () => {
        if (mode === 'replace') {
          await Promise.all([
            this.db.payments.clear(),
            this.db.overrides.clear(),
            this.db.contacts.clear(),
          ]);
        }
        await this.db.payments.bulkPut(data.payments);
        await this.db.overrides.bulkPut(data.overrides);
        await this.db.contacts.bulkPut(data.contacts);
        await this.db.settings.put({ key: 'settings', value: data.settings });
      },
    );
  }
}

/** Yedek dosyası adı: "timeless-yedek-2026-09-15.json" */
export function backupFileName(now: Date = new Date()): string {
  return `timeless-yedek-${D.today(now)}.json`;
}
