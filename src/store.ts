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
import { getNotifier } from './services/notify';
import { getRepository } from './services/platform';

export interface StoreState {
  ready: boolean;
  today: ISODate;
  payments: Payment[];
  overrides: Override[];
  contacts: Contact[];
  settings: Settings;
}

export function useStore() {
  const repo = useMemo(() => getRepository(), []);
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

  return {
    ...state,
    repo,
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
