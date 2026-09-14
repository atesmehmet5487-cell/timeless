/** Ödeme ekleme / düzenleme formu. */
import { useState } from 'react';
import * as D from '../domain/date';
import { parseMoney } from '../domain/money';
import { guessCategory } from '../nlp/extract';
import type { NewPaymentInput } from '../domain/payment';
import {
  categoryOptions,
  makeCategoryId,
  resolveCategory,
  type CategorySettings,
  type CustomCategory,
} from '../domain/category';
import { checkIban, formatIban, normalizeIban } from '../domain/iban';
import type {
  Category,
  Currency,
  Payment,
  Recurrence,
  Weekday,
  WeekendPolicy,
} from '../domain/types';
import { Button, Field, inputClass, Sheet } from './components';

type RepeatKind = 'once' | 'monthly' | 'weekly' | 'yearly';

const WEEKDAYS: { value: Weekday; label: string }[] = [
  { value: 1, label: 'Pazartesi' },
  { value: 2, label: 'Salı' },
  { value: 3, label: 'Çarşamba' },
  { value: 4, label: 'Perşembe' },
  { value: 5, label: 'Cuma' },
  { value: 6, label: 'Cumartesi' },
  { value: 7, label: 'Pazar' },
];

export interface PaymentDraft {
  title: string;
  amountText: string;
  currency: Currency;
  category: Category;
  repeat: RepeatKind;
  /** repeat === 'once' | 'yearly' için tam tarih. */
  date: string;
  /** repeat === 'monthly' için ayın günü. */
  day: number;
  weekday: Weekday;
  remindAt: string;
  weekendPolicy: WeekendPolicy;
  /** Zorunlu değil; boş bırakılabilir. */
  iban: string;
  note: string;
}

export function emptyDraft(today = D.today()): PaymentDraft {
  return {
    title: '',
    amountText: '',
    currency: 'TRY',
    category: 'diger',
    // Varsayılan tek seferlik: takvimden seçilen güne kayıt eklemek en sık iş
    repeat: 'once',
    date: today,
    day: D.parts(today).day,
    weekday: D.weekday(today),
    remindAt: '',
    weekendPolicy: 'none',
    iban: '',
    note: '',
  };
}

export function draftFromPayment(p: Payment): PaymentDraft {
  const base = emptyDraft();
  const r = p.recurrence;
  const date =
    r.type === 'once'
      ? r.date
      : r.type === 'yearly'
        ? D.toISO(D.parts(r.from).year, r.month, r.day)
        : r.from;
  return {
    ...base,
    title: p.title,
    amountText: p.amount != null ? String(p.amount).replace('.', ',') : '',
    currency: p.currency,
    category: p.category,
    note: p.note ?? '',
    iban: p.iban ? formatIban(p.iban) : '',
    remindAt: p.remindAt ?? '',
    weekendPolicy: p.weekendPolicy,
    repeat: r.type === 'everyNDays' ? 'monthly' : r.type,
    date,
    day: r.type === 'monthly' ? r.day : base.day,
    weekday: r.type === 'weekly' ? r.weekday : base.weekday,
  };
}

export function draftToInput(draft: PaymentDraft, today = D.today()): NewPaymentInput {
  const recurrence: Recurrence = (() => {
    switch (draft.repeat) {
      case 'once':
        return { type: 'once', date: draft.date };
      case 'monthly':
        return { type: 'monthly', day: draft.day, from: today };
      case 'weekly':
        return { type: 'weekly', weekday: draft.weekday, from: today };
      case 'yearly': {
        const { month, day } = D.parts(draft.date);
        return { type: 'yearly', month, day, from: today };
      }
    }
  })();

  return {
    title: draft.title,
    amount: parseMoney(draft.amountText) ?? undefined,
    currency: draft.currency,
    category: draft.category,
    note: draft.note.trim() || undefined,
    iban: normalizeIban(draft.iban) || undefined,
    remindAt: draft.remindAt || undefined,
    weekendPolicy: draft.weekendPolicy,
    recurrence,
  };
}

export function PaymentSheet({
  open,
  initial,
  title = 'Yeni ödeme',
  onClose,
  onSave,
  onDelete,
  categories,
  onAddCategory,
}: {
  open: boolean;
  initial: PaymentDraft;
  title?: string;
  onClose: () => void;
  onSave: (input: NewPaymentInput) => void | Promise<void>;
  onDelete?: () => void;
  /** Kategori adları, silinenler ve kullanıcının eklediği kategoriler. */
  categories: CategorySettings;
  /** Yeni kategori kaydeder ve seçili hâle getirir. */
  onAddCategory: (category: CustomCategory) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<PaymentDraft>(initial);
  const [lastInitial, setLastInitial] = useState(initial);
  /** Kullanıcı kategoriyi elle seçtiyse başlıktan tahmin etmeyi bırakırız. */
  const [categoryTouched, setCategoryTouched] = useState(false);

  // Panel yeni bir taslakla açıldığında formu tazele
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setDraft(initial);
    setCategoryTouched(initial.category !== 'diger');
  }

  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  const set = <K extends keyof PaymentDraft>(key: K, value: PaymentDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const saveCategory = async () => {
    const label = newCategory.trim();
    if (!label) return;
    const category: CustomCategory = { id: makeCategoryId(label), label };
    await onAddCategory(category);
    setCategoryTouched(true);
    set('category', category.id);
    setNewCategory('');
    setAddingCategory(false);
  };

  const ibanCheck = checkIban(draft.iban);

  const canSave = draft.title.trim().length > 0;

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <Field label="Ne ödemesi?">
        <input
          className={inputClass}
          value={draft.title}
          autoFocus
          placeholder="Ziraat kart ödeme"
          onChange={(e) => {
            const title = e.target.value;
            setDraft((d) => ({
              ...d,
              title,
              // Tahmin edilen kategori silinmişse "Diğer"e düşer
              category: categoryTouched
                ? d.category
                : resolveCategory(guessCategory(title), categories),
            }));
          }}
        />
      </Field>

      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="Tutar (isteğe bağlı)">
            <input
              className={inputClass}
              inputMode="decimal"
              value={draft.amountText}
              placeholder="1.500"
              onChange={(e) => set('amountText', e.target.value)}
            />
          </Field>
        </div>
        <div className="w-28">
          <Field label="Birim">
            <select
              className={inputClass}
              value={draft.currency}
              onChange={(e) => set('currency', e.target.value as Currency)}
            >
              <option value="TRY">₺ TL</option>
              <option value="USD">$ USD</option>
              <option value="EUR">€ EUR</option>
            </select>
          </Field>
        </div>
      </div>

      <Field label="Kategori">
        <div className="flex gap-2">
          <select
            className={inputClass}
            // Kaydın kategorisi sonradan silindiyse listede "Diğer" seçili görünür
            value={resolveCategory(draft.category, categories)}
            onChange={(e) => {
              setCategoryTouched(true);
              set('category', e.target.value as Category);
            }}
          >
            {categoryOptions(categories).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <Button onClick={() => setAddingCategory((open) => !open)} title="Yeni kategori ekle">
            {addingCategory ? '✕' : '+'}
          </Button>
        </div>

        {addingCategory && (
          <div className="mt-2 flex gap-2">
            <input
              className={inputClass}
              value={newCategory}
              autoFocus
              placeholder="Kategori adı"
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveCategory()}
            />
            <Button variant="primary" disabled={!newCategory.trim()} onClick={saveCategory}>
              Ekle
            </Button>
          </div>
        )}
      </Field>

      <Field label="Ne zaman?">
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              ['once', 'Tek sefer'],
              ['weekly', 'Her hafta'],
              ['monthly', 'Her ay'],
              ['yearly', 'Her yıl'],
            ] as [RepeatKind, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => set('repeat', value)}
              className={`rounded-xl px-2 py-2 text-xs font-medium transition ${
                draft.repeat === value ? 'bg-accent text-white' : 'bg-surface-2 text-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>

      {draft.repeat === 'monthly' && (
        <Field label="Ayın kaçında?">
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={31}
              className={`${inputClass} w-24`}
              value={draft.day}
              onChange={(e) => set('day', Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
            />
            <span className="text-xs text-muted">
              {draft.day === 31
                ? 'Ayın son günü (28/30/31 kendiliğinden ayarlanır)'
                : `Her ayın ${D.dayOrdinalTR(draft.day)}`}
            </span>
          </div>
        </Field>
      )}

      {draft.repeat === 'weekly' && (
        <Field label="Hangi gün?">
          <select
            className={inputClass}
            value={draft.weekday}
            onChange={(e) => set('weekday', Number(e.target.value) as Weekday)}
          >
            {WEEKDAYS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      {(draft.repeat === 'once' || draft.repeat === 'yearly') && (
        <Field label={draft.repeat === 'once' ? 'Tarih' : 'Hangi gün (her yıl)'}>
          <input
            type="date"
            className={inputClass}
            value={draft.date}
            onChange={(e) => set('date', e.target.value)}
          />
        </Field>
      )}

      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="Ek hatırlatma saati">
            <input
              type="time"
              className={inputClass}
              value={draft.remindAt}
              onChange={(e) => set('remindAt', e.target.value)}
            />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Hafta sonuna denk gelirse">
            <select
              className={inputClass}
              value={draft.weekendPolicy}
              onChange={(e) => set('weekendPolicy', e.target.value as WeekendPolicy)}
            >
              <option value="none">Aynı gün kalsın</option>
              <option value="previousWorkday">Önceki iş günü</option>
              <option value="nextWorkday">Sonraki iş günü</option>
            </select>
          </Field>
        </div>
      </div>

      <Field label="IBAN (isteğe bağlı)">
        <input
          className={inputClass}
          value={draft.iban}
          inputMode="text"
          placeholder="TR00 0000 0000 0000 0000 0000 00"
          onChange={(e) => set('iban', e.target.value)}
          onBlur={() => draft.iban && set('iban', formatIban(draft.iban))}
        />
        {ibanCheck.state === 'valid' && (
          <span className="mt-1 block text-xs text-ok">IBAN geçerli görünüyor</span>
        )}
        {ibanCheck.state === 'suspicious' && (
          <span className="mt-1 block text-xs text-warn">{ibanCheck.message}</span>
        )}
      </Field>

      <Field label="Not">
        <input
          className={inputClass}
          value={draft.note}
          placeholder="isteğe bağlı"
          onChange={(e) => set('note', e.target.value)}
        />
      </Field>

      <div className="mt-5 flex gap-2">
        <Button
          variant="primary"
          size="lg"
          full
          disabled={!canSave}
          onClick={() => onSave(draftToInput(draft))}
        >
          Kaydet
        </Button>
        {onDelete && (
          <Button variant="danger" size="lg" onClick={onDelete}>
            Sil
          </Button>
        )}
      </div>
    </Sheet>
  );
}
