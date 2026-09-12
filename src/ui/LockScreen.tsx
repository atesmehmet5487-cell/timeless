/** Açılışta PIN sorma ekranı. */
import { useEffect, useState } from 'react';
import { PIN_DIGITS, verifyPin } from '../services/lock';

export function LockScreen({
  hash,
  onUnlock,
}: {
  hash: string;
  onUnlock: () => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (pin.length !== PIN_DIGITS) return;
    let cancelled = false;
    void verifyPin(pin, hash).then((ok) => {
      if (cancelled) return;
      if (ok) onUnlock();
      else {
        setError(true);
        setPin('');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pin, hash, onUnlock]);

  const press = (digit: string) => {
    setError(false);
    setPin((current) => (current.length < PIN_DIGITS ? current + digit : current));
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <p className="text-3xl">🔒</p>
        <h1 className="mt-2 text-lg font-semibold">Timeless</h1>
        <p className="mt-1 text-sm text-muted">
          {error ? <span className="text-danger">PIN yanlış, tekrar dene</span> : 'PIN kodunu gir'}
        </p>
      </div>

      <div className="flex gap-3">
        {Array.from({ length: PIN_DIGITS }, (_, index) => (
          <span
            key={index}
            className={`h-3.5 w-3.5 rounded-full transition ${
              index < pin.length ? 'bg-accent' : 'bg-surface-2 ring-1 ring-line'
            }`}
          />
        ))}
      </div>

      <div className="grid w-full max-w-[260px] grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <Key key={digit} onClick={() => press(digit)}>
            {digit}
          </Key>
        ))}
        <span />
        <Key onClick={() => press('0')}>0</Key>
        <Key onClick={() => setPin((current) => current.slice(0, -1))}>⌫</Key>
      </div>
    </div>
  );
}

function Key({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="grid h-14 place-items-center rounded-2xl bg-surface text-xl font-medium ring-1 ring-line transition hover:bg-surface-2 active:scale-95"
    >
      {children}
    </button>
  );
}
