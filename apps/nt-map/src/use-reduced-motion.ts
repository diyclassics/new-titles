import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function getSnapshot(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(callback: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  // Older Safari fires on `addListener`; modern browsers prefer
  // `addEventListener('change', ...)`. matchMedia objects implement both.
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

/** Reads the OS-level `prefers-reduced-motion: reduce` setting. Updates
 *  reactively if the user changes the preference while the app is open. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
