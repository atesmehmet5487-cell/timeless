/**
 * Ayarlar içindeki yedekleme bölümü.
 *
 * Geri yükleme iki adımlı: dosya seçilir, ne geleceği gösterilir, sonra
 * onaylanır. Veri üzerine yazmak geri alınamaz bir iş, sessizce yapılmamalı.
 */
import { useRef, useState } from 'react';
import * as D from '../domain/date';
import {
  exportBackup,
  readBackupFile,
  restoreBackup,
  type BackupSummary,
} from '../services/backup';
import type { BackupData } from '../services/repo';
import type { Store } from '../store';
import { Button } from './components';

export function BackupSection({
  store,
  onResult,
}: {
  store: Store;
  onResult: (message: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ data: BackupData; summary: BackupSummary } | null>(null);
  const [busy, setBusy] = useState(false);

  const lastBackup = store.settings.lastBackupAt;
  const staleDays = lastBackup
    ? D.diffDays(D.today(new Date(lastBackup)), store.today)
    : null;

  const takeBackup = async () => {
    setBusy(true);
    try {
      const summary = await exportBackup(store.repo);
      await store.saveSettings({ ...store.settings, lastBackupAt: new Date().toISOString() });
      onResult(`Yedek indirildi — ${summary.payments} kayıt`);
    } catch (error) {
      onResult(error instanceof Error ? error.message : 'Yedek alınamadı');
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = await readBackupFile(file);
      const { payments, overrides, contacts, exportedAt } = data;
      setPending({
        data,
        summary: {
          payments: payments.length,
          overrides: overrides.length,
          contacts: contacts.length,
          exportedAt,
        },
      });
    } catch (error) {
      onResult(error instanceof Error ? error.message : 'Dosya okunamadı');
    }
  };

  const apply = async (mode: 'replace' | 'merge') => {
    if (!pending) return;
    setBusy(true);
    try {
      const summary = await restoreBackup(store.repo, pending.data, mode);
      await store.reload();
      setPending(null);
      onResult(
        mode === 'replace'
          ? `Geri yüklendi — ${summary.payments} kayıt`
          : `Birleştirildi — ${summary.payments} kayıt işlendi`,
      );
    } catch (error) {
      onResult(error instanceof Error ? error.message : 'Geri yüklenemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <h3 className="mb-1 font-semibold">Yedekleme</h3>
      <p className="mb-3 text-xs text-muted">
        Kayıtların yalnızca bu cihazda duruyor. Telefon ya da bilgisayar değişirse
        tek geri dönüş yolu yedek dosyasıdır.
      </p>

      {lastBackup ? (
        <p
          className={`mb-3 text-xs ${
            staleDays !== null && staleDays > 30 ? 'text-warn' : 'text-muted'
          }`}
        >
          Son yedek: {D.formatLongTR(D.today(new Date(lastBackup)), false)}
          {staleDays !== null && staleDays > 30 && ' — bir aydan eski, yenilemek iyi olur'}
        </p>
      ) : (
        <p className="mb-3 text-xs text-warn">Henüz yedek alınmadı.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy} onClick={takeBackup}>
          💾 Yedek al
        </Button>
        <Button disabled={busy} onClick={() => fileInput.current?.click()}>
          📂 Yedekten geri yükle
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            void pickFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      {pending && (
        <div className="mt-4 rounded-xl border border-warn/40 bg-warn-soft p-3">
          <p className="text-sm font-medium">Yedek dosyası okundu</p>
          <p className="mt-1 text-xs text-ink-soft">
            {pending.summary.payments} ödeme · {pending.summary.overrides} işaret ·{' '}
            {pending.summary.contacts} kişi
            <br />
            Yedek tarihi:{' '}
            {D.formatLongTR(D.today(new Date(pending.summary.exportedAt)), false)}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="danger" disabled={busy} onClick={() => apply('replace')}>
              Mevcut verinin yerine koy
            </Button>
            <Button disabled={busy} onClick={() => apply('merge')}>
              Mevcutla birleştir
            </Button>
            <Button disabled={busy} onClick={() => setPending(null)}>
              Vazgeç
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-ink-soft">
            "Yerine koy" şu anki kayıtları siler. Emin değilsen önce yedek al.
          </p>
        </div>
      )}
    </section>
  );
}
