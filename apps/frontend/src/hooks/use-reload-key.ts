import { useCallback, useState } from 'react';

/** Monotonic refresh counter for list data: increment to re-run the fetch
 *  effect that depends on it. */
export function useReloadKey() {
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  return [reloadKey, reload] as const;
}
