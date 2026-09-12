/**
 * Sesli / yazılı komut ekranı.
 *
 * Kural: hiçbir komut sessizce uygulanmaz. Ne anlaşıldığı önce gösterilir,
 * kullanıcı onaylar ya da düzeltir.
 */
import { useEffect, useRef, useState } from 'react';
import * as D from '../domain/date';
import { INTENT_LABELS, planAction, type Action } from '../nlp/commands';
import { parseCommand, type ParseResult } from '../nlp/parse';
import { isSpeechSupported, startListening, type SpeechSession } from '../services/stt';
import type { Occurrence, Payment } from '../domain/types';
import { Button, inputClass, Sheet } from './components';

export interface VoiceContext {
  today: string;
  openOccurrences: Occurrence[];
  payments: Payment[];
}

type Stage = 'idle' | 'listening' | 'review';

export function VoiceSheet({
  open,
  context,
  onClose,
  onApply,
}: {
  open: boolean;
  context: VoiceContext;
  onClose: () => void;
  /** Onaylanan eylemi uygular; metin döndürürse kullanıcıya gösterilir. */
  onApply: (action: Action, parsed: ParseResult) => void | Promise<void>;
}) {
  const [stage, setStage] = useState<Stage>('idle');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const session = useRef<SpeechSession | null>(null);
  const supported = isSpeechSupported();

  useEffect(() => {
    if (!open) {
      session.current?.cancel();
      session.current = null;
      setStage('idle');
      setText('');
      setParsed(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => () => session.current?.cancel(), []);

  const analyze = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setParsed(parseCommand(trimmed, context.today));
    setStage('review');
  };

  const listen = () => {
    setError(null);
    setText('');
    setParsed(null);
    setStage('listening');
    session.current = startListening({
      onPartial: setText,
      onResult: (result) => {
        setText(result);
        analyze(result);
      },
      onError: (message) => {
        setError(message);
        setStage('idle');
      },
      onEnd: () => setStage((s) => (s === 'listening' ? 'idle' : s)),
    });
  };

  const stopListening = () => {
    session.current?.stop();
    setStage('idle');
  };

  const action = parsed ? planAction(parsed, context) : null;

  return (
    <Sheet open={open} title="Sesli komut" onClose={onClose}>
      {/* Mikrofon */}
      <div className="mb-4 flex flex-col items-center gap-3 py-2">
        <button
          onClick={stage === 'listening' ? stopListening : listen}
          disabled={!supported}
          className={`grid h-20 w-20 place-items-center rounded-full text-3xl transition ${
            stage === 'listening'
              ? 'animate-pulse bg-danger text-white'
              : 'bg-accent text-white disabled:bg-surface-2 disabled:text-muted'
          }`}
          aria-label={stage === 'listening' ? 'Dinlemeyi durdur' : 'Dinlemeye başla'}
        >
          {stage === 'listening' ? '■' : '🎤'}
        </button>
        <p className="text-center text-xs text-muted">
          {!supported
            ? 'Bu cihazda ses tanıma yok — aşağıya yazabilirsin.'
            : stage === 'listening'
              ? 'Dinliyorum… konuşmayı bitirince dur.'
              : 'Konuş: "ayın 15’inde ziraat kart ödeme 1.500 lira"'}
        </p>
      </div>

      {/* Yazılı giriş — her zaman açık */}
      <div className="mb-4 flex gap-2">
        <input
          className={inputClass}
          value={text}
          placeholder="ya da komutu yaz…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && analyze(text)}
        />
        <Button variant="primary" onClick={() => analyze(text)} disabled={!text.trim()}>
          Anla
        </Button>
      </div>

      {error && (
        <p className="mb-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      {/* Anlaşılan komut */}
      {parsed && action && (
        <div className="rounded-2xl border border-line bg-surface-2 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="rounded-lg bg-accent/15 px-2 py-1 text-xs font-medium text-accent">
              {INTENT_LABELS[parsed.intent]}
            </span>
            <ConfidenceBadge value={parsed.confidence} />
          </div>

          <ActionPreview action={action} today={context.today} />

          {parsed.warnings.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-warn">
              {parsed.warnings.map((w) => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex gap-2">
            <Button
              variant="primary"
              size="lg"
              full
              disabled={action.kind === 'incomplete'}
              onClick={() => onApply(action, parsed)}
            >
              {action.kind === 'add' ? 'Kaydet' : 'Uygula'}
            </Button>
            <Button size="lg" onClick={() => setStage('idle')}>
              Vazgeç
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const high = value >= 0.7;
  return (
    <span className={`text-xs ${high ? 'text-ok' : 'text-warn'}`}>
      {high ? 'net anlaşıldı' : 'emin değilim — kontrol et'}
    </span>
  );
}

function ActionPreview({ action, today }: { action: Action; today: string }) {
  switch (action.kind) {
    case 'incomplete':
      return <p className="text-sm text-warn">{action.reason}</p>;

    case 'chooseOccurrence':
      return (
        <div className="text-sm">
          <p className="mb-2 text-muted">Hangi ödeme? Uygula’ya basınca listeden seçeceksin:</p>
          <ul className="space-y-1">
            {action.candidates.slice(0, 5).map((o) => (
              <li key={`${o.paymentId}-${o.originalDate}`}>
                • {o.payment.title} · {D.formatShortTR(o.date)}
              </li>
            ))}
            {action.candidates.length === 0 && <li className="text-warn">Açık ödeme yok.</li>}
          </ul>
        </div>
      );

    case 'choosePayment':
      return (
        <div className="text-sm">
          <p className="mb-2 text-muted">Hangi kayıt? Uygula’ya basınca listeden seçeceksin:</p>
          <ul className="space-y-1">
            {action.candidates.slice(0, 5).map((p) => (
              <li key={p.id}>• {p.title}</li>
            ))}
          </ul>
        </div>
      );

    default:
      return (
        <p className="text-sm">
          {action.summary}
          {action.kind === 'list' && (
            <span className="mt-1 block text-xs text-muted">
              {D.formatRelativeTR(action.date, today)}
            </span>
          )}
        </p>
      );
  }
}
