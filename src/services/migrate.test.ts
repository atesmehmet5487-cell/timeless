/**
 * Girişte taşımanın kuralı: bulutta olmayan kayıtlar yukarı çıkar, bulutta
 * olanlara dokunulmaz. Bu dosya o iki yönü de tutuyor — çünkü ilk sürümde
 * "bulut doluysa hiç taşıma" davranışı kayıtları cihazda mahsur bırakmıştı.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../domain/types';
import type { Contact, Override, Payment, Settings } from '../domain/types';
import { migrateLocalToCloud } from './migrate';
import type { BackupData, Repository } from './repo';

function payment(id: string, title: string): Payment {
  return {
    id,
    title,
    currency: 'TRY',
    category: 'kart',
    recurrence: { type: 'once', date: '2026-09-12' },
    monthEndPolicy: 'clampToLastDay',
    weekendPolicy: 'none',
    remindDaysBefore: 0,
    createdAt: '2026-09-12T10:00:00.000Z',
    updatedAt: '2026-09-12T10:00:00.000Z',
  };
}

/** Testin ihtiyacı kadar depo: yalnızca taşımanın kullandığı işlevler. */
function fakeRepo(seed?: Partial<BackupData>): Repository & { data: BackupData } {
  const data: BackupData = {
    version: 1,
    exportedAt: '2026-09-12T10:00:00.000Z',
    payments: seed?.payments ?? [],
    overrides: seed?.overrides ?? [],
    contacts: seed?.contacts ?? [],
    settings: seed?.settings ?? DEFAULT_SETTINGS,
  };
  const repo = {
    data,
    exportAll: async () => data,
    listPayments: async () => data.payments,
    listOverrides: async () => data.overrides,
    listContacts: async () => data.contacts,
    savePayment: async (p: Payment) => {
      data.payments = [...data.payments.filter((x) => x.id !== p.id), p];
    },
    saveOverride: async (o: Override) => {
      data.overrides = [...data.overrides, o];
    },
    saveContact: async (c: Contact) => {
      data.contacts = [...data.contacts, c];
    },
    saveSettings: async (s: Settings) => {
      data.settings = s;
    },
  };
  return repo as unknown as Repository & { data: BackupData };
}

describe('migrateLocalToCloud', () => {
  it('bulut boşken cihazdaki kayıtları taşır', async () => {
    const local = fakeRepo({ payments: [payment('a', 'kart ödeme')] });
    const cloud = fakeRepo();

    const result = await migrateLocalToCloud(local, cloud);

    expect(result.payments).toBe(1);
    expect(cloud.data.payments.map((p) => p.id)).toEqual(['a']);
  });

  it('bulut doluyken bile eksik kayıtları taşır', async () => {
    const local = fakeRepo({ payments: [payment('a', 'kart ödeme'), payment('b', 'kira')] });
    const cloud = fakeRepo({ payments: [payment('b', 'kira')] });

    const result = await migrateLocalToCloud(local, cloud);

    expect(result.payments).toBe(1);
    expect(cloud.data.payments.map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  it('buluttaki kaydın üzerine yazmaz', async () => {
    const local = fakeRepo({ payments: [payment('a', 'cihazdaki eski ad')] });
    const cloud = fakeRepo({ payments: [payment('a', 'ekibin güncel adı')] });

    const result = await migrateLocalToCloud(local, cloud);

    expect(result.moved).toBe(false);
    expect(cloud.data.payments[0].title).toBe('ekibin güncel adı');
  });

  it('bulut doluyken ekip ayarlarını ezmez', async () => {
    const local = fakeRepo({
      payments: [payment('a', 'kart ödeme')],
      settings: { ...DEFAULT_SETTINGS, documentOwner: 'cihaz' },
    });
    const cloud = fakeRepo({
      payments: [payment('b', 'kira')],
      settings: { ...DEFAULT_SETTINGS, documentOwner: 'ekip' },
    });

    await migrateLocalToCloud(local, cloud);

    expect(cloud.data.settings.documentOwner).toBe('ekip');
  });

  it('cihaz boşsa hiçbir şey yapmaz', async () => {
    const local = fakeRepo();
    const cloud = fakeRepo({ payments: [payment('b', 'kira')] });

    const result = await migrateLocalToCloud(local, cloud);

    expect(result.reason).toBe('yerel-boş');
    expect(cloud.data.payments).toHaveLength(1);
  });

  it('aynı giriş iki kez olursa kopya üretmez', async () => {
    const local = fakeRepo({ payments: [payment('a', 'kart ödeme')] });
    const cloud = fakeRepo();

    await migrateLocalToCloud(local, cloud);
    const second = await migrateLocalToCloud(local, cloud);

    expect(second.payments).toBe(0);
    expect(cloud.data.payments).toHaveLength(1);
  });
});
