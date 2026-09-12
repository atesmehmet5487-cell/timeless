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

let repo: Repository | null = null;

/** Uygulama ömrü boyunca tek depo örneği. */
export function getRepository(): Repository {
  if (!repo) {
    // Windows'ta veri main process'teki JSON dosyasında tutulur; bildirim
    // zamanlayıcısının pencere kapalıyken de okuyabilmesi gerekiyor.
    repo = platformKind() === 'electron' ? new ElectronRepository() : new DexieRepository();
  }
  return repo;
}
