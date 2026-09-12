/**
 * Uygulama durumu: depoyu okur, ekranlara hazır veriyi ve eylemleri verir.
 * Veri miktarı küçük olduğu için her değişiklikte tamamı yeniden okunur —
 * karmaşık önbellek yönetimine gerek yok.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as D from './domain/date';
import { createPayment, type NewPaymentInput } from './domain/payment';
import { buildReminders } from './domain/reminders';
import { buildOccurrences, dayPlan, makeOverride } from './domain/schedule';
import { DEFAULT_SETTINGS } from './domain/types';
import type { Contact, ISODate, Occurrence, Override, Payment, Settings } from './domain/types';
import type { CloudUser } from './services/cloud';
import { isCloudConfigured } from './services/cloudConfig';
import { migrateLocalToCloud } from './services/migrate';
import { getNotifier } from './services/notify';
import { getCloudRepository, getLocalRepository } from './services/platform';
import type { Repository } from './services/repo';

export interface StoreState {
  ready: boolean;
  today: ISODate;
  payments: Payment[];
  overrides: Override[];
  contacts: Contact[];
  settings: Settings;
}

/** Verinin nerede tutulduğu. */
export type DataMode = 'local' | 'cloud';

export function useStore() {
  /** Bulut oturumu: null ise cihaz deposu kullanılır. */
  const [session, setSession] = useState<CloudUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(!isCloudConfigured());
  const [repo, setRepo] = useState<Repository>(() => getLocalRepository());
  const [mode, setMode] = useState<DataMode>('local');
  const [cloudNotice, setCloudNotice] = useState<string | null>(null);

  const [state, setState] = useState<StoreState>({
    ready: false,
    today: D.today(),
    payments: [],
    overrides: [],
    contacts: [],
    settings: DEFAULT_SETTINGS,
  });

  const reload = useCallback(async () => {
    // Çöp kutusu ve arşiv ekranları da bu listeden beslenir; ayıklama
    // domain/schedule.activePayments içinde yapılır.
    const [payments, overrides, contacts, settings] = await Promise.all([
      repo.listPayments({ includeArchived: true, includeDeleted: true }),
      repo.listOverrides(),
      repo.listContacts(),
      repo.getSettings(),
    ]);
    setState((s) => ({ ...s, ready: true, today: D.today(), payments, overrides, contacts, settings }));
  }, [repo]);

  // Bulut oturumunu izle; giriş/çıkışta depo değişir.
  // Firebase kodu yalnızca burada, yapılandırma varsa yüklenir.
  useEffect(() => {
    if (!isCloudConfigured()) return;
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void import('./services/cloud').then(({ watchSession }) => {
      if (cancelled) return;
      unsubscribe = watchSession((user) => {
        setSession(user);
        setSessionChecked(true);
      });
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  /**
   * Oturum açıldığında bulut deposuna geçilir; ilk girişte cihazdaki
   * kayıtlar buluta taşınır. Çıkışta yerel depoya dönülür.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (session) {
        try {
          const cloud = await getCloudRepository();
          await cloud.init();
          const result = await migrateLocalToCloud(getLocalRepository(), cloud);
          if (cancelled) return;
          if (result.moved) {
            setCloudNotice(
              result.payments > 0
                ? `Bu cihazdaki ${result.payments} kayıt buluta taşındı`
                : 'Bu cihazdaki işaretlemeler buluta taşındı',
            );
          }
          setRepo(cloud);
          setMode('cloud');
        } catch (error) {
          // En olası sebep: e-posta güvenlik kurallarındaki ekip listesinde
          // değil. Sessizce yerelde kalmak yerine söyleyip oturumu kapatıyoruz;
          // yoksa "giriş yaptım ama veri gelmiyor" gibi görünür.
          if (cancelled) return;
          const denied = (error as { code?: string }).code === 'permission-denied';
          setCloudNotice(
            denied
              ? `${session.email} ekibe ekli değil. Ekip yöneticisi bu e-postayı izin listesine eklemeli.`
              : 'Bulut verisine ulaşılamadı; kayıtlar bu cihazdan gösteriliyor.',
          );
          if (denied) {
            const { signOutCloud } = await import('./services/cloud');
            await signOutCloud();
          }
        }
      } else {
        setRepo(getLocalRepository());
        setMode('local');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await repo.init();
      await repo.purgeExpiredTrash();
      if (!cancelled) await reload();
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, reload]);

  // Gece yarısını geçince "bugün" kendiliğinden ilerlesin
  useEffect(() => {
    const timer = setInterval(() => {
      const now = D.today();
      setState((s) => (s.today === now ? s : { ...s, today: now }));
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  /**
   * Veri her değiştiğinde bildirimler baştan kurulur.
   * Tekrar tekrar kurmak sorun değil: kimlikler deterministik, önceki
   * zamanlamalar temizleniyor.
   */
  const reminders = useMemo(
    () =>
      state.ready
        ? buildReminders(state.payments, state.overrides, state.settings, { today: state.today })
        : [],
    [state.ready, state.payments, state.overrides, state.settings, state.today],
  );

  useEffect(() => {
    if (!state.ready) return;
    void getNotifier().schedule(reminders);
  }, [state.ready, reminders]);

  const addPayment = useCallback(
    async (input: NewPaymentInput) => {
      const payment = createPayment(input, state.settings);
      await repo.savePayment(payment);
      await reload();
      return payment;
    },
    [repo, reload, state.settings],
  );

  const updatePayment = useCallback(
    async (payment: Payment) => {
      await repo.savePayment({ ...payment, updatedAt: new Date().toISOString() });
      await reload();
    },
    [repo, reload],
  );

  const trashPayment = useCallback(
    async (id: string) => {
      await repo.trashPayment(id);
      await reload();
    },
    [repo, reload],
  );

  const restorePayment = useCallback(
    async (id: string) => {
      await repo.restorePayment(id);
      await reload();
    },
    [repo, reload],
  );

  const purgePayment = useCallback(
    async (id: string) => {
      await repo.purgePayment(id);
      await reload();
    },
    [repo, reload],
  );

  /** Bir örneği ödendi/ertelendi/atlandı olarak işaretler. */
  const setOccurrenceStatus = useCallback(
    async (
      occurrence: Occurrence,
      patch: Parameters<typeof makeOverride>[1],
    ) => {
      await repo.saveOverride(makeOverride(occurrence, patch));
      await reload();
    },
    [repo, reload],
  );

  /** Müdahaleyi tamamen kaldırır — kalem "bekliyor" haline döner. */
  const clearOccurrenceStatus = useCallback(
    async (occurrence: Occurrence) => {
      if (occurrence.override) await repo.deleteOverride(occurrence.override.id);
      await reload();
    },
    [repo, reload],
  );

  const saveContact = useCallback(
    async (contact: Contact) => {
      await repo.saveContact(contact);
      await reload();
    },
    [repo, reload],
  );

  const deleteContact = useCallback(
    async (id: string) => {
      await repo.deleteContact(id);
      await reload();
    },
    [repo, reload],
  );

  const saveSettings = useCallback(
    async (settings: Settings) => {
      await repo.saveSettings(settings);
      await reload();
    },
    [repo, reload],
  );

  /** Bir günün planı (bugünse gecikmişler dahil). */
  const planFor = useCallback(
    (date: ISODate) => dayPlan(state.payments, state.overrides, date, state.today),
    [state.payments, state.overrides, state.today],
  );

  /** Bir aralıktaki tüm kalemler (takvim ekranı için). */
  const rangeFor = useCallback(
    (from: ISODate, to: ISODate) =>
      buildOccurrences(state.payments, state.overrides, from, to, state.today),
    [state.payments, state.overrides, state.today],
  );

  /**
   * Bu cihazda kalmış kayıtları buluta yükler.
   *
   * İlk giriş taşıması yalnızca bulut boşken çalışır — ikinci bir cihazdan
   * girildiğinde oradaki eski kayıtlar ekibin verisinin üzerine yazılmasın
   * diye. Ama kayıtlar bir cihazda mahsur kalabiliyor; bu düğme onları
   * kullanıcı isteyince yukarı taşır. Kimlikler sabit olduğu için iki kez
   * çalıştırmak zarar vermez.
   */
  const uploadDeviceRecords = useCallback(async () => {
    if (mode !== 'cloud') return { payments: 0, overrides: 0, contacts: 0 };
    const local = getLocalRepository();
    const backup = await local.exportAll();
    for (const payment of backup.payments) await repo.savePayment(payment);
    for (const override of backup.overrides) await repo.saveOverride(override);
    for (const contact of backup.contacts) await repo.saveContact(contact);
    await reload();
    return {
      payments: backup.payments.length,
      overrides: backup.overrides.length,
      contacts: backup.contacts.length,
    };
  }, [mode, repo, reload]);

  const signOut = useCallback(async () => {
    const { signOutCloud } = await import('./services/cloud');
    await signOutCloud();
    setCloudNotice(null);
  }, []);

  return {
    ...state,
    // Oturum kontrolü bitmeden ekran açılmaz: yerel veri bir an görünüp
    // sonra bulut verisiyle değişmesin
    ready: state.ready && sessionChecked,
    repo,
    mode,
    session,
    cloudConfigured: isCloudConfigured(),
    cloudNotice,
    dismissCloudNotice: () => setCloudNotice(null),
    uploadDeviceRecords,
    signOut,
    reminders,
    reload,
    addPayment,
    updatePayment,
    trashPayment,
    restorePayment,
    purgePayment,
    setOccurrenceStatus,
    clearOccurrenceStatus,
    saveContact,
    deleteContact,
    saveSettings,
    planFor,
    rangeFor,
  };
}

export type Store = ReturnType<typeof useStore>;
