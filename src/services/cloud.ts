/**
 * Bulut bağlantısı (Firebase).
 *
 * Yapılandırma derleme sırasında ortam değişkenlerinden gelir. Değişkenler
 * yoksa uygulama eskisi gibi yalnızca cihazda çalışır — bulut kodu hiç
 * yüklenmez. Böylece bulut isteğe bağlı bir katman olarak kalıyor.
 *
 * Çevrimdışı çalışma Firestore'un kendi kalıcı önbelleğiyle sağlanır:
 * yazmalar internet yokken sıraya girer, bağlantı gelince kendiliğinden
 * gönderilir. Bu yüzden elle senkron kuyruğu yazmıyoruz.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';
import { getAuth } from 'firebase/auth';
import { isCloudConfigured, readCloudConfig } from './cloudConfig';
import {
  doc,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  type Firestore,
} from 'firebase/firestore';

/** Tek ekip modeli: bütün kayıtlar bu belgenin altında durur. */
export const TEAM_ID = 'default';

const config = readCloudConfig();

export { isCloudConfigured, type CloudConfig } from './cloudConfig';

interface CloudHandles {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let handles: CloudHandles | null = null;

function connect(): CloudHandles {
  if (handles) return handles;
  if (!config) throw new Error('Bulut yapılandırılmadı.');

  const app = initializeApp(config);
  const auth = getAuth(app);
  // Oturum cihazda kalsın; her açılışta yeniden giriş istemesin
  void setPersistence(auth, browserLocalPersistence);

  // Kalıcı önbellek: çevrimdışı okuma/yazma ve sekmeler arası paylaşım
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  handles = { app, auth, db };
  return handles;
}

export function cloudAuth(): Auth {
  return connect().auth;
}

export function cloudDb(): Firestore {
  return connect().db;
}

/* ------------------------------------------------------------------ */
/* Oturum                                                              */
/* ------------------------------------------------------------------ */

export interface CloudUser {
  uid: string;
  email: string;
  displayName: string;
}

function toCloudUser(user: User): CloudUser {
  return {
    uid: user.uid,
    email: user.email ?? '',
    displayName: user.displayName ?? user.email ?? '',
  };
}

/** Oturum değişimlerini izler; abonelikten çıkma işlevini döndürür. */
export function watchSession(handler: (user: CloudUser | null) => void): () => void {
  if (!isCloudConfigured()) {
    handler(null);
    return () => undefined;
  }
  return onAuthStateChanged(cloudAuth(), (user) => handler(user ? toCloudUser(user) : null));
}

/** Hata kodlarını Türkçeye çevirir; ham Firebase metni kullanıcıya gösterilmez. */
function friendlyError(error: unknown): Error {
  const code = (error as { code?: string }).code ?? '';
  const messages: Record<string, string> = {
    'auth/invalid-email': 'E-posta adresi geçersiz.',
    'auth/invalid-credential': 'E-posta ya da şifre hatalı.',
    'auth/wrong-password': 'Şifre hatalı.',
    'auth/user-not-found': 'Bu e-postayla kayıt bulunamadı.',
    'auth/email-already-in-use': 'Bu e-posta zaten kayıtlı. Giriş yapmayı dene.',
    'auth/weak-password': 'Şifre en az 6 karakter olmalı.',
    'auth/too-many-requests': 'Çok fazla deneme yapıldı, biraz sonra tekrar dene.',
    'auth/network-request-failed': 'İnternet bağlantısı kurulamadı.',
    'auth/operation-not-allowed':
      'E-posta ile giriş Firebase panelinde açık değil (Authentication → Sign-in method).',
  };
  return new Error(messages[code] ?? 'Giriş yapılamadı. Bağlantını kontrol et.');
}

export async function signIn(email: string, password: string): Promise<CloudUser> {
  try {
    const result = await signInWithEmailAndPassword(cloudAuth(), email.trim(), password);
    return toCloudUser(result.user);
  } catch (error) {
    throw friendlyError(error);
  }
}

export async function signUp(
  email: string,
  password: string,
  displayName: string,
): Promise<CloudUser> {
  try {
    const result = await createUserWithEmailAndPassword(cloudAuth(), email.trim(), password);
    const name = displayName.trim() || email.trim();
    await updateProfile(result.user, { displayName: name });
    // Ekip üyesi kaydı — kimin eklediğini görebilmek için
    await setDoc(
      doc(cloudDb(), 'members', result.user.uid),
      { email: email.trim(), displayName: name, createdAt: new Date().toISOString() },
      { merge: true },
    );
    return { ...toCloudUser(result.user), displayName: name };
  } catch (error) {
    throw friendlyError(error);
  }
}

export async function signOutCloud(): Promise<void> {
  if (!isCloudConfigured()) return;
  await signOut(cloudAuth());
}
