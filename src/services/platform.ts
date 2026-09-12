/** Hangi kabukta çalıştığımızı tespit eder ve doğru adaptörleri verir. */
import { DexieRepository } from './repo.dexie';
import { ElectronRepository } from './repo.electron';
import type { Repository } from './repo';

export type PlatformKind = 'web' | 'android' | 'electron';

declare global {
  interface Window {
    /** Electron preload köprüsü (electron/preload.ts). */
    timeless?: unknown;
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  }
}

export function platformKind(): PlatformKind {
  if (typeof window !== 'undefined' && window.timeless) return 'electron';
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) return 'android';
  return 'web';
}

let localRepo: Repository | null = null;
let cloudRepo: Repository | null = null;

/**
 * Cihazdaki depo: Windows'ta main process'teki JSON dosyası (bildirim
 * zamanlayıcısı pencere kapalıyken de okumalı), diğer yerlerde IndexedDB.
 */
export function getLocalRepository(): Repository {
  if (!localRepo) {
    localRepo = platformKind() === 'electron' ? new ElectronRepository() : new DexieRepository();
  }
  return localRepo;
}

/**
 * Bulut deposu. Firestore kodu yalnızca giriş yapıldığında yüklenir; bulut
 * yapılandırılmamış derlemelerde bu işlev hiç çağrılmaz.
 */
export async function getCloudRepository(): Promise<Repository> {
  if (!cloudRepo) {
    const { FirestoreRepository } = await import('./repo.firestore');
    cloudRepo = new FirestoreRepository();
  }
  return cloudRepo;
}

/** Geriye dönük uyumluluk: bulut yoksa kullanılan depo. */
export function getRepository(): Repository {
  return getLocalRepository();
}
