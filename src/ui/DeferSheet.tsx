/**
 * "Bugün ödemedim, şu güne yaz" paneli.
 * Sadece o örneği taşır; seri olduğu gibi kalır.
 */
import { useState } from 'react';
import * as D from '../domain/date';
import type { ISODate, Occurrence } from '../domain/types';
import { Button, Field, inputClass, Sheet } from './components';

export function DeferSheet({
  occurrence,
  onClose,
  onDefer,
}: {
  occurrence: Occurrence | null;
  onClose: () => void;
  onDefer: (date: ISODate) => void;
}) {
  const base = occurrence?.date ?? D.today();
  const [date, setDate] = useState<ISODate>(D.addDays(base, 1));
  const [lastKey, setLastKey] = useState(occurrence?.originalDate);

  if (occurrence && occurrence.originalDate !== lastKey) {
    setLastKey(occurrence.originalDate);
    setDate(D.addDays(occurrence.date, 1));
  }

  if (!occurrence) return null;

  const quick: { label: string; value: ISODate }[] = [
    { label: 'Yarın', value: D.addDays(base, 1) },
    { label: '3 gün sonra', value: D.addDays(base, 3) },
    { label: 'Haftaya', value: D.addDays(base, 7) },
    { label: 'Ay sonu', value: D.lastDayOfMonth(base) },
  ];

  return (
    <Sheet open title="Başka güne taşı" onClose={onClose}>
      <p className="mb-4 text-sm text-muted">
        <span className="font-medium text-white">{occurrence.payment.title}</span> kaydının{' '}
        {D.formatLongTR(occurrence.date, false)} tarihli ödemesi taşınacak. Serinin diğer ayları
        etkilenmez.
      </p>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {quick.map((q) => (
          <button
            key={q.label}
            onClick={() => setDate(q.value)}
            className={`rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              date === q.value ? 'bg-accent text-white' : 'bg-surface-2 text-muted'
            }`}
          >
            {q.label}
            <span className="mt-0.5 block text-[11px] opacity-70">{D.formatShortTR(q.value)}</span>
          </button>
        ))}
      </div>

      <Field label="ya da tarih seç">
        <input
          type="date"
          className={inputClass}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>

      <div className="mt-5">
        <Button variant="primary" size="lg" full onClick={() => onDefer(date)}>
          {D.formatLongTR(date, false)} tarihine taşı
        </Button>
      </div>
    </Sheet>
  );
}
