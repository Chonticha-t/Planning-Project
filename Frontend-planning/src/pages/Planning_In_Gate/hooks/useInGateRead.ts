import { useCallback, useEffect, useRef, useState } from "react";

export function useInGateRead<T>(
  scope: string,
  enabled: boolean,
  read: (signal: AbortSignal, refresh: boolean) => Promise<T>,
  errorMessage: (error: unknown) => string,
  debounceMs = 0,
) {
  const [refreshRequest, setRefreshRequest] = useState<{ scope: string; force: boolean } | null>(null);
  const usedRefresh = useRef<typeof refreshRequest>(null);
  const pending = useRef(false);
  const [state, setState] = useState<{ scope: string; loading: boolean; data?: T; error?: string } | null>(null);

  const request = useCallback((force: boolean) => {
    if (!enabled || (!force && pending.current)) return;
    pending.current = true;
    setRefreshRequest({ scope, force });
  }, [enabled, scope]);
  const reload = useCallback(() => request(true), [request]);
  const revalidate = useCallback(() => request(false), [request]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const next = refreshRequest?.scope === scope && refreshRequest !== usedRefresh.current ? refreshRequest : null;
    if (next) usedRefresh.current = next;
    const refresh = next?.force ?? false;
    pending.current = true;
    setState(previous => ({ scope, loading: true, data: previous?.scope === scope ? previous.data : undefined }));

    const load = async () => {
      try {
        const data = await read(controller.signal, refresh);
        if (!controller.signal.aborted) setState({ scope, loading: false, data });
      } catch (error) {
        if (!controller.signal.aborted) {
          setState(previous => ({
            scope, loading: false, data: previous?.scope === scope ? previous.data : undefined, error: errorMessage(error),
          }));
        }
      } finally {
        if (!controller.signal.aborted) pending.current = false;
      }
    };
    const timer = !refresh && debounceMs > 0 ? window.setTimeout(() => void load(), debounceMs) : undefined;
    if (timer === undefined) void load();
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      pending.current = false;
    };
  }, [scope, enabled, read, refreshRequest, errorMessage, debounceMs]);

  const current = enabled && state?.scope === scope ? state : null;
  return { data: current?.data, loading: enabled && (current?.loading ?? true), error: current?.error, reload, revalidate };
}
