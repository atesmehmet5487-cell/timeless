/**
 * Masaüstü başlık çubuğu.
 *
 * Windows'un beyaz çerçevesi kapatıldı (electron/main.ts → frame: false),
 * bu yüzden pencereyi taşıma ve küçült/büyüt/kapat düğmeleri burada.
 * Tarayıcıda ve telefonda hiç görünmez.
 */
import { useEffect, useState } from 'react';
import { platformKind } from '../services/platform';

interface WindowBridge {
  minimize(): Promise<boolean>;
  toggleMaximize(): Promise<boolean>;
  close(): Promise<boolean>;
  isMaximized(): Promise<boolean>;
}

function bridge(): WindowBridge | null {
  const api = (window as unknown as { timeless?: { window?: WindowBridge } }).timeless;
  return api?.window ?? null;
}

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const isDesktop = platformKind() === 'electron';

  useEffect(() => {
    if (!isDesktop) return;
    void bridge()?.isMaximized().then(setMaximized);
  }, [isDesktop]);

  if (!isDesktop) return null;

  return (
    <div
      // Çubuğun boş alanından pencere sürüklenir (bkz. index.css)
      className="drag-region flex h-9 shrink-0 items-center justify-between border-b border-line bg-surface pl-3 pr-0 select-none"
    >
      <span className="text-xs font-medium text-ink-soft">Timeless — Ödeme Asistanı</span>

      <div className="no-drag flex h-full">
        <ControlButton label="Küçült" onClick={() => void bridge()?.minimize()}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
          </svg>
        </ControlButton>

        <ControlButton
          label={maximized ? 'Önceki boyut' : 'Büyüt'}
          onClick={async () => setMaximized((await bridge()?.toggleMaximize()) ?? false)}
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <rect x="0" y="2" width="8" height="8" fill="none" stroke="currentColor" />
              <path d="M2 2V0h8v8H8" fill="none" stroke="currentColor" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
            </svg>
          )}
        </ControlButton>

        <ControlButton label="Kapat" danger onClick={() => void bridge()?.close()}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" />
          </svg>
        </ControlButton>
      </div>
    </div>
  );
}

function ControlButton({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid h-full w-11 place-items-center text-ink-soft transition ${
        danger ? 'hover:bg-danger hover:text-white' : 'hover:bg-surface-2 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
