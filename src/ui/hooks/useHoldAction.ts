import { useCallback, useEffect, useRef } from 'react';

export interface UseHoldActionOptions {
  onTickSuccess?: (holdTickCount: number) => void;
  onHoldEnd?: () => void;
}

/**
 * Reliable mobile press-and-hold repeating purchase hook:
 * - Fires immediately on pointer down.
 * - Accelerates repeat cadence smoothly (240ms -> 50ms) while held.
 * - Cancels cleanly on pointer up / cancel / leave / lost capture / disabled / unmount.
 */
export function useHoldAction(
  action: () => boolean,
  disabled: boolean,
  options?: UseHoldActionOptions,
) {
  const timerRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const actionRef = useRef(action);
  const onTickSuccessRef = useRef(options?.onTickSuccess);
  const onHoldEndRef = useRef(options?.onHoldEnd);

  actionRef.current = action;
  onTickSuccessRef.current = options?.onTickSuccess;
  onHoldEndRef.current = options?.onHoldEnd;

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (activeRef.current) {
      activeRef.current = false;
      onHoldEndRef.current?.();
    }
  }, []);

  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);

  useEffect(() => stop, [stop]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();

      // Prevent duplicate timeout chains on multi-touch or rapid re-entry
      stop();

      const ok = actionRef.current();
      if (!ok) return;

      activeRef.current = true;
      let count = 1;
      onTickSuccessRef.current?.(count);

      let delay = 240;
      const tick = () => {
        if (!activeRef.current) return;
        const cont = actionRef.current();
        if (!cont) {
          stop();
          return;
        }
        count += 1;
        onTickSuccessRef.current?.(count);
        delay = Math.max(50, delay * 0.8);
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
    onLostPointerCapture: stop,
  };
}
