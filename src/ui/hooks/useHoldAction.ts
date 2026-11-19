import { useCallback, useEffect, useRef } from 'react';

/**
 * Reliable mobile press-and-hold repeating purchase hook:
 * - Fires immediately on pointer down.
 * - Accelerates repeat cadence while held smoothly.
 * - Cancels cleanly on pointer up / cancel / leave without triggering browser scroll!
 */
export function useHoldAction(action: () => boolean, disabled: boolean) {
  const timerRef = useRef<number | null>(null);
  const actionRef = useRef(action);
  actionRef.current = action;

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();

      const ok = actionRef.current();
      if (!ok) return;

      let delay = 260;
      const tick = () => {
        const cont = actionRef.current();
        if (!cont) {
          stop();
          return;
        }
        delay = Math.max(55, delay * 0.82);
        timerRef.current = window.setTimeout(tick, delay);
      };
      timerRef.current = window.setTimeout(tick, delay);
    },
    [disabled, stop],
  );

  return {
    onPointerDown,
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
  };
}
