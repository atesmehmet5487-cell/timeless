/**
 * Gider tablosu: seçilen dönemde ne kadar ödeme var, ne kadarı hangi kategoriden.
 *
 * Görselleştirme tek seri (kategori toplamı) olduğu için renk kimlik taşımaz;
 * uzunluk büyüklüğü, yanındaki sayılar kesin değeri verir. Bu yüzden ayrı bir
 * gösterge kutusuna gerek yok.
 */
import { useState } from 'react';
import * as D from '../domain/date';
import { statsToDoc } from '../domain/doc';
import { formatMoneyShort } from '../domain/money';
import {
  PERIOD_LABELS,
  shiftPeriod,
  summarizePeriod,
  type CategoryStat,
  type PeriodKind,
} from '../domain/stats';
import type { Store } from '../store';
import { previewExcel, saveDocument } from '../services/share';
import { Button, EmptyState } from './components';

const PERIODS: PeriodKind[] = ['day', 'week', 'month', 'year'];

export function ReportScreen({
  store,
  onResult,
}: {
  store: Store;
  onResult: (message: string) => void;
}) {
  const [kind, setKind] = useState<PeriodKind>('month');
  const [anchor, setAnchor] = useState(store.today);
  const [busy, setBusy] = useState(false);

  const stats = summarizePeriod(store.payments, store.overrides, kind, anchor, {
    today: store.today,
    currency: store.settings.defaultCurrency,
    categories: store.settings.customCategories,
  });

  const currency = stats.currency;
  const isCurrent = D.today() >= stats.from && D.today() <= stats.to;
  const doc = statsToDoc(stats, store.settings.documentOwner, store.today);

  const run = async (action: () => Promise<{ message: string }>) => {
    setBusy(true);
    try {
      onResult((await action()).message);
    } catch (error) {
      onResult(error instanceof Error ? error.message : 'Belge oluşturulamadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Dönem seçimi */}
      <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
        {PERIODS.map((period) => (
          <button
            key={period}
            onClick={() => {
              setKind(period);
              setAnchor(store.today);
            }}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              kind === period ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
            }`}
          >
            {PERIOD_LABELS[period]}
          </button>
        ))}
      </div>

      {/* Dönem gezinme */}
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" onClick={() => setAnchor(shiftPeriod(kind, anchor, -1))}>
          ‹
        </Button>
        <div className="text-center">
          <p className="text-sm font-semibold">{stats.label}</p>
          {!isCurrent && (
            <button className="text-[11px] text-accent" onClick={() => setAnchor(store.today)}>
              bu döneme dön
            </button>
          )}
        </div>
        <Button size="sm" onClick={() => setAnchor(shiftPeriod(kind, anchor, 1))}>
          ›
        </Button>
      </div>

      {/* Toplam */}
      <section className="rounded-card border border-line bg-surface p-4">
        <p className="text-xs text-muted">Dönem gideri</p>
        <p className="tnum mt-1 text-3xl font-semibold leading-none">
          {formatMoneyShort(stats.total, currency)}
        </p>
        <p className="mt-1.5 text-xs text-muted">
          {stats.count} ödeme · günlük ortalama {formatMoneyShort(stats.dailyAverage, currency)}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
          <Stat label="Ödendi" value={formatMoneyShort(stats.paid, currency)} tone="ok" />
          <Stat label="Kalan" value={formatMoneyShort(stats.pending, currency)} tone="ink" />
          <Stat
            label="Gecikmiş"
            value={formatMoneyShort(stats.overdue, currency)}
            tone={stats.overdue > 0 ? 'danger' : 'muted'}
          />
        </div>

        {stats.otherCurrencies.length > 0 && (
          <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
            Ayrıca:{' '}
            {stats.otherCurrencies
              .map((other) => formatMoneyShort(other.total, other.currency))
              .join(' · ')}
          </p>
        )}
      </section>

      {/* Kategori dağılımı */}
      {stats.byCategory.length > 0 ? (
        <section className="rounded-card border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold">Kategoriye göre</h3>
          <div className="space-y-3">
            {stats.byCategory.map((item) => (
              <CategoryBar key={item.id} item={item} currency={currency} />
            ))}
          </div>
        </section>
      ) : (
        <EmptyState
          icon="📊"
          title="Bu dönemde ödeme yok"
          hint="Başka bir döneme geçebilir ya da yeni ödeme ekleyebilirsin."
        />
      )}

      {/* Çıktılar — ödeme planıyla aynı yeşil başlıklı tablo düzeni */}
      <div className="flex gap-2">
        <Button
          variant="primary"
          size="lg"
          full
          disabled={busy}
          onClick={() => run(() => saveDocument('pdf', doc))}
        >
          📄 PDF
        </Button>
        <Button
          variant="primary"
          size="lg"
          full
          disabled={busy}
          onClick={() => run(() => previewExcel(doc))}
        >
          📊 Excel
        </Button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'ok' | 'ink' | 'danger' | 'muted';
}) {
  const tones = {
    ok: 'text-ok',
    ink: 'text-ink',
    danger: 'text-danger',
    muted: 'text-muted',
  };
  return (
    <div>
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`tnum mt-0.5 text-sm font-semibold ${tones[tone]}`}>{value}</p>
    </div>
  );
}

function CategoryBar({ item, currency }: { item: CategoryStat; currency: 'TRY' | 'USD' | 'EUR' }) {
  const percent = Math.round(item.share * 100);
  return (
    <div title={`${item.label}: ${formatMoneyShort(item.total, currency)} (%${percent})`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm">{item.label}</span>
        <span className="tnum shrink-0 text-sm font-semibold">
          {formatMoneyShort(item.total, currency)}
        </span>
      </div>

      {/* İnce çubuk: uzunluk büyüklüğü gösterir, uçları yuvarlatılmış */}
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.max(item.share * 100, 2)}%` }}
        />
      </div>

      <p className="mt-1 text-[11px] text-muted">
        %{percent} · {item.count} ödeme
        {item.paid > 0 && ` · ${formatMoneyShort(item.paid, currency)} ödendi`}
      </p>
    </div>
  );
}
