/**
 * Yedekleme ve geri yükleme.
 *
 * Veri yalnızca cihazda durduğu için tek koruma bu: telefon bozulur, Windows
 * yeniden kurulur ya da uygulama silinirse yedek dosyası olmadan kayıtlar geri
 * gelmez. Yedek düz JSON'dur; açılıp okunabilir, başka bir cihaza taşınabilir.
 */
import * as D from '../domain/date';
import type { BackupData, Repository } from './repo';

export const BACKUP_VERSION = 1;

/** "timeless-yedek-2026-09-15.json" */
export function backupFileName(now: Date = new Date()): string {
  return `timeless-yedek-${D.today(now)}.json`;
}

function download(text: string, fileName: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface BackupSummary {
  payments: number;
  overrides: number;
  contacts: number;
  exportedAt: string;
}

export function summarize(data: BackupData): BackupSummary {
  return {
    payments: data.payments.length,
    overrides: data.overrides.length,
    contacts: data.contacts.length,
    exportedAt: data.exportedAt,
  };
}

/** Tüm veriyi dosyaya indirir ve özetini döndürür. */
export async function exportBackup(repo: Repository): Promise<BackupSummary> {
  const data = await repo.exportAll();
  download(JSON.stringify(data, null, 2), backupFileName());
  return summarize(data);
}

/**
 * Yedek dosyasını okur ve doğrular.
 * Yükleme ayrı adımda yapılır; kullanıcı ne geleceğini görmeden veri değişmez.
 */
export async function readBackupFile(file: File): Promise<BackupData> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('Dosya okunamadı — geçerli bir yedek dosyası değil.');
  }

  const data = parsed as Partial<BackupData>;
  if (
    !data ||
    typeof data !== 'object' ||
    !Array.isArray(data.payments) ||
    !Array.isArray(data.overrides)
  ) {
    throw new Error('Bu dosya bir Timeless yedeği gibi görünmüyor.');
  }
  if (data.version !== BACKUP_VERSION) {
    throw new Error(`Yedek sürümü desteklenmiyor (v${String(data.version)}).`);
  }

  return {
    version: BACKUP_VERSION,
    exportedAt: data.exportedAt ?? new Date().toISOString(),
    payments: data.payments,
    overrides: data.overrides,
    contacts: data.contacts ?? [],
    settings: data.settings as BackupData['settings'],
  };
}

/**
 * Yedeği uygular.
 * 'replace' mevcut her şeyi siler, 'merge' aynı kimlikleri güncelleyip
 * kalanları korur — iki cihazı birleştirirken bu gerekir.
 */
export async function restoreBackup(
  repo: Repository,
  data: BackupData,
  mode: 'replace' | 'merge',
): Promise<BackupSummary> {
  await repo.importAll(data, mode);
  return summarize(data);
}
