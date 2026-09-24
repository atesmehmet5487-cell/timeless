/**
 * Kompakt ay takvimi — ana ekranın gezinme aracı.
 *
 * Amaç: "5 gün sonrasına kayıt gireceğim" derken aya bakıp o güne dokunmak,
 * altta o günün listesini açmak. Her günün altındaki nokta o gün ödeme
 * olduğunu, rengi de durumunu söyler.
 */
import * as D from '../domain/date';
import type { ISODate, Occurrence } from '../domain/types';

type DayState = 'none' | 'pending' | 'overdue' | 'paid';

export interface MonthCalendarProps {
  /** Gösterilen ay (ayın herhangi bir günü). */
  month: ISODate;
  selected: ISODate;
  today: ISODate;
  /** Ayın tamamındaki kalemler. */
  occurrences: Occurrence[];
  onSelect: (date: ISODate) => void;
  onMonthChange: (month: ISODate) => void;
}

const WEEKDAY_LABELS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];

function stateOf(list: Occurrence[]): DayState {
  if (list.length === 0) return 'none';
  if (list.some((o) => o.overdue)) return 'overdue';
  if (list.every((o) => o.status === 'paid' || o.status === 'skipped')) return 'paid';
  return 'pending';
}

const DOT_CLASS: Record<Exclude<DayState, 'none'>, string> = {
  pending: 'bg-accent',
  overdue: 'bg-danger',
  paid: 'bg-ok',
};

export function MonthCalendar({
  month,
  selected,
  today,
  occurrences,
  onSelect,
  onMonthChange,
}: MonthCalendarProps) {
  const { year, month: monthNumber } = D.parts(month);
  const first = D.toISO(year, monthNumber, 1);
  const daysInMonth = D.daysInMonth(year, monthNumber);
  // Pazartesi başlangıçlı ızgara
  const leading = D.weekday(first) - 1;

  const byDate = new Map<ISODate, Occurrence[]>();
  for (const occurrence of occurrences) {
    const list = byDate.get(occurrence.date);
    if (list) list.push(occurrence);
    else byDate.set(occurrence.date, [occurrence]);
  }

  const cells: (ISODate | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => D.toISO(year, monthNumber, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <section className="rounded-card border border-line bg-surface p-3">
      <header className="mb-2 flex items-center justify-between px-1">
        <button
          onClick={() => onMonthChange(D.addMonths(first, -1))}
          className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft transition hover:bg-surface-2"
          aria-label="Önceki ay"
        >
          ‹
        </button>

        <div className="text-center">
          <p className="text-sm font-semibold">
            {D.monthNameTR(monthNumber)} {year}
          </p>
          {D.startOfMonth(today) !== first && (
            <button
              onClick={() => {
                onMonthChange(today);
                onSelect(today);
              }}
              className="text-[11px] font-medium text-accent"
            >
              bugüne dön
            </button>
          )}
        </div>

        <button
          onClick={() => onMonthChange(D.addMonths(first, 1))}
          className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft transition hover:bg-surface-2"
          aria-label="Sonraki ay"
        >
          ›
        </button>
      </header>

      <div className="grid grid-cols-7 gap-y-1">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1 text-center text-[11px] font-medium text-muted">
            {label}
          </div>
        ))}

        {cells.map((date, index) => {
          if (!date) return <div key={`bos-${index}`} />;

          const list = byDate.get(date) ?? [];
          const state = stateOf(list);
          const isSelected = date === selected;
          const isToday = date === today;
          const isWeekend = D.isWeekend(date);

          return (
            <button
              key={date}
              onClick={() => onSelect(date)}
              aria-current={isToday ? 'date' : undefined}
              aria-label={`${D.formatLongTR(date)}${list.length > 0 ? `, ${list.length} ödeme` : ''}`}
              className={`relative mx-auto grid h-10 w-10 place-items-center rounded-xl text-sm transition ${
                isSelected
                  ? 'bg-accent font-semibold text-white'
                  : isToday
                    ? 'bg-accent-soft font-semibold text-accent'
                    : isWeekend
                      ? 'text-muted hover:bg-surface-2'
                      : 'text-ink hover:bg-surface-2'
              }`}
            >
              <span className="tnum leading-none">{D.parts(date).day}</span>
              {state !== 'none' && (
                <span
                  className={`absolute bottom-1.5 h-1.5 w-1.5 rounded-full ${
                    isSelected ? 'bg-white/90' : DOT_CLASS[state]
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
