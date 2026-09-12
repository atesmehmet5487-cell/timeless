/**
 * Girişte cihazda kalmış kayıtları buluta taşır.
 *
 * Kural basit: **bulutta olmayan** kayıtlar yukarı çıkar, bulutta olanlara
 * dokunulmaz. Böylece bir cihazdaki eski kopya, ekibin güncel verisinin
 * üzerine hiçbir zaman yazmaz — ama gerçek kayıtlar da o cihazda mahsur
 * kalmaz.
 *
 * Her girişte çalışır: ilk girişte hepsi, sonrakilerde yalnızca aradaki
 * fark taşınır. Silinen kayıtlar bulutta "mezar taşı" olarak durduğu için
 * (deletedAt) geri dirilmezler.
 *
 * Ayarlar yalnızca bulut boşken taşınır; doluysa ekibin ayarları esastır.
 */
import type { BackupData, Repository } from './repo';

export interface MigrationResult {
  moved: boolean;
  payments: number;
  overrides: number;
  contacts: number;
  reason?: 'yerel-boş';
}

/** Bulutta hangi kimlikler var? */
async function cloudIds(cloud: Repository): Promise<{
  payments: Set<string>;
  overrides: Set<string>;
  contacts: Set<string>;
}> {
  const [payments, overrides, contacts] = await Promise.all([
    cloud.listPayments({ includeArchived: true, includeDeleted: true }),
    cloud.listOverrides(),
    cloud.listContacts(),
  ]);
  return {
    payments: new Set(payments.map((p) => p.id)),
    // Müdahaleler (paymentId, tarih) ikilisiyle tekilleşir
    overrides: new Set(overrides.map((o) => `${o.paymentId}_${o.originalDate}`)),
    contacts: new Set(contacts.map((c) => c.id)),
  };
}

export async function migrateLocalToCloud(
  local: Repository,
  cloud: Repository,
): Promise<MigrationResult> {
  const empty = { moved: false, payments: 0, overrides: 0, contacts: 0 };

  const backup: BackupData = await local.exportAll();
  if (backup.payments.length + backup.contacts.length === 0) {
    return { ...empty, reason: 'yerel-boş' };
  }

  const existing = await cloudIds(cloud);
  const cloudWasEmpty = existing.payments.size === 0 && existing.contacts.size === 0;

  const payments = backup.payments.filter((p) => !existing.payments.has(p.id));
  const overrides = backup.overrides.filter(
    (o) => !existing.overrides.has(`${o.paymentId}_${o.originalDate}`),
  );
  const contacts = backup.contacts.filter((c) => !existing.contacts.has(c.id));

  for (const payment of payments) await cloud.savePayment(payment);
  for (const override of overrides) await cloud.saveOverride(override);
  for (const contact of contacts) await cloud.saveContact(contact);

  // Belge başlığı, özel kategoriler gibi ortak ayarlar yalnızca ilk kurulumda
  if (cloudWasEmpty) await cloud.saveSettings(backup.settings);

  return {
    moved: payments.length + overrides.length + contacts.length > 0,
    payments: payments.length,
    overrides: overrides.length,
    contacts: contacts.length,
  };
}
