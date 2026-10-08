import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Wallet, HardHat, Package, Menu } from 'lucide-react';

// Mobile bottom navigation — quick access to key sections
const NAV_ITEMS = [
  { to: '/dashboard', label: 'Accueil', icon: LayoutDashboard },
  { to: '/depenses', label: 'Dépenses', icon: Wallet },
  { to: '/travaux', label: 'Travaux', icon: HardHat },
  { to: '/stock', label: 'Stock', icon: Package },
];

export default function BottomNav({ onOpenMenu }) {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-ink-100 flex items-center justify-around px-1 pb-[env(safe-area-inset-bottom)] shadow-soft-md">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 py-2 px-3 rounded-lg transition-colors no-tap-highlight ${
                isActive ? 'text-forest-700' : 'text-ink-400'
              }`
            }
            aria-label={item.label}
          >
            {({ isActive }) => (
              <>
                <Icon size={20} className={isActive ? 'text-forest-600' : ''} />
                <span className="text-2xs font-medium">{item.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
      {/* More menu button */}
      <button
        onClick={onOpenMenu}
        className="flex flex-col items-center justify-center gap-0.5 py-2 px-3 rounded-lg text-ink-400 hover:text-ink-600 transition-colors no-tap-highlight"
        aria-label="Plus de menus"
      >
        <Menu size={20} />
        <span className="text-2xs font-medium">Plus</span>
      </button>
    </nav>
  );
}
