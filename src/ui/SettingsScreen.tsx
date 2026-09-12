/** Bildirim ayarları, izinler ve kabuk sınırları. */
import { useEffect, useState } from 'react';
import * as D from '../domain/date';
import { reminderAt } from '../domain/reminders';
import { reportHeading } from '../domain/report';
import { ACCENTS } from '../domain/types';
import type {
  AccentName,
  Currency,
  MonthEndPolicy,
  ThemeMode,
  WeekendPolicy,
} from '../domain/types';
import {
  getNotifier,
  PERMISSION_LABELS,
  type PermissionState,
} from '../services/notify';
import { platformKind } from '../services/platform';
import type { Store } from '../store';
import { hashPin, isValidPinShape, PIN_DIGITS } from '../services/lock';
import { BackupSection } from './BackupSection';
import { CleanupSection } from './CleanupSection';
import { Button, Field, inputClass } from './components';
import { Checkbox } from './OccurrenceRow';

export function SettingsScreen({
  store,
  onToast,
  onOpenAuth,
}: {
  store: Store;
  onToast: (m: string) => void;
  onOpenAuth: () => void;
}) {
  const [permission, setPermission] = useState<PermissionState>('default');
  /**
   * Metin alanı doğrudan depoya yazarsa her tuş vuruşu bir kaydet+yeniden oku
   * turu başlatıyor ve yazılanı eziyordu. Yerel durumda tutup yazma durunca
   * kaydediyoruz.
   */
  const [owner, setOwner] = useState(store.settings.documentOwner);
  const [savedOwner, setSavedOwner] = useState(store.settings.documentOwner);
  const [pin, setPin] = useState('');
  const notifier = getNotifier();
  const kind = platformKind();

  useEffect(() => {
    void notifier.permission().then(setPermission);
  }, [notifier]);

  // Ayar başka bir yerden değişirse alanı eşitle
  if (store.settings.documentOwner !== savedOwner) {
    setSavedOwner(store.settings.documentOwner);
    setOwner(store.settings.documentOwner);
  }

  useEffect(() => {
    if (owner === store.settings.documentOwner) return;
    const timer = setTimeout(() => {
      void store.saveSettings({ ...store.settings, documentOwner: owner });
    }, 600);
    return () => clearTimeout(timer);
  }, [owner, store]);

  const patch = (changes: Partial<typeof store.settings>) =>
    store.saveSettings({ ...store.settings, ...changes });

  const next = store.reminders[0];

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: 'Cihaza uy' },
    { value: 'light', label: 'Açık' },
    { value: 'dark', label: 'Koyu' },
  ];

  return (
    // Masaüstünde ayarlar iki sütuna yayılır; telefonda tek sütun kalır
    <div className="space-y-6 lg:columns-2 lg:gap-6 lg:space-y-0 [&>section]:lg:mb-6 [&>section]:lg:break-inside-avoid">
      {/* Görünüm */}
      <section className="rounded-card border border-line bg-surface p-4">
        <h3 className="mb-3 font-semibold">Görünüm</h3>

        <Field label="Tema">
          <div className="grid grid-cols-3 gap-2">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => patch({ theme: option.value })}
                className={`rounded-xl px-2 py-2.5 text-sm font-medium transition ${
                  store.settings.theme === option.value
                    ? 'bg-accent text-white'
                    : 'bg-surface-2 text-ink-soft hover:text-ink'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Renk">
          <div className="flex flex-wrap gap-2.5">
            {ACCENTS.map((accent) => {
              const active = store.settings.accent === accent.name;
              return (
                <button
                  key={accent.name}
                  onClick={() => patch({ accent: accent.name as AccentName })}
                  title={accent.label}
                  aria-label={accent.label}
                  aria-pressed={active}
                  className={`grid h-9 w-9 place-items-center rounded-full transition ${
                    active ? 'ring-2 ring-offset-2 ring-offset-surface' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: accent.swatch, boxShadow: active ? undefined : 'none' }}
                >
                  {active && <span className="text-sm font-bold text-white">✓</span>}
                </button>
              );
            })}
          </div>
        </Field>
      </section>

      {/* Belge başlığı */}
      <section className="rounded-card border border-line bg-surface p-4">
        <h3 className="mb-1 font-semibold">Belge başlığı</h3>
        <p className="mb-3 text-xs text-muted">
          PDF ve Excel çıktılarının üstünde görünecek ad. Boş bırakırsan yalnızca
          tarih yazılır.
        </p>
        <Field label="Ad / firma">
          <input
            className={inputClass}
            value={owner}
            placeholder="MEHMET ATEŞ"
            onChange={(e) => setOwner(e.target.value)}
            onBlur={() => patch({ documentOwner: owner })}
          />
        </Field>
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-center text-xs font-semibold">
          {reportHeading(store.today, owner)}
        </p>
      </section>

      {/* Kategoriler */}
      <section className="rounded-card border border-line bg-surface p-4">
        <h3 className="mb-1 font-semibold">Kategoriler</h3>
        <p className="mb-3 text-xs text-muted">
          Yerleşik kategorilerin yanına kendi kategorilerini ekleyebilirsin. Yeni
          kategori, ödeme eklerken kategori kutusunun yanındaki + düğmesiyle de
          eklenebilir.
        </p>

        {store.settings.customCategories.length === 0 ? (
          <p className="text-sm text-muted">Henüz özel kategori yok.</p>
        ) : (
          <div className="space-y-2">
            {store.settings.customCategories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-3 py-2"
              >
                <span className="truncate text-sm font-medium">{category.label}</span>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    // Kategoriyi kullanan kayıtlar "Diğer" olarak görünür
                    void patch({
                      customCategories: store.settings.customCategories.filter(
                        (c) => c.id !== category.id,
                      ),
                    });
                    onToast(`"${category.label}" kaldırıldı`);
                  }}
                >
                  Sil
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Bildirim izni */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h3 className="mb-1 font-semibold">Bildirimler</h3>
        <p className="mb-3 text-xs text-muted">
          {PERMISSION_LABELS[permission]}
          {kind === 'android' && (
            <span className="mt-1 block text-warn">
              Bildirimlerin saatinde çıkması için Android ayarlarında Timeless’ı pil
              optimizasyonundan muaf tut — aksi hâlde bildirim saatlerce gecikebilir.
            </span>
          )}
          {!notifier.worksWhenClosed && (
            <span className="mt-1 block text-warn">
              {kind === 'web'
                ? 'Tarayıcıda bildirimler yalnızca bu sekme açıkken çıkar. Telefonda APK, masaüstünde .exe sürümünde uygulama kapalıyken de çıkacak.'
                : 'Bu kabukta bildirimler yalnızca uygulama açıkken çıkar.'}
            </span>
          )}
        </p>

        <div className="flex flex-wrap gap-2">
          {permission !== 'granted' && permission !== 'unsupported' && (
            <Button
              variant="primary"
              onClick={async () => {
                const result = await notifier.requestPermission();
                setPermission(result);
                onToast(PERMISSION_LABELS[result]);
              }}
            >
              İzin ver
            </Button>
          )}
          <Button
            onClick={async () => {
              await notifier.notifyNow(
                'Timeless test bildirimi',
                'Bildirimler çalışıyor. Gerçek hatırlatmalar planlandığı saatte çıkacak.',
              );
              onToast('Test bildirimi gönderildi');
            }}
            disabled={permission !== 'granted'}
          >
            🔔 Test bildirimi
          </Button>
        </div>

        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <ToggleRow
            label="Günlük özet bildirimi"
            hint="O gün ödeme varsa, belirlediğin saatte tek bildirim."
            checked={store.settings.dailySummaryEnabled}
            onChange={(v) => patch({ dailySummaryEnabled: v })}
          >
            <input
              type="time"
              className={`${inputClass} max-w-32`}
              value={store.settings.dailySummaryAt}
              onChange={(e) => patch({ dailySummaryAt: e.target.value })}
            />
          </ToggleRow>

          <ToggleRow
            label="Akşam kontrolü"
            hint="Gün sonunda işaretlenmemiş ödeme kaldıysa hatırlatır."
            checked={store.settings.eveningCheckEnabled}
            onChange={(v) => patch({ eveningCheckEnabled: v })}
          >
            <input
              type="time"
              className={`${inputClass} max-w-32`}
              value={store.settings.eveningCheckAt}
              onChange={(e) => patch({ eveningCheckAt: e.target.value })}
            />
          </ToggleRow>
        </div>

        <div className="mt-4 border-t border-line pt-3 text-xs text-muted">
          {store.reminders.length > 0 ? (
            <>
              <span className="text-white">{store.reminders.length}</span> bildirim planlandı.
              {next && (
                <> Sıradaki: {next.title} — {D.formatShortTR(next.date)} {next.time} (
                {reminderAt(next).toLocaleString('tr-TR', {
                  weekday: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                )
              </>
              )}
            </>
          ) : (
            'Planlanmış bildirim yok.'
          )}
        </div>
      </section>

      {/* Varsayılanlar */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h3 className="mb-3 font-semibold">Yeni kayıt varsayılanları</h3>

        <Field label="Para birimi">
          <select
            className={inputClass}
            value={store.settings.defaultCurrency}
            onChange={(e) => patch({ defaultCurrency: e.target.value as Currency })}
          >
            <option value="TRY">₺ Türk Lirası</option>
            <option value="USD">$ Dolar</option>
            <option value="EUR">€ Euro</option>
          </select>
        </Field>

        <Field label="Hafta sonuna denk gelen ödemeler">
          <select
            className={inputClass}
            value={store.settings.defaultWeekendPolicy}
            onChange={(e) => patch({ defaultWeekendPolicy: e.target.value as WeekendPolicy })}
          >
            <option value="none">Aynı gün kalsın</option>
            <option value="previousWorkday">Önceki iş gününe çekilsin</option>
            <option value="nextWorkday">Sonraki iş gününe kaysın</option>
          </select>
        </Field>

        <Field label="Ayın olmayan günleri (31 Şubat gibi)">
          <select
            className={inputClass}
            value={store.settings.defaultMonthEndPolicy}
            onChange={(e) => patch({ defaultMonthEndPolicy: e.target.value as MonthEndPolicy })}
          >
            <option value="clampToLastDay">Ayın son gününe çekilsin</option>
            <option value="skip">O ay atlansın</option>
          </select>
        </Field>
      </section>

      {/* Bulut hesabı */}
      <section className="rounded-card border border-line bg-surface p-4">
        <h3 className="mb-1 font-semibold">Bulut ve paylaşım</h3>

        {!store.cloudConfigured ? (
          <p className="text-xs text-muted">
            Bu sürümde bulut yapılandırılmadı; kayıtlar yalnızca bu cihazda
            tutuluyor. Ekiple paylaşmak için uygulamanın bulut ayarları
            girilmiş bir sürümü gerekiyor.
          </p>
        ) : store.session ? (
          <>
            <p className="text-xs text-muted">
              <span className="font-medium text-ok">Bağlı</span> ·{' '}
              {store.session.displayName || store.session.email}
            </p>
            <p className="mt-1 text-xs text-muted">
              Kayıtlar ekiple paylaşılıyor. İnternet yokken de çalışır,
              bağlantı gelince kendiliğinden eşitlenir.
            </p>
            <div className="mt-3">
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  await store.signOut();
                  onToast('Çıkış yapıldı — kayıtlar yalnızca bu cihazdan okunuyor');
                }}
              >
                Çıkış yap
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted">
              Giriş yaparsan kayıtlar ekiple paylaşılır: biri ödendi
              işaretlediğinde diğerleri de görür. Şu an kayıtlar yalnızca bu
              cihazda.
            </p>
            <Button variant="primary" size="sm" onClick={onOpenAuth}>
              Giriş yap / hesap oluştur
            </Button>
          </>
        )}
      </section>

      {/* Kilit */}
      <section className="rounded-card border border-line bg-surface p-4">
        <h3 className="mb-1 font-semibold">PIN kilidi</h3>
        <p className="mb-3 text-xs text-muted">
          Açılışta {PIN_DIGITS} haneli kod sorulur. Ekranda maaş, borç ve hesap
          numaraları göründüğü için cihazı başkası eline alırsa işe yarar.
        </p>

        {store.settings.pinHash ? (
          <div className="flex flex-wrap gap-2">
            <span className="rounded-lg bg-ok-soft px-2.5 py-1.5 text-xs font-medium text-ok">
              Kilit açık
            </span>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                void patch({ pinHash: undefined });
                onToast('PIN kaldırıldı');
              }}
            >
              PIN'i kaldır
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              className={`${inputClass} max-w-32 tnum tracking-[0.4em]`}
              value={pin}
              inputMode="numeric"
              maxLength={PIN_DIGITS}
              placeholder="••••"
              onChange={(e) => setPin(e.target.value.replace(/D/g, '').slice(0, PIN_DIGITS))}
            />
            <Button
              variant="primary"
              disabled={!isValidPinShape(pin)}
              onClick={async () => {
                await patch({ pinHash: await hashPin(pin) });
                setPin('');
                onToast('PIN kuruldu — uygulama açılışında sorulacak');
              }}
            >
              PIN kur
            </Button>
          </div>
        )}
      </section>

      <BackupSection store={store} onResult={onToast} />
      <CleanupSection store={store} onResult={onToast} />

      {/* Sesli komut */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h3 className="mb-3 font-semibold">Sesli komut</h3>
        <ToggleRow
          label="Kaydetmeden önce onay ekranı"
          hint="Yanlış anlaşılan komutun sessizce kaydedilmesini önler."
          checked={store.settings.confirmVoiceInput}
          onChange={(v) => patch({ confirmVoiceInput: v })}
        />
        <div className="mt-3">
          <ToggleRow
            label="Listeyi sesli okuma"
            hint="Bugün ekranındaki 🔊 Oku düğmesi."
            checked={store.settings.ttsEnabled}
            onChange={(v) => patch({ ttsEnabled: v })}
          />
        </div>
      </section>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  children,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <Checkbox checked={checked} label={label} onChange={onChange} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{label}</p>
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
      </div>
      {children && <div className="mt-2 pl-9">{children}</div>}
    </div>
  );
}
