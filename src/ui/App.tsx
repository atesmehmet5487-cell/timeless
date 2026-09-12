import { useCallback, useEffect, useState } from 'react';
import * as D from '../domain/date';
import { createPayment, findDuplicate, type NewPaymentInput } from '../domain/payment';
import { speakableSummary } from '../domain/summary';
import type { ISODate, Occurrence, Payment } from '../domain/types';
import type { Action, PendingOccurrenceAction } from '../nlp/commands';
import { registerNotificationActions } from '../services/notify';
import { speak, stopSpeaking, warmUpVoices } from '../services/tts';
import { useStore } from '../store';
import { Button, Sheet } from './components';
import { AuthSheet } from './AuthSheet';
import { DeferSheet } from './DeferSheet';
import { LockScreen } from './LockScreen';
import { PaymentsScreen } from './PaymentsScreen';
import { ReportScreen } from './ReportScreen';
import { ContactsSheet, ShareSheet } from './ShareSheet';
import { SettingsScreen } from './SettingsScreen';
import { PaymentSheet, draftFromPayment, emptyDraft, type PaymentDraft } from './PaymentSheet';
import { TodayScreen } from './TodayScreen';
import { TitleBar } from './TitleBar';
import { Toast, useToast } from './Toast';
import { VoiceSheet } from './VoiceSheet';

type Tab = 'today' | 'payments' | 'report' | 'settings';

/** Üst bardaki hızlı eylem simgesi. */
function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-base transition hover:brightness-95 active:scale-95"
    >
      {children}
    </button>
  );
}

export function App() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>('today');
  const [date, setDate] = useState<ISODate>(D.today());
  /** Takvimde görünen ay — gün seçimi ayı da takip eder. */
  const [month, setMonth] = useState<ISODate>(D.startOfMonth(D.today()));

  const selectDate = useCallback((next: ISODate) => {
    setDate(next);
    setMonth(D.startOfMonth(next));
  }, []);

  const [sheet, setSheet] = useState<{ draft: PaymentDraft; editing?: Payment } | null>(null);
  const [deferring, setDeferring] = useState<Occurrence | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [chooser, setChooser] = useState<{
    candidates: Occurrence[];
    next: PendingOccurrenceAction;
  } | null>(null);
  const [paymentChooser, setPaymentChooser] = useState<Payment[] | null>(null);
  /** Mükerrer uyarısı gösterilen kayıt — ikinci kaydet onay sayılır. */
  const [pendingDuplicate, setPendingDuplicate] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareDate, setShareDate] = useState<ISODate>(D.today());
  const [contactsOpen, setContactsOpen] = useState(false);
  const { toast, show } = useToast();
  /** PIN kurulmuşsa uygulama kilitli başlar. */
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => warmUpVoices(), []);

  // İlk girişte cihaz kayıtları buluta taşındıysa kullanıcıya söyle
  useEffect(() => {
    if (!store.cloudNotice) return;
    show(store.cloudNotice);
    store.dismissCloudNotice();
  }, [store.cloudNotice, store, show]);

  // Tema seçimi belgeye uygulanır; CSS değişkenleri buradan okunur
  useEffect(() => {
    const root = document.documentElement;
    if (store.settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = store.settings.theme;
    root.dataset.accent = store.settings.accent;
  }, [store.settings.theme, store.settings.accent]);

  // Bildirimdeki "Ödendi" düğmesi ve bildirime dokunma
  useEffect(() => {
    void registerNotificationActions({
      onMarkPaid: (paymentId, originalDate) => {
        const target = store
          .rangeFor(D.addDays(originalDate, -1), D.addDays(originalDate, 1))
          .find((o) => o.paymentId === paymentId && o.originalDate === originalDate);
        if (target) void store.setOccurrenceStatus(target, { status: 'paid' });
      },
      onOpen: (date) => {
        setTab('today');
        selectDate(date);
      },
    });
  }, [store, selectDate]);

  const plan = store.planFor(date);
  const todayPlan = store.planFor(store.today);

  /**
   * Sesli komutun eşleştirebileceği açık kalemler: gecikmişler + önümüzdeki
   * 60 gün. Her seriden yalnızca en yakın tarihli örnek alınır; aksi hâlde
   * "ziraat kartını ödedim" aynı serinin üç ayına birden eşleşir ve
   * kullanıcıya gereksiz bir seçim listesi çıkardı.
   */
  const openOccurrences = (() => {
    const upcoming = store.rangeFor(store.today, D.addDays(store.today, 60));
    const seen = new Set<string>();
    const out: Occurrence[] = [];
    for (const o of [...todayPlan.overdue, ...upcoming]) {
      if (o.status === 'paid' || o.status === 'skipped') continue;
      if (seen.has(o.paymentId)) continue;
      seen.add(o.paymentId);
      out.push(o);
    }
    return out;
  })();

  const openNew = () => setSheet({ draft: emptyDraft(date) });
  const openEdit = (payment: Payment) =>
    setSheet({ draft: draftFromPayment(payment), editing: payment });

  const savePayment = async (input: NewPaymentInput) => {
    // Aynı başlık + aynı tekrar kuralı: büyük ihtimalle yanlışlıkla iki kez giriliyor
    if (!sheet?.editing) {
      const candidate = createPayment(input, store.settings);
      const duplicate = findDuplicate(store.payments, candidate);
      if (duplicate && duplicate.id !== pendingDuplicate) {
        setPendingDuplicate(duplicate.id);
        show(`"${duplicate.title}" zaten kayıtlı. Yine de eklemek için tekrar Kaydet'e bas.`);
        return;
      }
    }
    setPendingDuplicate(null);

    if (sheet?.editing) {
      const base = sheet.editing;
      const fresh = createPayment(input, store.settings);
      await store.updatePayment({ ...base, ...fresh, id: base.id, createdAt: base.createdAt });
      show('Kayıt güncellendi');
    } else {
      await store.addPayment(input);
      show('Ödeme kaydedildi');
    }
    setSheet(null);
  };

  const readAloud = useCallback(
    (which = plan) => {
      if (!store.settings.ttsEnabled) {
        show('Sesli okuma Ayarlar’dan kapalı.');
        return;
      }
      stopSpeaking();
      speak(speakableSummary(which, store.today));
    },
    [plan, store.today, store.settings.ttsEnabled, show],
  );

  /** Sesli komut sonucunu uygular. */
  const applyAction = async (action: Action) => {
    switch (action.kind) {
      case 'add': {
        setVoiceOpen(false);
        await store.addPayment(action.payment);
        show(`Kaydedildi: ${action.payment.title}`);
        break;
      }
      case 'defer': {
        setVoiceOpen(false);
        await store.setOccurrenceStatus(action.occurrence, {
          status: 'deferred',
          deferredTo: action.date,
        });
        show(`${action.occurrence.payment.title} → ${D.formatShortTR(action.date)}`);
        break;
      }
      case 'markPaid': {
        setVoiceOpen(false);
        await store.setOccurrenceStatus(action.occurrence, {
          status: 'paid',
          paidAmount: action.amount,
        });
        show(`${action.occurrence.payment.title} ödendi olarak işaretlendi`);
        break;
      }
      case 'delete': {
        setVoiceOpen(false);
        await store.trashPayment(action.payment.id);
        show(`${action.payment.title} çöp kutusuna taşındı`);
        break;
      }
      case 'list': {
        setVoiceOpen(false);
        setTab('today');
        selectDate(action.date);
        readAloud(store.planFor(action.date));
        break;
      }
      case 'send': {
        setVoiceOpen(false);
        setShareDate(action.date);
        setShareOpen(true);
        break;
      }
      case 'chooseOccurrence':
        setVoiceOpen(false);
        setChooser({ candidates: action.candidates, next: action.next });
        break;
      case 'choosePayment':
        setVoiceOpen(false);
        setPaymentChooser(action.candidates);
        break;
      case 'incomplete':
        show(action.reason);
        break;
    }
  };

  if (!store.ready) {
    return <div className="grid h-full place-items-center text-muted">Yükleniyor…</div>;
  }

  if (store.settings.pinHash && !unlocked) {
    return (
      <div className="flex h-full flex-col">
        <TitleBar />
        <LockScreen hash={store.settings.pinHash} onUnlock={() => setUnlocked(true)} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      {/*
        Telefonda tek sütun (APK görünümü korunur), masaüstünde geniş ekran
        iki sütuna açılır. Kırılma noktası 1024px.
      */}
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden lg:max-w-6xl">
      {/*
        Üst barda metin başlık yok: pencere/sekme adı zaten "Timeless — Ödeme
        Asistanı". Kazanılan yer sekmelere ve hızlı eylem simgelerine gidiyor.
      */}
      <header className="safe-top sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-canvas/90 px-3 py-2.5 backdrop-blur">
        <nav className="flex gap-0.5 rounded-xl bg-surface-2 p-1 text-xs">
          {(
            [
              ['today', 'Bugün'],
              ['payments', 'Kayıtlar'],
              ['report', 'Gider'],
              ['settings', 'Ayarlar'],
            ] as [Tab, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`rounded-lg px-2.5 py-1.5 font-medium transition ${
                tab === value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="flex gap-1">
          <IconButton
            label="Sesli veya yazılı komut"
            onClick={() => setVoiceOpen(true)}
          >
            🎤
          </IconButton>
          <IconButton label="Günün listesini sesli oku" onClick={() => readAloud()}>
            🔊
          </IconButton>
          <IconButton
            label="Günün planını gönder"
            onClick={() => {
              setShareDate(date);
              setShareOpen(true);
            }}
          >
            📄
          </IconButton>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4">
        {tab === 'today' && (
          <TodayScreen
            store={store}
            date={date}
            month={month}
            onChangeDate={selectDate}
            onChangeMonth={setMonth}
            onEdit={(o) => openEdit(o.payment)}
            onDefer={setDeferring}
            onAdd={openNew}
            onCopyIban={async (iban) => {
              await navigator.clipboard?.writeText(iban).catch(() => undefined);
              show('IBAN panoya kopyalandı');
            }}
          />
        )}
        {tab === 'payments' && <PaymentsScreen store={store} onEdit={openEdit} />}
        {tab === 'report' && <ReportScreen store={store} onResult={show} />}
        {tab === 'settings' && (
          <SettingsScreen store={store} onToast={show} onOpenAuth={() => setAuthOpen(true)} />
        )}
      </main>

      {/* Geniş ekranda düğme tüm genişliği kaplamasın */}
      <div className="safe-bottom border-t border-line bg-surface/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto lg:max-w-sm">
          <Button variant="primary" size="lg" full onClick={openNew}>
            + Ödeme ekle
          </Button>
        </div>
      </div>

      {sheet && (
        <PaymentSheet
          open
          initial={sheet.draft}
          title={sheet.editing ? 'Ödemeyi düzenle' : 'Yeni ödeme'}
          onClose={() => {
            setSheet(null);
            setPendingDuplicate(null);
          }}
          onSave={savePayment}
          categories={store.settings.customCategories}
          onAddCategory={async (category) => {
            await store.saveSettings({
              ...store.settings,
              customCategories: [...store.settings.customCategories, category],
            });
            show(`"${category.label}" kategorisi eklendi`);
          }}
          onDelete={
            sheet.editing
              ? async () => {
                  await store.trashPayment(sheet.editing!.id);
                  setSheet(null);
                  show('Çöp kutusuna taşındı');
                }
              : undefined
          }
        />
      )}

      <DeferSheet
        occurrence={deferring}
        onClose={() => setDeferring(null)}
        onDefer={async (to) => {
          if (deferring) {
            await store.setOccurrenceStatus(deferring, { status: 'deferred', deferredTo: to });
            show(`${deferring.payment.title} → ${D.formatShortTR(to)}`);
          }
          setDeferring(null);
        }}
      />

      <VoiceSheet
        open={voiceOpen}
        context={{ today: store.today, openOccurrences, payments: store.payments }}
        onClose={() => setVoiceOpen(false)}
        onApply={applyAction}
      />

      {/* Sesli komut hedefi seçilemediğinde */}
      <Sheet
        open={chooser !== null}
        title="Hangi ödeme?"
        onClose={() => setChooser(null)}
      >
        <div className="space-y-2">
          {chooser?.candidates.map((o) => (
            <button
              key={`${o.paymentId}-${o.originalDate}`}
              className="w-full rounded-xl border border-line bg-surface-2 px-3 py-3 text-left hover:border-accent"
              onClick={async () => {
                const next = chooser.next;
                if (next.kind === 'defer') {
                  await store.setOccurrenceStatus(o, {
                    status: 'deferred',
                    deferredTo: next.date,
                  });
                  show(`${o.payment.title} → ${D.formatShortTR(next.date)}`);
                } else {
                  await store.setOccurrenceStatus(o, { status: 'paid', paidAmount: next.amount });
                  show(`${o.payment.title} ödendi olarak işaretlendi`);
                }
                setChooser(null);
              }}
            >
              <span className="font-medium">{o.payment.title}</span>
              <span className="ml-2 text-xs text-muted">{D.formatShortTR(o.date)}</span>
            </button>
          ))}
          {chooser?.candidates.length === 0 && (
            <p className="text-sm text-muted">Açık ödeme bulunamadı.</p>
          )}
        </div>
      </Sheet>

      <Sheet
        open={paymentChooser !== null}
        title="Hangi kayıt silinsin?"
        onClose={() => setPaymentChooser(null)}
      >
        <div className="space-y-2">
          {paymentChooser?.map((p) => (
            <button
              key={p.id}
              className="w-full rounded-xl border border-line bg-surface-2 px-3 py-3 text-left hover:border-danger"
              onClick={async () => {
                await store.trashPayment(p.id);
                setPaymentChooser(null);
                show(`${p.title} çöp kutusuna taşındı`);
              }}
            >
              {p.title}
            </button>
          ))}
        </div>
      </Sheet>

      <AuthSheet open={authOpen} onClose={() => setAuthOpen(false)} onResult={show} />

      <ShareSheet
        open={shareOpen}
        store={store}
        date={shareDate}
        onClose={() => setShareOpen(false)}
        onResult={show}
        onManageContacts={() => setContactsOpen(true)}
      />

      <ContactsSheet
        open={contactsOpen}
        store={store}
        onClose={() => setContactsOpen(false)}
        onResult={show}
      />

      <Toast message={toast} />
      </div>
    </div>
  );
}
