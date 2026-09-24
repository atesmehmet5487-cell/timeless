/**
 * Windows tarafının veri deposu: tek bir JSON dosyası.
 *
 * Neden tarayıcıdaki IndexedDB değil: bildirim zamanlayıcısı main process'te
 * çalışır ve pencere kapalıyken de veriye bakması gerekir. Renderer'daki
 * IndexedDB'ye oradan erişilemez, bu yüzden Windows'ta tek doğruluk kaynağı
 * burasıdır.
 */
import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface Database {
  version: 1;
  payments: Record<string, unknown>[];
  overrides: Record<string, unknown>[];
  contacts: Record<string, unknown>[];
  settings: Record<string, unknown> | null;
}

const EMPTY: Database = {
  version: 1,
  payments: [],
  overrides: [],
  contacts: [],
  settings: null,
};

function filePath(): string {
  return join(app.getPath('userData'), 'timeless.json');
}

function backupPath(): string {
  return join(app.getPath('userData'), 'timeless.backup.json');
}

let cache: Database | null = null;

export function read(): Database {
  if (cache) return cache;
  const path = filePath();
  if (!existsSync(path)) return (cache = { ...EMPTY });
  try {
    cache = JSON.parse(readFileSync(path, 'utf8')) as Database;
    return cache;
  } catch {
    // Dosya bozuksa yedeğe düş; veri kaybı sessizce olmasın
    const backup = backupPath();
    if (existsSync(backup)) {
      try {
        cache = JSON.parse(readFileSync(backup, 'utf8')) as Database;
        return cache;
      } catch {
        /* yedek de okunamadı */
      }
    }
    return (cache = { ...EMPTY });
  }
}

/**
 * Önce geçici dosyaya yazıp sonra yerine koyar; yazma sırasında elektrik
 * kesilse bile dosya yarım kalmaz.
 */
export function write(data: Database): void {
  cache = data;
  const path = filePath();
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    try {
      writeFileSync(backupPath(), readFileSync(path));
    } catch {
      /* yedek alınamadıysa yazmaya devam */
    }
  }
  const temp = `${path}.tmp`;
  writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8');
  renameSync(temp, path);
}

export function update(mutate: (data: Database) => void): Database {
  const data = read();
  mutate(data);
  write(data);
  return data;
}
