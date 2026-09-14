/**
 * Bulut deposunun iki cihaz arasındaki davranışı.
 *
 * Gerçek Firestore yerine, onun yazma kurallarını taklit eden bellek içi bir
 * sahte kullanılır: `merge: true` yalnızca verilen alanları günceller (eksik
 * alan eski değerini korur), `deleteField()` alanı siler, merge'siz yazma
 * belgeyi baştan yazar. Telefon ve bilgisayar aynı sahte veritabanını
 * paylaşan iki ayrı depo nesnesidir.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeOverride } from '../domain/schedule';
import type { Occurrence, Payment } from '../domain/types';

type Data = Record<string, unknown>;
const DELETE = Symbol('deleteField');

const fake = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  listeners: new Set<{ prefix: string; fire: () => void }>(),
}));

function notify(path: string) {
  for (const listener of fake.listeners) {
    if (path === listener.prefix || path.startsWith(`${listener.prefix}/`)) listener.fire();
  }
}

vi.mock('./cloud', () => ({ cloudDb: () => ({}), currentTeamId: () => 'uid-1' }));

vi.mock('firebase/firestore', () => {
  const write = (path: string, value: Data, options?: { merge?: boolean }) => {
    const next: Data = options?.merge ? { ...fake.docs.get(path) } : {};
    for (const [key, item] of Object.entries(value)) {
      if (item === DELETE) delete next[key];
      else next[key] = item;
    }
    fake.docs.set(path, next);
    notify(path);
  };
  const snapshotOf = (path: string) => ({
    exists: () => fake.docs.has(path),
    data: () => fake.docs.get(path),
    metadata: { hasPendingWrites: false },
  });
  const listOf = (path: string) => ({
    docs: [...fake.docs.entries()]
      .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
      .map(([, value]) => ({ data: () => value })),
    metadata: { hasPendingWrites: false },
  });
  return {
    collection: (_db: unknown, path: string) => ({ path, kind: 'collection' }),
    doc: (_db: unknown, path: string, id: string) => ({ path: `${path}/${id}`, kind: 'doc' }),
    deleteField: () => DELETE,
    getDoc: async (ref: { path: string }) => snapshotOf(ref.path),
    getDocs: async (ref: { path: string }) => listOf(ref.path),
    setDoc: async (ref: { path: string }, value: Data, options?: { merge?: boolean }) =>
      write(ref.path, value, options),
    writeBatch: () => {
      const ops: (() => void)[] = [];
      return {
        set: (ref: { path: string }, value: Data, options?: { merge?: boolean }) =>
          ops.push(() => write(ref.path, value, options)),
        delete: (ref: { path: string }) =>
          ops.push(() => {
            fake.docs.delete(ref.path);
            notify(ref.path);
          }),
        commit: async () => ops.forEach((op) => op()),
      };
    },
    onSnapshot: (
      ref: { path: string; kind: string },
      next: (snapshot: { metadata: { hasPendingWrites: boolean } }) => void,
    ) => {
      const listener = {
        prefix: ref.path,
        fire: () => next(ref.kind === 'doc' ? snapshotOf(ref.path) : listOf(ref.path)),
      };
      fake.listeners.add(listener);
      return () => fake.listeners.delete(listener);
    },
  };
});

const { FirestoreRepository } = await import('./repo.firestore');

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'p1',
    title: 'Ziraat kart',
    amount: 1500,
    currency: 'TRY',
    category: 'kart',
    iban: 'TR330006100519786457841326',
    note: 'Son gün 15',
    recurrence: { type: 'monthly', day: 15, from: '2026-09-01' },
    monthEndPolicy: 'clampToLastDay',
    weekendPolicy: 'none',
    remindDaysBefore: 0,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

/** Deponun okuduğu hâliyle, o günün satırı. */
async function occurrenceOn(repo: InstanceType<typeof FirestoreRepository>, p: Payment) {
  const override = (await repo.listOverrides()).find((o) => o.paymentId === p.id);
  return {
    paymentId: p.id,
    payment: p,
    originalDate: '2026-09-15',
    date: '2026-09-15',
    status: override?.status ?? 'pending',
    overdue: false,
    override,
  } satisfies Occurrence;
}

describe('bulut eşitlemesi (telefon ↔ bilgisayar)', () => {
  let phone: InstanceType<typeof FirestoreRepository>;
  let computer: InstanceType<typeof FirestoreRepository>;

  beforeEach(() => {
    fake.docs.clear();
    fake.listeners.clear();
    phone = new FirestoreRepository();
    computer = new FirestoreRepository();
  });

  it('telefonda eklenen kayıt bilgisayarda okunur', async () => {
    await phone.savePayment(payment());
    expect((await computer.listPayments()).map((p) => p.title)).toEqual(['Ziraat kart']);
  });

  it('düzenlemede silinen not, IBAN ve tutar öbür cihazda da silinir', async () => {
    const original = payment();
    await phone.savePayment(original);
    const { note: _note, iban: _iban, amount: _amount, ...rest } = original;
    await computer.savePayment({ ...rest, note: undefined, iban: undefined, amount: undefined });

    const [onPhone] = await phone.listPayments();
    expect(onPhone.note).toBeUndefined();
    expect(onPhone.iban).toBeUndefined();
    expect(onPhone.amount).toBeUndefined();
  });

  it('arşivden çıkarılan kayıt öbür cihazda da listeye döner', async () => {
    await phone.savePayment(payment({ archivedAt: '2026-09-10T10:00:00.000Z' }));
    await computer.savePayment(payment({ archivedAt: undefined }));
    expect(await phone.listPayments()).toHaveLength(1);
  });

  it('ödendi → işaret kaldır → yeniden ödendi: son işaret kalır', async () => {
    const p = payment();
    await phone.savePayment(p);

    await phone.saveOverride(makeOverride(await occurrenceOn(phone, p), { status: 'paid' }));
    const paid = await occurrenceOn(computer, p);
    expect(paid.status).toBe('paid');

    await computer.deleteOverride(paid.override!.id);
    expect((await occurrenceOn(phone, p)).status).toBe('pending');

    await phone.saveOverride(makeOverride(await occurrenceOn(phone, p), { status: 'paid' }));
    expect((await occurrenceOn(computer, p)).status).toBe('paid');
  });

  it('ertelenen kalem ödendi yapılınca erteleme tarihi kalmaz', async () => {
    const p = payment();
    await phone.savePayment(p);
    await phone.saveOverride(
      makeOverride(await occurrenceOn(phone, p), { status: 'deferred', deferredTo: '2026-09-20' }),
    );
    await computer.saveOverride(makeOverride(await occurrenceOn(computer, p), { status: 'paid' }));

    const [override] = await phone.listOverrides();
    expect(override.status).toBe('paid');
    expect(override.deferredTo).toBeUndefined();
  });

  it('kategori adı ve silinen kategoriler öbür cihaza geçer', async () => {
    const settings = await computer.getSettings();
    await computer.saveSettings({
      ...settings,
      categoryNames: { cari: 'Tedarikçiler' },
      hiddenCategories: ['kira'],
    });
    const onPhone = await phone.getSettings();
    expect(onPhone.categoryNames).toEqual({ cari: 'Tedarikçiler' });
    expect(onPhone.hiddenCategories).toEqual(['kira']);
  });

  it('uygulama açıkken öbür cihazdaki değişiklik haber verir', async () => {
    vi.useFakeTimers();
    try {
      const changed = vi.fn();
      const stop = computer.watch(changed);
      vi.advanceTimersByTime(1000);
      changed.mockClear(); // açılıştaki ilk okuma sayılmaz

      await phone.savePayment(payment());
      vi.advanceTimersByTime(1000);
      expect(changed).toHaveBeenCalledTimes(1);

      stop();
      await phone.savePayment(payment({ title: 'Değişti' }));
      vi.advanceTimersByTime(1000);
      expect(changed).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
