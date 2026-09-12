/**
 * Bulut girişi.
 *
 * Giriş zorunlu değil: kapatılırsa uygulama cihaz verisiyle çalışmaya devam
 * eder. Giriş yapılınca kayıtlar ekiple paylaşılır.
 */
import { useState } from 'react';

import { Button, Field, inputClass, Sheet } from './components';

type Tab = 'signIn' | 'signUp';

export function AuthSheet({
  open,
  onClose,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (message: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      // Firebase kodu ilk giriş denemesinde yüklenir
      const { signIn, signUp } = await import('../services/cloud');
      const user =
        tab === 'signIn'
          ? await signIn(email, password)
          : await signUp(email, password, name);
      onResult(
        tab === 'signIn'
          ? `Giriş yapıldı: ${user.email}`
          : `Hesap oluşturuldu: ${user.email}`,
      );
      setPassword('');
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Giriş yapılamadı.');
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    email.trim().length > 3 && password.length >= 6 && (tab === 'signIn' || name.trim().length > 0);

  return (
    <Sheet open title="Bulut hesabı" onClose={onClose}>
      <div className="mb-4 flex gap-1 rounded-xl bg-surface-2 p-1 text-sm">
        {(
          [
            ['signIn', 'Giriş yap'],
            ['signUp', 'Hesap oluştur'],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => {
              setTab(value);
              setError(null);
            }}
            className={`flex-1 rounded-lg py-2 font-medium transition ${
              tab === value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="mb-4 text-xs text-muted">
        Giriş yapan herkes aynı ödeme listesini görür ve düzenler. İnternet
        yokken de çalışır; bağlantı gelince değişiklikler kendiliğinden
        eşitlenir.
      </p>

      {tab === 'signUp' && (
        <Field label="Adın">
          <input
            className={inputClass}
            value={name}
            placeholder="Mehmet Ateş"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
      )}

      <Field label="E-posta">
        <input
          className={inputClass}
          value={email}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="ornek@eposta.com"
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>

      <Field label="Şifre">
        <input
          className={inputClass}
          value={password}
          type="password"
          autoComplete={tab === 'signIn' ? 'current-password' : 'new-password'}
          placeholder="en az 6 karakter"
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && canSubmit && void submit()}
        />
      </Field>

      {error && (
        <p className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
      )}

      <Button variant="primary" size="lg" full disabled={busy || !canSubmit} onClick={submit}>
        {busy ? 'Bekle…' : tab === 'signIn' ? 'Giriş yap' : 'Hesabı oluştur'}
      </Button>

      <p className="mt-3 text-center text-[11px] text-muted">
        Girmeden de kullanabilirsin; o zaman kayıtlar yalnızca bu cihazda kalır.
      </p>
    </Sheet>
  );
}
