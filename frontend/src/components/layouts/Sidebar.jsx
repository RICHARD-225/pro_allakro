import { NavLink, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, Trees, Users, HardHat, Wallet,
  Package, ShoppingBag, FileBarChart, Settings, ChevronLeft, ChevronDown,
  Sprout, Leaf, TreePine, UserCircle, Shield, ScrollText,
  Tags, PenTool, CreditCard, TrendingUp, History, HandCoins, UserCog,
} from 'lucide-react';
import { APP_NAME, APP_TAGLINE, ROLE } from '@/constants';
import { useAuth } from '@/contexts/AuthContext';

// Lien principal hors section
const HOME = { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard };

// Sections repliables : seule la section de la page courante est ouverte par défaut
const NAV_SECTIONS = [
  {
    title: 'Exploitation',
    icon: Sprout,
    items: [
      { to: '/plantations', label: 'Plantations', icon: Sprout },
      { to: '/campements', label: 'Campements', icon: TreePine },
      { to: '/blocs', label: 'Blocs / Parcelles', icon: Leaf },
    ],
  },
  {
    title: 'Personnel',
    icon: Users,
    items: [
      { to: '/personnes', label: 'Personnes', icon: Users },
      { to: '/equipes', label: 'Équipes', icon: Shield },
    ],
  },
  {
    title: 'Travaux',
    icon: HardHat,
    items: [
      { to: '/travaux', label: 'Travaux', icon: HardHat },
      { to: '/types-travaux', label: 'Types de travaux', icon: PenTool },
    ],
  },
  {
    title: 'Finances',
    icon: Wallet,
    items: [
      { to: '/depenses', label: 'Dépenses', icon: CreditCard },
      { to: '/categories', label: 'Catégories', icon: Tags },
      { to: '/remunerations', label: 'Rémunérations', icon: Wallet },
      { to: '/paiements', label: 'Paiements', icon: HandCoins },
      { to: '/previsions', label: 'Prévisions', icon: TrendingUp },
    ],
  },
  {
    title: 'Stock & achats',
    icon: Package,
    items: [
      { to: '/stock', label: 'Stock', icon: Package },
      { to: '/particuliers', label: 'Achats particuliers', icon: ShoppingBag },
    ],
  },
  {
    title: 'Rapports',
    icon: FileBarChart,
    items: [
      { to: '/bilan', label: 'Bilan mensuel', icon: FileBarChart },
      { to: '/rapports', label: 'Rapports', icon: ScrollText },
    ],
  },
  {
    title: 'Administration',
    icon: UserCog,
    items: [
      { to: '/utilisateurs', label: 'Utilisateurs', icon: UserCircle },
      { to: '/journal', label: 'Journal', icon: History },
    ],
    roles: [ROLE.BIG_BOSS],
  },
];

// Paramètres du compte (mot de passe, apparence) : accessibles à tous les rôles
const PARAMETRES = { to: '/parametres', label: 'Paramètres', icon: Settings };

const isInSection = (section, pathname) => section.items.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));

function NavItem({ item, collapsed, onClick, nested = false }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onClick}
      className={({ isActive }) =>
        `nav-item ${isActive ? 'nav-item-active' : ''} ${collapsed ? 'justify-center px-2' : ''} ${nested && !collapsed ? 'py-1.5 pl-9' : ''}`
      }
      title={collapsed ? item.label : undefined}
      aria-label={item.label}
    >
      {(!nested || collapsed) && <Icon size={18} className="nav-item-icon shrink-0" />}
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
}

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }) {
  const { user } = useAuth();
  const { pathname } = useLocation();

  const sections = useMemo(
    () => NAV_SECTIONS.filter((s) => !s.roles || s.roles.includes(user?.role)),
    [user],
  );

  const [openSections, setOpenSections] = useState(() => new Set(
    NAV_SECTIONS.filter((s) => isInSection(s, pathname)).map((s) => s.title),
  ));

  // Ouvre automatiquement la section de la page courante
  useEffect(() => {
    const current = NAV_SECTIONS.find((s) => isInSection(s, pathname));
    if (current) setOpenSections((prev) => (prev.has(current.title) ? prev : new Set(prev).add(current.title)));
  }, [pathname]);

  const toggleSection = (title) => setOpenSections((prev) => {
    const next = new Set(prev);
    if (next.has(title)) next.delete(title); else next.add(title);
    return next;
  });

  const content = (
    <>
      {/* Logo / Brand */}
      <div className={`flex items-center gap-3 px-4 h-16 border-b border-ink-100 shrink-0 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-9 h-9 rounded-lg bg-forest-600 flex items-center justify-center shrink-0">
          <Trees size={20} className="text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold text-forest-800 leading-tight">{APP_NAME}</p>
            <p className="text-2xs text-ink-400 leading-tight">{APP_TAGLINE}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-none py-3 px-2 space-y-0.5">
        <NavItem item={HOME} collapsed={collapsed} onClick={onCloseMobile} />

        {sections.map((section) => {
          const SectionIcon = section.icon;
          const open = openSections.has(section.title);
          const active = isInSection(section, pathname);

          // Sidebar repliée : on affiche directement les icônes des pages
          if (collapsed) {
            return (
              <div key={section.title} className="pt-2 mt-2 border-t border-ink-100 space-y-0.5">
                {section.items.map((item) => (
                  <NavItem key={item.to} item={item} collapsed onClick={onCloseMobile} />
                ))}
              </div>
            );
          }

          return (
            <div key={section.title}>
              <button
                type="button"
                onClick={() => toggleSection(section.title)}
                aria-expanded={open}
                className={`nav-item w-full ${active && !open ? 'text-forest-700 font-medium' : ''}`}
              >
                <SectionIcon size={18} className="nav-item-icon shrink-0" />
                <span className="flex-1 truncate text-left">{section.title}</span>
                <ChevronDown size={14} className={`shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="mt-0.5 space-y-0.5 animate-fade-in">
                  {section.items.map((item) => (
                    <NavItem key={item.to} item={item} nested onClick={onCloseMobile} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="pt-2 mt-2 border-t border-ink-100">
          <NavItem item={PARAMETRES} collapsed={collapsed} onClick={onCloseMobile} />
        </div>
      </nav>

      {/* Collapse toggle — desktop only */}
      <div className="hidden lg:flex items-center justify-center border-t border-ink-100 py-2 shrink-0">
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg text-ink-400 hover:bg-ink-50 hover:text-ink-600 transition-colors"
          aria-label={collapsed ? 'Déplier la sidebar' : 'Replier la sidebar'}
        >
          <ChevronLeft size={18} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-white border-r border-ink-100 transition-all duration-200 shrink-0 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        {content}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 animate-fade-in">
          <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-sm" onClick={onCloseMobile} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white flex flex-col animate-slide-in-left shadow-soft-lg">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
