/**
 * Minimal data-fetching hook.
 *
 * Tracks the three states every request has — loading, data, error — in one
 * place, so components stop re-implementing them and stop forgetting the third.
 * v1 had no loading state at all and reported every failure through
 * `alert()`, which blocks the page and cannot be styled, dismissed
 * programmatically, or read by a screen reader in context.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (mounted.current) setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      if (mounted.current) setState({ data: null, error, loading: false });
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { ...state, reload: run };
}
