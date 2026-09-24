/**
 * Bulut yapılandırmasının okunması.
 *
 * Firebase paketi birkaç yüz kilobayt; ana pakete girmesin diye bu dosya
 * hiçbir şey import etmez. Uygulama "bulut var mı?" sorusunu buradan yanıtlar,
 * ağır bulut kodunu ancak gerekince (giriş, oturum izleme) yükler.
 */

export interface CloudConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

export function readCloudConfig(): CloudConfig | null {
  const env = import.meta.env;
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const appId = env.VITE_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !appId) return null;

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  };
}

/** Bu derlemede bulut yapılandırıldı mı? */
export function isCloudConfigured(): boolean {
  return readCloudConfig() !== null;
}
