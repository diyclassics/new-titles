import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { CATEGORIES, type Category, MONTH_KEYS, type MonthKey } from './data.ts';

export type View = 'map' | 'list';

export interface UrlState {
  view: View;
  month: MonthKey;
  id: string | null;
  q: string;
  cats: ReadonlySet<Category>;
}

const DEFAULT_MONTH: MonthKey = MONTH_KEYS[MONTH_KEYS.length - 1] as MonthKey;
const ALL_CATS: ReadonlySet<Category> = new Set(CATEGORIES);

const DEFAULTS: UrlState = {
  view: 'map',
  month: DEFAULT_MONTH,
  id: null,
  q: '',
  cats: ALL_CATS,
};

const VALID_MONTHS = new Set<MonthKey>(MONTH_KEYS);

function parse(hash: string): UrlState {
  const params = new URLSearchParams(hash.replace(/^#/, ''));

  const viewRaw = params.get('view');
  const view: View = viewRaw === 'list' ? 'list' : 'map';

  const monthRaw = params.get('month') as MonthKey | null;
  const month: MonthKey = monthRaw && VALID_MONTHS.has(monthRaw) ? monthRaw : DEFAULTS.month;

  const id = params.get('id');

  const q = params.get('q') ?? '';

  const catsParam = params.get('cats');
  let cats: ReadonlySet<Category> = ALL_CATS;
  if (catsParam !== null) {
    const indices = catsParam
      .split(',')
      .map((s) => Number.parseInt(s, 10))
      .filter((n) => Number.isInteger(n) && n >= 0 && n < CATEGORIES.length);
    const picked = new Set<Category>(indices.map((i) => CATEGORIES[i] as Category));
    // Empty selection is invalid (UI requires at least one); fall back to all.
    cats = picked.size === 0 ? ALL_CATS : picked;
  }

  return { view, month, id: id || null, q, cats };
}

function serialize(state: UrlState): string {
  const params = new URLSearchParams();
  if (state.view !== DEFAULTS.view) params.set('view', state.view);
  if (state.month !== DEFAULTS.month) params.set('month', state.month);
  if (state.id) params.set('id', state.id);
  if (state.q) params.set('q', state.q);
  if (state.cats.size !== CATEGORIES.length) {
    const indices: number[] = [];
    CATEGORIES.forEach((c, i) => {
      if (state.cats.has(c)) indices.push(i);
    });
    params.set('cats', indices.join(','));
  }
  const s = params.toString();
  return s ? `#${s}` : '';
}

function getSnapshot(): string {
  return typeof window === 'undefined' ? '' : window.location.hash;
}

function getServerSnapshot(): string {
  return '';
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('hashchange', callback);
  window.addEventListener('popstate', callback);
  return () => {
    window.removeEventListener('hashchange', callback);
    window.removeEventListener('popstate', callback);
  };
}

type Patch = Partial<UrlState> | ((prev: UrlState) => Partial<UrlState>);

export interface SetUrlOptions {
  /** Replace the current history entry instead of pushing a new one. Default: false. */
  replace?: boolean;
}

export type SetUrlState = (patch: Patch, options?: SetUrlOptions) => void;

function writeState(next: UrlState, replace: boolean): void {
  const newHash = serialize(next);
  const url = `${window.location.pathname}${window.location.search}${newHash}`;
  if (replace) {
    window.history.replaceState(null, '', url);
  } else {
    window.history.pushState(null, '', url);
  }
  // pushState/replaceState don't fire hashchange — dispatch synthetically so
  // useSyncExternalStore subscribers re-read.
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useUrlState(): readonly [UrlState, SetUrlState] {
  const hash = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const state = useMemo(() => parse(hash), [hash]);

  const setState = useCallback<SetUrlState>((patch, options) => {
    const current = parse(window.location.hash);
    const update = typeof patch === 'function' ? patch(current) : patch;
    const next: UrlState = { ...current, ...update };
    // Skip writing when nothing actually changed (prevents redundant history
    // entries and synthetic hashchange events).
    if (serialize(next) === serialize(current)) return;
    writeState(next, options?.replace ?? false);
  }, []);

  return [state, setState] as const;
}
