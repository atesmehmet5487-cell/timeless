/**
 * Bir ödeme satırı.
 *
 * Ödendi bilgisi tik kutucuğuyla verilir: işaretli = ödendi, boş = ödenmedi.
 * Ayrı bir "ödemedim" işareti yok — kutucuğun boş olması zaten bunu söylüyor.
 */
import * as D from '../domain/date';
import { formatMoneyShort } from '../domain/money';
import { categoryLabel, type CustomCategory } from '../domain/category';
import { formatIban } from '../domain/iban';
import type { Occurrence } from '../domain/types';
import { Button } from './components';

const STATUS_STYLE: Record<Occurrence['status'], string> = {
  pending: 'border-line',
  paid: 'border-ok/40 bg-ok/5',
  deferred: 'border-warn/40 bg-warn/5',
  skipped: 'border-line opacity-50',
};

export function OccurrenceRow({
  occurrence,
  categories,
  onTogglePaid,
  onDefer,
  onEdit,
  onCopyIban,
}: {
  occurrence: Occurrence;
  categories: CustomCategory[];
  /** IBAN'ı panoya kopyalar. */
  onCopyIban?: (iban: string) => void;
  /** Tik kutucuğu: ödendi ↔ ödenmedi. */
  onTogglePaid: (paid: boolean) => void;
  onDefer: () => void;
  onEdit: () => void;
}) {
  const { payment, status, overdue, movedFrom, date } = occurrence;
  const paid = status === 'paid';

  return (
    <div
      className={`rounded-2xl border bg-surface p-3.5 ${STATUS_STYLE[status]} ${
        overdue ? 'border-danger/50' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={paid}
          label={`${payment.title} ödendi olarak işaretle`}
          onChange={onTogglePaid}
        />

        <div className="min-w-0 flex-1">
          <p className={`truncate font-medium ${paid ? 'text-muted line-through' : ''}`}>
            {payment.title}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span>{categoryLabel(payment.category, categories)}</span>
            <span>·</span>
            <span>{D.formatShortTR(date)}</span>
            {payment.remindAt && <span>· {payment.remindAt}</span>}
            <span className={paid ? 'text-ok' : overdue ? 'text-danger' : 'text-muted'}>
              · {paid ? 'ödendi' : 'ödenmedi'}
            </span>
            {movedFrom && (
              <span className="rounded-md bg-warn/15 px-1.5 py-0.5 text-warn">
                {D.formatShortTR(movedFrom)} tarihinden ertelendi
              </span>
            )}
            {overdue && (
              <span className="rounded-md bg-danger/15 px-1.5 py-0.5 font-medium text-danger">
                {D.diffDays(date, D.today())} gün gecikti
              </span>
            )}
          </p>
        </div>

        {typeof payment.amount === 'number' && (
          <p className={`shrink-0 font-semibold ${paid ? 'text-muted line-through' : ''}`}>
            {formatMoneyShort(payment.amount, payment.currency)}
          </p>
        )}
      </div>

      {payment.iban && (
        <button
          onClick={() => onCopyIban?.(payment.iban!)}
          title="IBAN'ı kopyala"
          className="tnum mt-2 ml-9 block max-w-full truncate rounded-lg bg-surface-2 px-2 py-1 text-left text-[11px] text-ink-soft transition hover:text-accent"
        >
          🏦 {formatIban(payment.iban)}
        </button>
      )}

      <div className="mt-3 flex flex-wrap gap-2 pl-9">
        {!paid && (
          <Button size="sm" onClick={onDefer}>
            ↪ Ertele
          </Button>
        )}
        <Button size="sm" onClick={onEdit}>
          ✎ Düzenle
        </Button>
      </div>
    </div>
  );
}

/** Dokunması kolay, erişilebilir tik kutucuğu. */
export function Checkbox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 text-sm font-bold transition ${
        checked
          ? 'border-ok bg-ok text-white'
          : 'border-line bg-surface-2 text-transparent hover:border-ok/60'
      }`}
    >
      ✓
    </button>
  );
}
