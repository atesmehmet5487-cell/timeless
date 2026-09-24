/**
 * Ana ekran: üstte ay takvimi, altında seçili günün ödemeleri.
 * Gecikmiş kalemler bugünün listesinde ayrı bir blokta, en üstte durur.
 */
import * as D from '../domain/date';
import { formatMoneyShort } from '../domain/money';
import type { Currency, ISODate, Occurrence } from '../domain/types';
import type { Store } from '../store';
import { Button, EmptyState } from './components';
import { MonthCalendar } from './MonthCalendar';
import { OccurrenceRow } from './OccurrenceRow';

export function TodayScreen({
  store,
  date,
  month,
  onChangeDate,
  onChangeMonth,
  onEdit,
  onDefer,
  onAdd,
  onCopyIban,
}: {
  store: Store;
  date: ISODate;
  month: ISODate;
  onChangeDate: (date: ISODate) => void;
  onChangeMonth: (month: ISODate) => void;
  onEdit: (occurrence: Occurrence) => void;
  onDefer: (occurrence: Occurrence) => void;
  onAdd: () => void;
  onCopyIban: (iban: string) => void;
}) {
  const plan = store.planFor(date);
  const isToday = date === store.today;
  const monthOccurrences = store.rangeFor(
    D.startOfMonth(month),
    D.lastDayOfMonth(month),
  );
  const totals = Object.entries(plan.totals).filter(([, v]) => v > 0) as [Currency, number][];
  /**
   * Göreli ifade yalnızca yakın günlerde anlamlı; uzaklarda
   * formatRelativeTR tam tarihi döndürüyor ve başlıkla tekrar ediyordu.
   */
  const offset = D.diffDays(store.today, date);
  const relative =
    Math.abs(offset) <= 7 ? D.formatRelativeTR(date, store.today) : null;

  const row = (o: Occurrence) => (
    <OccurrenceRow
      key={`${o.paymentId}-${o.originalDate}`}
      occurrence={o}
      categories={store.settings}
      onCopyIban={onCopyIban}
      onTogglePaid={(paid) =>
        paid
          ? store.setOccurrenceStatus(o, { status: 'paid' })
          : store.clearOccurrenceStatus(o)
      }
      onDefer={() => onDefer(o)}
      onEdit={() => onEdit(o)}
    />
  );

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[360px_1fr] lg:items-start lg:gap-6 lg:space-y-0">
      {/* Sol sütun: takvim (masaüstünde sabit genişlik) */}
      <div className="lg:sticky lg:top-2">
      <MonthCalendar
        month={month}
        selected={date}
        today={store.today}
        occurrences={monthOccurrences}
        onSelect={onChangeDate}
        onMonthChange={onChangeMonth}
      />
      </div>

      {/* Sağ sütun: seçili günün listesi */}
      <div className="space-y-4">
      {/* Seçili günün başlığı */}
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <h2 className="text-[17px] font-semibold leading-tight">
            {D.formatLongTR(date, false)}
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {D.weekdayNameTR(date)}
            {relative && ` · ${relative}`}
            {plan.items.length > 0 && ` · ${plan.items.length} ödeme`}
          </p>
        </div>
        {totals.length > 0 && (
          <p className="tnum shrink-0 text-right text-lg font-semibold">
            {totals.map(([currency, value]) => (
              <span key={currency} className="ml-2">
                {formatMoneyShort(value, currency)}
              </span>
            ))}
          </p>
        )}
      </div>

      {/* Gecikmişler */}
      {plan.overdue.length > 0 && (
        <section>
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-danger">
            Gecikmiş · {plan.overdue.length}
          </h3>
          <div className="space-y-2">{plan.overdue.map(row)}</div>
        </section>
      )}

      {/* Günün kalemleri */}
      {plan.items.length > 0 ? (
        <section className="space-y-2">
          {plan.overdue.length > 0 && (
            <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Bu gün
            </h3>
          )}
          {plan.items.map(row)}
        </section>
      ) : (
        plan.overdue.length === 0 && (
          <EmptyState
            icon="🗓"
            title={isToday ? 'Bugün ödeme yok' : 'Bu güne ödeme yok'}
            hint={`${D.formatLongTR(date, false)} için kayıt ekleyebilirsin.`}
            action={
              <Button variant="primary" onClick={onAdd}>
                + Bu güne ödeme ekle
              </Button>
            }
          />
        )
      )}

      {/* Dolu günlerde de hızlı ekleme */}
      {plan.items.length + plan.overdue.length > 0 && (
        <button
          onClick={onAdd}
          className="w-full rounded-card border border-dashed border-line py-3 text-sm font-medium text-muted transition hover:border-accent hover:text-accent"
        >
          + {D.formatShortTR(date)} için ödeme ekle
        </button>
      )}
      </div>
    </div>
  );
}
