/** Kısa bilgi mesajı — yapılan işlemin karşılığını gösterir. */
import { useCallback, useEffect, useRef, useState } from 'react';

export function useToast(duration = 3000) {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (message: string) => {
      setToast(message);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), duration);
    },
    [duration],
  );

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { toast, show };
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
      <div className="max-w-sm rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-center text-sm shadow-lg">
        {message}
      </div>
    </div>
  );
}
