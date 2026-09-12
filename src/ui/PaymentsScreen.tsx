/** Kayıtlı ödeme serileri: düzenleme, arşivleme, çöp kutusu. */
import * as D from '../domain/date';
import { formatMoneyShort } from '../domain/money';
import { describeRecurrence } from '../domain/recurrence';
import { categoryLabel } from '../domain/category';
import type { Payment } from '../domain/types';
import type { Store } from '../store';
import { Button, EmptyState } from './components';

export function PaymentsScreen({
  store,
  onEdit,
}: {
  store: Store;
  onEdit: (payment: Payment) => void;
}) {
  const active = store.payments.filter((p) => !p.deletedAt && !p.archivedAt);
  const archived = store.payments.filter((p) => !p.deletedAt && p.archivedAt);
  const trashed = store.payments.filter((p) => p.deletedAt);

  // "Sıradaki" ertelemeleri de hesaba katmalı — bu yüzden seriden değil,
  // gerçek plandan okunuyor.
  const upcoming = store.rangeFor(store.today, D.addDays(store.today, 400));
  const nextByPayment = new Map<string, string>();
  for (const o of upcoming) {
    if (o.status === 'paid' || o.status === 'skipped') continue;
    if (!nextByPayment.has(o.paymentId)) nextByPayment.set(o.paymentId, o.date);
  }

  if (store.payments.length === 0) {
    return <EmptyState icon="📋" title="Henüz kayıt yok" hint="İlk ödemeni ekleyerek başla." />;
  }

  return (
    <div className="space-y-6">
      <Section title={`Aktif (${active.length})`}>
        {active.map((p) => (
          <PaymentCard
            key={p.id}
            payment={p}
            next={nextByPayment.get(p.id)}
            categoryText={categoryLabel(p.category, store.settings.customCategories)}
            onEdit={() => onEdit(p)}
            actions={
              <>
                <Button size="sm" onClick={() => store.updatePayment({ ...p, archivedAt: new Date().toISOString() })}>
                  📦 Arşivle
                </Button>
                <Button size="sm" variant="danger" onClick={() => store.trashPayment(p.id)}>
                  🗑 Sil
                </Button>
              </>
            }
          />
        ))}
      </Section>

      {archived.length > 0 && (
        <Section title={`Arşiv (${archived.length})`}>
          {archived.map((p) => (
            <PaymentCard
              key={p.id}
              payment={p}
              next={nextByPayment.get(p.id)}
              categoryText={categoryLabel(p.category, store.settings.customCategories)}
              onEdit={() => onEdit(p)}
              actions={
                <Button size="sm" onClick={() => store.updatePayment({ ...p, archivedAt: undefined })}>
                  ↩ Geri yükle
                </Button>
              }
            />
          ))}
        </Section>
      )}

      {trashed.length > 0 && (
        <Section title={`Çöp kutusu (${trashed.length}) — 30 gün sonra kalıcı silinir`}>
          {trashed.map((p) => (
            <PaymentCard
              key={p.id}
              payment={p}
              categoryText={categoryLabel(p.category, store.settings.customCategories)}
              actions={
                <>
                  <Button size="sm" onClick={() => store.restorePayment(p.id)}>
                    ↩ Geri al
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => store.purgePayment(p.id)}>
                    Kalıcı sil
                  </Button>
                </>
              }
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-muted">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function PaymentCard({
  payment,
  next,
  categoryText,
  onEdit,
  actions,
}: {
  payment: Payment;
  /** Ertelemeler hesaba katılmış bir sonraki ödeme günü. */
  next?: string;
  categoryText: string;
  onEdit?: () => void;
  actions: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border border-line bg-surface p-3.5 ${payment.deletedAt ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{payment.title}</p>
          <p className="mt-0.5 text-xs text-muted">
            {describeRecurrence(payment)} · {categoryText}
            {next && <> · sıradaki: {D.formatShortTR(next)}</>}
          </p>
        </div>
        {typeof payment.amount === 'number' && (
          <p className="shrink-0 font-semibold">
            {formatMoneyShort(payment.amount, payment.currency)}
          </p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {onEdit && (
          <Button size="sm" onClick={onEdit}>
            ✎ Düzenle
          </Button>
        )}
        {actions}
      </div>
    </div>
  );
}
