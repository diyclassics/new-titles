import { useRef } from 'react';

type MobileTab = 'map' | 'list';

type Props = {
  tab: MobileTab;
  onChange: (tab: MobileTab) => void;
};

const TABS: ReadonlyArray<{ key: MobileTab; label: string }> = [
  { key: 'map', label: 'Map' },
  { key: 'list', label: 'List' },
];

export function MobileTabBar({ tab, onChange }: Props) {
  const refs = useRef<Record<MobileTab, HTMLButtonElement | null>>({
    map: null,
    list: null,
  });

  function onKey(e: React.KeyboardEvent<HTMLButtonElement>, current: MobileTab) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const idx = TABS.findIndex((t) => t.key === current);
    const nextIdx = e.key === 'ArrowRight' ? (idx + 1) % TABS.length : (idx - 1 + TABS.length) % TABS.length;
    const nextTab = TABS[nextIdx];
    if (!nextTab) return;
    const next = nextTab.key;
    onChange(next);
    refs.current[next]?.focus();
    e.preventDefault();
  }

  return (
    <nav className="mobile-tab-bar" role="tablist" aria-label="View toggle">
      {TABS.map(({ key, label }) => {
        const selected = tab === key;
        return (
          <button
            key={key}
            ref={(el) => {
              refs.current[key] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(key)}
            onKeyDown={(e) => onKey(e, key)}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}
