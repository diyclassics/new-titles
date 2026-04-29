type MobileTab = 'map' | 'list';

type Props = {
  tab: MobileTab;
  onChange: (tab: MobileTab) => void;
};

export function MobileViewToggle({ tab, onChange }: Props) {
  const target: MobileTab = tab === 'map' ? 'list' : 'map';
  const label = target === 'list' ? 'Show list' : 'Show map';
  return (
    <button
      type="button"
      className="mobile-view-toggle"
      onClick={() => onChange(target)}
      aria-label={label}
    >
      {label}
    </button>
  );
}
