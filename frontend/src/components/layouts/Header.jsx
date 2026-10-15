import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Search, LogOut, ChevronDown, WifiOff, User, Settings } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/constants';
import NotificationsMenu from '@/components/layouts/NotificationsMenu';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { personnesService, blocsService, campementsService, depensesService, produitsService, travauxService } from '@/services';

export default function Header({ onOpenMobileMenu }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [confirmerDeconnexion, setConfirmerDeconnexion] = useState(false);
  const [deconnexionEnCours, setDeconnexionEnCours] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const userMenuRef = useRef(null);
  const searchRef = useRef(null);

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
        travaux.filter((work) => `${work.activite} ${work.equipe_nom || ''} ${work.responsable_nom || ''}`.toLocaleLowerCase('fr').includes(lower))
          .slice(0, 3).forEach((work) => results.push({ type: 'Travail', label: `${work.activite} — ${work.bloc_code} (${work.equipe_nom || work.responsable_nom || work.periode})`, to: '/travaux' }));

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
    <>
    <header className="app-header h-16 border-b border-forest-800/40 flex items-center justify-between gap-3 px-3 sm:px-4 lg:px-6 shrink-0 z-30 shadow-xs">
      {/* Left: mobile menu + search */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="header-btn lg:hidden"
          aria-label="Ouvrir le menu"
        >
          <Menu size={20} />
        </button>

        {/* Global search */}
        <div ref={searchRef} className="relative flex-1 max-w-md">
          <div className="relative">
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
              placeholder="Rechercher…"
              className="header-search peer focus:ring-2 focus:ring-leaf-300/60"
            />
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-forest-100 peer-focus:text-ink-400" />
          </div>
          {showSearch && searchQuery.trim().length >= 2 && (
            <div id="global-search-results" className="absolute top-full z-50 mt-2 max-h-80 w-full overflow-y-auto rounded-lg border border-ink-100 bg-white shadow-soft-lg animate-scale-in" role="listbox" aria-live="polite">
              {isSearchLoading ? (
                <p className="px-3 py-4 text-sm text-ink-500">Recherche en cours…</p>
              ) : searchResults.length === 0 ? (
                <p className="px-3 py-4 text-sm text-ink-500">Aucun résultat pour « {searchQuery.trim()} ».</p>
              ) : Object.entries(grouped).map(([type, items]) => (
                <div key={type}>
                  <p className="bg-cream-50/50 px-3 py-1.5 text-xs font-semibold text-ink-500">{type}</p>
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

      {/* À droite : état de la connexion et compte */}
      <div className="flex items-center gap-2 shrink-0">
        {!isOnline && (
          <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-earth-50 text-earth-700 text-xs font-medium">
            <WifiOff size={14} />
            <span className="hidden sm:inline">Hors ligne</span>
          </span>
        )}

        <NotificationsMenu />

        {/* User menu */}
        <div ref={userMenuRef} className="relative">
          <button
            onClick={() => setShowUserMenu((v) => !v)}
            className="flex items-center gap-2 p-1.5 pr-2 rounded-lg hover:bg-white/10 transition-colors"
            aria-haspopup="menu"
            aria-expanded={showUserMenu}
          >
            <span className="sr-only">Menu du compte</span>
            <div className="w-8 h-8 rounded-full bg-white/15 ring-1 ring-white/25 flex items-center justify-center">
              <User size={16} className="text-white" />
            </div>
            <div className="hidden md:block text-left">
              <p className="text-xs font-semibold text-white leading-tight">{user?.name}</p>
              <p className="text-2xs text-forest-100 leading-tight">{ROLE_LABELS[user?.role] || 'Utilisateur'}</p>
            </div>
            <ChevronDown size={14} className="hidden md:block text-forest-100" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-soft-lg border border-ink-100 animate-scale-in z-50">
              <div className="px-4 py-3 border-b border-ink-100">
                <p className="text-sm font-semibold text-ink-800">{user?.name}</p>
                <p className="text-xs text-ink-500">{user?.email}</p>
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
                  onClick={() => { setShowUserMenu(false); setConfirmerDeconnexion(true); }}
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
      <ConfirmDialog
        open={confirmerDeconnexion}
        onClose={() => setConfirmerDeconnexion(false)}
        title="Se déconnecter ?"
        message="Vous devrez saisir à nouveau votre e-mail et votre mot de passe pour revenir dans l'application."
        confirmLabel="Se déconnecter"
        loading={deconnexionEnCours}
        onConfirm={async () => {
          setDeconnexionEnCours(true);
          try { await logout(); } finally { setDeconnexionEnCours(false); setConfirmerDeconnexion(false); }
          navigate('/login');
        }}
      />
    </>
  );
}
