/**
 * İlk girişte cihazdaki kayıtları buluta taşır.
 *
 * Yalnızca bir kez, yalnızca bulut boşken ve yalnızca yerelde kayıt varken
 * çalışır. Böylece ikinci bir cihazdan giriş yapıldığında oradaki eski
 * kayıtlar ekibin verisinin üzerine yazılmaz.
 *
 * Taşıma "merge" ile yapılır: aynı kimlikli kayıt varsa üzerine yazmaz,
 * olmayanı ekler.
 */
import type { Repository } from './repo';

/** Taşımanın yapıldığı bu cihazda işaretlenir. */
const FLAG_KEY = 'timeless.cloudMigrated';

function alreadyMigrated(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function markMigrated(): void {
  try {
    localStorage.setItem(FLAG_KEY, '1');
  } catch {
    /* depolama kapalıysa bir dahaki girişte tekrar denenir */
  }
}

export interface MigrationResult {
  moved: boolean;
  payments: number;
  overrides: number;
  contacts: number;
  reason?: 'zaten-taşındı' | 'yerel-boş' | 'bulut-dolu';
}

export async function migrateLocalToCloud(
  local: Repository,
  cloud: Repository,
): Promise<MigrationResult> {
  const empty = { moved: false, payments: 0, overrides: 0, contacts: 0 };

  if (alreadyMigrated()) return { ...empty, reason: 'zaten-taşındı' };

  const backup = await local.exportAll();
  const localCount = backup.payments.length + backup.contacts.length;
  if (localCount === 0) {
    markMigrated();
    return { ...empty, reason: 'yerel-boş' };
  }

  // Bulutta kayıt varsa taşıma yapılmaz: ekibin verisi esastır
  const cloudPayments = await cloud.listPayments({ includeArchived: true, includeDeleted: true });
  if (cloudPayments.length > 0) {
    markMigrated();
    return { ...empty, reason: 'bulut-dolu' };
  }

  await cloud.importAll(backup, 'merge');
  markMigrated();

  return {
    moved: true,
    payments: backup.payments.length,
    overrides: backup.overrides.length,
    contacts: backup.contacts.length,
  };
}
