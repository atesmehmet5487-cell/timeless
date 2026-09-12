/**
 * Geçmiş temizliği.
 *
 * Ödenmiş eski işaretler zamanla birikir; bunlar silinince seriler ve gelecek
 * ödemeler bozulmaz, yalnızca "şu gün ödendi" kayıtları gider. Bu yüzden ayrı
 * ve açık bir işlem: ne silineceği önce sayıyla söylenir.
 */
import { useEffect, useState } from 'react';
import * as D from '../domain/date';
import type { Store } from '../store';
import { Button } from './components';

const OPTIONS = [
  { months: 3, label: '3 aydan eski' },
  { months: 6, label: '6 aydan eski' },
  { months: 12, label: '1 yıldan eski' },
] as const;

export function CleanupSection({
  store,
  onResult,
}: {
  store: Store;
  onResult: (message: string) => void;
}) {
  const [months, setMonths] = useState<number>(6);
  const [busy, setBusy] = useState(false);
  const [trashCount, setTrashCount] = useState(0);

  const cutoff = D.addMonths(store.today, -months);
  // Silinecekler: kesim tarihinden eski, ödenmiş işaretler
  const target = store.overrides.filter(
    (o) => o.status === 'paid' && (o.deferredTo ?? o.originalDate) < cutoff,
  ).length;

  useEffect(() => {
    setTrashCount(store.payments.filter((p) => p.deletedAt).length);
  }, [store.payments]);

  const clean = async () => {
    setBusy(true);
    try {
      const removed = await store.repo.purgeOverridesBefore(cutoff);
      await store.reload();
      onResult(
        removed > 0 ? `${removed} eski kayıt temizlendi` : 'Silinecek eski kayıt yok',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <h3 className="mb-1 font-semibold">Geçmiş temizliği</h3>
      <p className="mb-3 text-xs text-muted">
        Eski "ödendi" işaretlerini siler. Ödeme kayıtların ve gelecek tarihlerin
        etkilenmez; yalnızca geçmişin ayrıntısı gider.
      </p>

      <div className="mb-3 grid grid-cols-3 gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.months}
            onClick={() => setMonths(option.months)}
            className={`rounded-xl px-2 py-2 text-xs font-medium transition ${
              months === option.months
                ? 'bg-accent text-white'
                : 'bg-surface-2 text-ink-soft hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className="mb-3 text-xs text-muted">
        {D.formatShortTR(cutoff)} tarihinden eski{' '}
        <span className="font-semibold text-ink">{target}</span> kayıt silinecek.
      </p>

      <Button variant="danger" disabled={busy || target === 0} onClick={clean}>
        🧹 Temizle
      </Button>

      {trashCount > 0 && (
        <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
          Çöp kutusunda {trashCount} kayıt var; 30 gün sonra kendiliğinden silinir.
          Kayıtlar sekmesinden geri alabilirsin.
        </p>
      )}
    </section>
  );
}
