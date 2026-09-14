/**
 * "Bu listeyi şuna yolla" paneli.
 * Gün seçilir, kişi seçilir (ya da seçilmez), PDF veya Excel gönderilir.
 */
import { useState } from 'react';
import { formatMoneyShort } from '../domain/money';
import { planToDoc } from '../domain/doc';
import { buildReport } from '../domain/report';
import type { Contact, Currency, ISODate } from '../domain/types';
import { previewExcel, saveDocument, shareDocument } from '../services/share';
import { platformKind } from '../services/platform';
import type { Store } from '../store';
import { Button, Field, inputClass, Sheet } from './components';

export function ShareSheet({
  open,
  store,
  date,
  onClose,
  onResult,
  onManageContacts,
}: {
  open: boolean;
  store: Store;
  date: ISODate;
  onClose: () => void;
  onResult: (message: string) => void;
  onManageContacts: () => void;
}) {
  const [targetDate, setTargetDate] = useState<ISODate>(date);
  const [contactId, setContactId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [lastDate, setLastDate] = useState(date);

  // Panel yeni bir günle açıldığında o güne odaklan
  if (date !== lastDate) {
    setLastDate(date);
    setTargetDate(date);
  }

  if (!open) return null;

  const plan = store.planFor(targetDate);
  const report = buildReport(
    plan,
    store.today,
    store.settings.documentOwner,
    store.settings,
  );
  const doc = planToDoc(report);
  const contact = store.contacts.find((c) => c.id === contactId);
  const totals = Object.entries(plan.totals).filter(([, v]) => v > 0) as [Currency, number][];
  const count = report.rows.length;
  const onAndroid = platformKind() === 'android';

  const run = async (action: () => Promise<{ message: string }>, close = true) => {
    setBusy(true);
    try {
      const result = await action();
      onResult(result.message);
      if (close) onClose();
    } catch (error) {
      onResult(error instanceof Error ? error.message : 'Gönderilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open title="Listeyi gönder" onClose={onClose}>
      <Field label="Hangi günün planı?">
        <input
          type="date"
          className={inputClass}
          value={targetDate}
          onChange={(e) => e.target.value && setTargetDate(e.target.value)}
        />
      </Field>

      {/* Belgenin nasıl görüneceği */}
      <div className="mb-4 overflow-hidden rounded-card border border-line">
        <p
          className="px-3 py-2 text-center text-xs font-bold text-black"
          style={{ backgroundColor: '#92d050' }}
        >
          {report.heading}
        </p>
        <div className="bg-surface-2 px-3 py-2">
          <p className="text-xs text-muted">
            {count > 0 ? `${count} satır` : 'Bu güne ait ödeme yok'}
            {totals.map(([currency, value]) => (
              <span key={currency} className="tnum">
                {' '}
                · {formatMoneyShort(value, currency)}
              </span>
            ))}
          </p>
          <ul className="mt-1.5 max-h-28 space-y-0.5 overflow-y-auto text-[11px] text-ink-soft">
            {report.rows.slice(0, 8).map((row) => (
              <li key={`${row.no}-${row.title}`} className="flex justify-between gap-2">
                <span className="truncate">
                  {row.dateText} · {row.title}
                  {row.note && <span className="text-muted"> — {row.note}</span>}
                </span>
                <span className="tnum shrink-0">
                  {row.amount === null ? '—' : formatMoneyShort(row.amount, row.currency)}
                </span>
              </li>
            ))}
            {report.rows.length > 8 && <li>… {report.rows.length - 8} satır daha</li>}
          </ul>
        </div>
      </div>

      <Field label="Kime?">
        <div className="flex gap-2">
          <select
            className={inputClass}
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
          >
            <option value="">WhatsApp'ta ben seçeyim</option>
            {store.contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button onClick={onManageContacts}>Kişiler</Button>
        </div>
      </Field>

      <div className="mt-5 space-y-2">
        <Button
          variant="primary"
          size="lg"
          full
          disabled={busy}
          onClick={() => run(() => shareDocument('pdf', doc, plan, store.today, contact))}
        >
          📄 PDF gönder
        </Button>
        <Button
          variant="primary"
          size="lg"
          full
          disabled={busy}
          onClick={() => run(() => shareDocument('excel', doc, plan, store.today, contact))}
        >
          📊 Excel gönder
        </Button>
        <div className="flex gap-2">
          <Button size="md" full disabled={busy} onClick={() => run(() => previewExcel(doc), false)}>
            👁 Excel önizle
          </Button>
          <Button size="md" full disabled={busy} onClick={() => run(() => saveDocument('pdf', doc), false)}>
            💾 PDF kaydet
          </Button>
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
        {onAndroid
          ? 'Dosya Belgeler klasörüne kaydedilir ve paylaş menüsünden WhatsApp’a gider.'
          : 'Excel önizleme dosyayı indirir, tablo programında açılır. WhatsApp’a dosya otomatik eklenemediği için indirilen dosyayı sohbete sürüklemen gerekir.'}
      </p>
    </Sheet>
  );
}

/** Kişi rehberi — WhatsApp gönderimi için isim + telefon. */
export function ContactsSheet({
  open,
  store,
  onClose,
  onResult,
}: {
  open: boolean;
  store: Store;
  onClose: () => void;
  onResult: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  if (!open) return null;

  const add = async () => {
    if (!name.trim() || !phone.trim()) return;
    const contact: Contact = {
      id: crypto.randomUUID(),
      name: name.trim(),
      phone: phone.trim(),
      createdAt: new Date().toISOString(),
    };
    await store.saveContact(contact);
    setName('');
    setPhone('');
    onResult(`${contact.name} eklendi`);
  };

  return (
    <Sheet open title="Kişiler" onClose={onClose}>
      <div className="mb-4 space-y-2">
        {store.contacts.length === 0 && (
          <p className="text-sm text-muted">
            Henüz kişi yok. Sık gönderdiğin kişiyi ekleyince listeyi tek dokunuşla
            ona yollayabilirsin.
          </p>
        )}
        {store.contacts.map((contact) => (
          <div
            key={contact.id}
            className="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{contact.name}</p>
              <p className="tnum text-xs text-muted">{contact.phone}</p>
            </div>
            <Button
              size="sm"
              variant="danger"
              onClick={async () => {
                await store.deleteContact(contact.id);
                onResult(`${contact.name} silindi`);
              }}
            >
              Sil
            </Button>
          </div>
        ))}
      </div>

      <div className="border-t border-line pt-4">
        <Field label="Ad">
          <input
            className={inputClass}
            value={name}
            placeholder="Ahmet"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Telefon">
          <input
            className={inputClass}
            value={phone}
            inputMode="tel"
            placeholder="0555 111 22 33"
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
        </Field>
        <Button
          variant="primary"
          full
          size="lg"
          disabled={!name.trim() || !phone.trim()}
          onClick={add}
        >
          Kişi ekle
        </Button>
      </div>
    </Sheet>
  );
}

