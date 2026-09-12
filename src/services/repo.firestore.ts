/**
 * Bulut deposu (Firestore).
 *
 * Dexie ve Electron sürümleriyle aynı `Repository` arayüzünü uygular, bu
 * yüzden ekranlar hangi depoyla çalıştığını bilmez.
 *
 * Çevrimdışı: Firestore'un kalıcı önbelleği sayesinde okuma/yazma internet
 * olmadan da sürer; yazmalar bağlantı gelince kendiliğinden gönderilir.
 *
 * Silme: satırlar hemen yok edilmez, `deletedAt` damgası konur. Aksi hâlde
 * bir cihazda silinen kayıt, diğer cihaz eski hâlini yazdığında geri gelir.
 */
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import * as D from '../domain/date';
import { DEFAULT_SETTINGS } from '../domain/types';
import type { Contact, ISODate, Override, Payment, Settings } from '../domain/types';
import { cloudDb, currentTeamId } from './cloud';
import { TRASH_RETENTION_DAYS, type BackupData, type Repository } from './repo';

type Collection = 'payments' | 'overrides' | 'contacts';

function teamPath(name: Collection | 'settings'): string {
  return `teams/${currentTeamId()}/${name}`;
}

/** Firestore `undefined` kabul etmez; boş alanlar temizlenir. */
function clean(value: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = item;
  }
  return out;
}

export class FirestoreRepository implements Repository {
  async init(): Promise<void> {
    // Firestore bağlantısı ilk erişimde kurulur; ayrı hazırlık gerekmiyor.
    cloudDb();
  }

  private async readAll<T>(name: Collection): Promise<T[]> {
    const snapshot = await getDocs(collection(cloudDb(), teamPath(name)));
    return snapshot.docs.map((item) => item.data() as T);
  }

  async listPayments(opts?: {
    includeDeleted?: boolean;
    includeArchived?: boolean;
  }): Promise<Payment[]> {
    const all = await this.readAll<Payment>('payments');
    return all.filter(
      (p) => (opts?.includeDeleted || !p.deletedAt) && (opts?.includeArchived || !p.archivedAt),
    );
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    const snapshot = await getDoc(doc(cloudDb(), teamPath('payments'), id));
    return snapshot.exists() ? (snapshot.data() as Payment) : undefined;
  }

  async savePayment(payment: Payment): Promise<void> {
    await setDoc(doc(cloudDb(), teamPath('payments'), payment.id), clean(payment), {
      merge: true,
    });
  }

  async trashPayment(id: string): Promise<void> {
    await setDoc(
      doc(cloudDb(), teamPath('payments'), id),
      { deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { merge: true },
    );
  }

  async restorePayment(id: string): Promise<void> {
    await setDoc(
      doc(cloudDb(), teamPath('payments'), id),
      { deletedAt: deleteField(), updatedAt: new Date().toISOString() },
      { merge: true },
    );
  }

  async purgePayment(id: string): Promise<void> {
    const batch = writeBatch(cloudDb());
    batch.delete(doc(cloudDb(), teamPath('payments'), id));
    const overrides = await this.readAll<Override>('overrides');
    for (const override of overrides.filter((o) => o.paymentId === id)) {
      batch.delete(doc(cloudDb(), teamPath('overrides'), override.id));
    }
    await batch.commit();
  }

  async purgeExpiredTrash(olderThanDays = TRASH_RETENTION_DAYS): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString();
    const expired = (await this.readAll<Payment>('payments')).filter(
      (p) => p.deletedAt && p.deletedAt < cutoff,
    );
    for (const payment of expired) await this.purgePayment(payment.id);
    return expired.length;
  }

  async listOverrides(from?: ISODate, to?: ISODate): Promise<Override[]> {
    const all = (await this.readAll<Override & { deletedAt?: string }>('overrides')).filter(
      (o) => !o.deletedAt,
    );
    if (!from && !to) return all;
    return all.filter((o) => {
      const dates = [o.originalDate, o.deferredTo].filter(Boolean) as ISODate[];
      return dates.some((d) => (!from || d >= from) && (!to || d <= to));
    });
  }

  async saveOverride(override: Override): Promise<void> {
    // Anahtar seri + gün olduğundan belge kimliği de ondan üretilir:
    // aynı günün müdahalesi iki kez oluşmaz, cihazlar aynı satıra yazar.
    const id = `${override.paymentId}_${override.originalDate}`;
    await setDoc(
      doc(cloudDb(), teamPath('overrides'), id),
      clean({ ...override, id, deletedAt: undefined }),
      { merge: true },
    );
  }

  async deleteOverride(id: string): Promise<void> {
    const all = await this.readAll<Override>('overrides');
    const target = all.find((o) => o.id === id);
    if (!target) return;
    const docId = `${target.paymentId}_${target.originalDate}`;
    await setDoc(
      doc(cloudDb(), teamPath('overrides'), docId),
      { deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { merge: true },
    );
  }

  async purgeOverridesBefore(date: ISODate): Promise<number> {
    const stale = (await this.readAll<Override>('overrides')).filter(
      (o) => o.status === 'paid' && (o.deferredTo ?? o.originalDate) < date,
    );
    if (stale.length === 0) return 0;
    const batch = writeBatch(cloudDb());
    for (const override of stale) {
      batch.delete(doc(cloudDb(), teamPath('overrides'), `${override.paymentId}_${override.originalDate}`));
    }
    await batch.commit();
    return stale.length;
  }

  async listContacts(): Promise<Contact[]> {
    const all = (await this.readAll<Contact & { deletedAt?: string }>('contacts')).filter(
      (c) => !c.deletedAt,
    );
    return all.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }

  async saveContact(contact: Contact): Promise<void> {
    await setDoc(doc(cloudDb(), teamPath('contacts'), contact.id), clean(contact), {
      merge: true,
    });
  }

  async deleteContact(id: string): Promise<void> {
    await setDoc(
      doc(cloudDb(), teamPath('contacts'), id),
      { deletedAt: new Date().toISOString() },
      { merge: true },
    );
  }

  /**
   * Ayarların yalnızca ekibe ait olanları bulutta tutulur.
   * Tema, bildirim saatleri ve PIN cihaza özeldir; onlar yerel kalır.
   */
  async getSettings(): Promise<Settings> {
    const snapshot = await getDoc(doc(cloudDb(), teamPath('settings'), 'team'));
    const shared = snapshot.exists() ? (snapshot.data() as Partial<Settings>) : {};
    return { ...DEFAULT_SETTINGS, ...shared };
  }

  async saveSettings(settings: Settings): Promise<void> {
    const shared: Partial<Settings> = {
      documentOwner: settings.documentOwner,
      customCategories: settings.customCategories,
      defaultCurrency: settings.defaultCurrency,
      defaultWeekendPolicy: settings.defaultWeekendPolicy,
      defaultMonthEndPolicy: settings.defaultMonthEndPolicy,
    };
    await setDoc(doc(cloudDb(), teamPath('settings'), 'team'), clean(shared), { merge: true });
  }

  async exportAll(): Promise<BackupData> {
    const [payments, overrides, contacts, settings] = await Promise.all([
      this.listPayments({ includeArchived: true, includeDeleted: true }),
      this.listOverrides(),
      this.listContacts(),
      this.getSettings(),
    ]);
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      payments,
      overrides,
      contacts,
      settings,
    };
  }

  async importAll(data: BackupData, mode: 'replace' | 'merge'): Promise<void> {
    if (mode === 'replace') {
      const existing = await this.listPayments({ includeArchived: true, includeDeleted: true });
      for (const payment of existing) await this.purgePayment(payment.id);
    }

    // Firestore toplu yazmada 500 işlem sınırı var; parçalara bölünür
    const writes: (() => void)[] = [];
    const db = cloudDb();
    let batch = writeBatch(db);
    let count = 0;

    const push = (path: string, id: string, value: Record<string, unknown>) => {
      batch.set(doc(db, path, id), value, { merge: true });
      count++;
      if (count === 450) {
        const current = batch;
        writes.push(() => void current.commit());
        batch = writeBatch(db);
        count = 0;
      }
    };

    for (const payment of data.payments) push(teamPath('payments'), payment.id, clean(payment));
    for (const override of data.overrides) {
      push(
        teamPath('overrides'),
        `${override.paymentId}_${override.originalDate}`,
        clean({ ...override, id: `${override.paymentId}_${override.originalDate}` }),
      );
    }
    for (const contact of data.contacts) push(teamPath('contacts'), contact.id, clean(contact));

    for (const commit of writes) commit();
    if (count > 0) await batch.commit();
    await this.saveSettings(data.settings);
  }
}

/** Yedek dosyası adı — bulut modunda da aynı biçim. */
export function backupFileName(now: Date = new Date()): string {
  return `timeless-yedek-${D.today(now)}.json`;
}
