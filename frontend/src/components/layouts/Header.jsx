import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Search, Bell, LogOut, ChevronDown, WifiOff, User, Settings } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS, APP_NAME } from '@/constants';
import { personnesService, blocsService, campementsService, depensesService, produitsService, travauxService } from '@/services';

export default function Header({ onOpenMobileMenu }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const userMenuRef = useRef(null);
  const searchRef = useRef(null);
  const notificationsRef = useRef(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearch(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounce the mock-service reads so typing does not reload every dataset on each keypress.
  useEffect(() => {
    const query = searchQuery.trim();
    let cancelled = false;
    if (query.length < 2) {
      setSearchResults([]);
      setIsSearchLoading(false);
      return undefined;
    }

    setIsSearchLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const lower = query.toLocaleLowerCase('fr');
        const [personnes, blocs, campements, depenses, produits, travaux] = await Promise.all([
          personnesService.getAll(),
          blocsService.getAll(),
          campementsService.getAll(),
          depensesService.getAll(),
          produitsService.getAll(),
          travauxService.getAll(),
        ]);
        const results = [];
        personnes.filter((person) => `${person.prenom} ${person.nom} ${person.matricule || ''}`.toLocaleLowerCase('fr').includes(lower))
          .slice(0, 3).forEach((person) => results.push({ type: 'Personne', label: `${person.prenom} ${person.nom}`, to: '/personnes' }));
        blocs.filter((block) => block.nom.toLocaleLowerCase('fr').includes(lower) || block.code.toLocaleLowerCase('fr').includes(lower))
          .slice(0, 3).forEach((block) => results.push({ type: 'Bloc', label: `${block.code} — ${block.nom}`, to: `/blocs/${block.id}` }));
        campements.filter((camp) => camp.nom.toLocaleLowerCase('fr').includes(lower))
          .slice(0, 3).forEach((camp) => results.push({ type: 'Campement', label: camp.nom, to: '/campements' }));
        depenses.filter((expense) => expense.designation.toLocaleLowerCase('fr').includes(lower))
          .slice(0, 3).forEach((expense) => results.push({ type: 'Dépense', label: expense.designation, to: '/depenses' }));
        produits.filter((product) => product.nom.toLocaleLowerCase('fr').includes(lower))
          .slice(0, 3).forEach((product) => results.push({ type: 'Produit', label: product.nom, to: '/stock' }));
        travaux.filter((work) => work.type_travail_libelle.toLocaleLowerCase('fr').includes(lower))
          .slice(0, 3).forEach((work) => results.push({ type: 'Travail', label: `${work.type_travail_libelle} — ${work.periode}`, to: '/travaux' }));

        if (!cancelled) setSearchResults(results);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setIsSearchLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  const handleResultClick = (to) => {
    navigate(to);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const grouped = useMemo(() => {
    const groups = {};
    searchResults.forEach((r) => {
      if (!groups[r.type]) groups[r.type] = [];
      groups[r.type].push(r);
    });
    return groups;
  }, [searchResults]);

  return (
    <header className="h-16 bg-white border-b border-ink-100 flex items-center justify-between gap-4 px-4 lg:px-6 shrink-0 z-30">
      {/* Left: mobile menu + search */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg text-ink-500 hover:bg-ink-50 transition-colors"
          aria-label="Ouvrir le menu"
        >
          <Menu size={20} />
        </button>

        {/* Global search */}
        <div ref={searchRef} className="relative flex-1 max-w-md">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              role="combobox"
              aria-label="Rechercher dans l’application"
              aria-expanded={showSearch && searchQuery.trim().length >= 2}
              aria-controls="global-search-results"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setShowSearch(true)}
              onKeyDown={(event) => event.key === 'Escape' && setShowSearch(false)}
              placeholder="Rechercher personne, bloc, dépense..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-cream-50 border border-ink-200 rounded-lg text-ink-800 placeholder:text-ink-400 focus:bg-white focus:border-forest-400 focus:ring-2 focus:ring-forest-100 transition-all"
            />
          </div>
          {showSearch && searchQuery.trim().length >= 2 && (
            <div id="global-search-results" className="absolute top-full z-50 mt-2 max-h-80 w-full overflow-y-auto rounded-lg border border-ink-100 bg-white shadow-soft-lg animate-scale-in" role="listbox" aria-live="polite">
              {isSearchLoading ? (
                <p className="px-3 py-4 text-sm text-ink-500">Recherche en cours…</p>
              ) : searchResults.length === 0 ? (
                <p className="px-3 py-4 text-sm text-ink-500">Aucun résultat pour « {searchQuery.trim()} ».</p>
              ) : Object.entries(grouped).map(([type, items]) => (
                <div key={type}>
                  <p className="px-3 py-1.5 text-2xs font-semibold text-ink-400 uppercase tracking-wide bg-cream-50/50">{type}</p>
                  {items.map((item, i) => (
                    <button
                      key={i}
                      role="option"
                      aria-selected="false"
                      onClick={() => handleResultClick(item.to)}
                      className="w-full px-3 py-2 text-left text-sm text-ink-700 hover:bg-cream-50 transition-colors flex items-center gap-2"
                    >
                      <Search size={12} className="text-ink-300" />
                      {item.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: online status, notifications, user */}
      <div className="flex items-center gap-2 shrink-0">
        {!isOnline && (
          <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-earth-50 text-earth-700 text-xs font-medium">
            <WifiOff size={14} />
            <span className="hidden sm:inline">Hors ligne</span>
          </span>
        )}

        <div ref={notificationsRef} className="relative">
          <button
            type="button"
            onClick={() => setShowNotifications((visible) => !visible)}
            className="relative rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-50"
            aria-label="Notifications"
            aria-expanded={showNotifications}
          >
            <Bell size={18} />
          </button>
          {showNotifications && (
            <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-ink-100 bg-white p-4 shadow-soft-lg" role="status">
              <p className="text-sm font-semibold text-ink-800">Notifications</p>
              <p className="mt-2 text-sm text-ink-500">Aucune notification pour le moment.</p>
            </div>
          )}
        </div>

        {/* User menu */}
        <div ref={userMenuRef} className="relative">
          <button
            onClick={() => setShowUserMenu((v) => !v)}
            className="flex items-center gap-2 p-1.5 pr-2 rounded-lg hover:bg-ink-50 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-forest-100 flex items-center justify-center">
              <User size={16} className="text-forest-700" />
            </div>
            <div className="hidden md:block text-left">
              <p className="text-xs font-semibold text-ink-700 leading-tight">{user?.name}</p>
              <p className="text-2xs text-ink-400 leading-tight">{ROLE_LABELS[user?.role] || 'Utilisateur'}</p>
            </div>
            <ChevronDown size={14} className="hidden md:block text-ink-400" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-soft-lg border border-ink-100 animate-scale-in z-50">
              <div className="px-4 py-3 border-b border-ink-100">
                <p className="text-sm font-semibold text-ink-800">{user?.name}</p>
                <p className="text-xs text-ink-400">{user?.email}</p>
                <span className="inline-flex mt-1.5 px-2 py-0.5 rounded-full text-2xs font-medium bg-forest-50 text-forest-700">
                  {ROLE_LABELS[user?.role]}
                </span>
              </div>
              <div className="p-1.5">
                <button
                  onClick={() => { setShowUserMenu(false); navigate('/parametres'); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50 rounded-lg transition-colors"
                >
                  <Settings size={16} />
                  Paramètres du compte
                </button>
                <button
                  onClick={async () => { await logout(); navigate('/login'); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-earth-700 hover:bg-earth-50 rounded-lg transition-colors"
                >
                  <LogOut size={16} />
                  Déconnexion
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
