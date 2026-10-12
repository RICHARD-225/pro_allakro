import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Ban, Bell, CheckCheck, Lock, PackageMinus, Wallet } from 'lucide-react';
import { notificationsService } from '@/services';
import { formatDateTime } from '@/utils/format';

const ICONES = { stock: PackageMinus, annulation: Ban, securite: Lock, salaires: Wallet, cloture: Lock };
const DELAI_ACTUALISATION = 60000;

/**
 * Cloche des notifications : nombre de non lues, liste déroulante, lecture d'une notification ou de toutes.
 * Actualisée toutes les minutes tant que l'onglet est visible (et à chaque retour sur l'onglet).
 */
export default function NotificationsMenu() {
  const navigate = useNavigate();
  const [ouvert, setOuvert] = useState(false);
  const [donnees, setDonnees] = useState({ non_lues: 0, notifications: [] });
  const racine = useRef(null);

  const charger = useCallback(() => notificationsService.get().then(setDonnees).catch(() => {}), []);

  useEffect(() => {
    charger();
    const minuteur = window.setInterval(() => { if (!document.hidden) charger(); }, DELAI_ACTUALISATION);
    const retour = () => { if (!document.hidden) charger(); };
    document.addEventListener('visibilitychange', retour);
    return () => { window.clearInterval(minuteur); document.removeEventListener('visibilitychange', retour); };
  }, [charger]);

  useEffect(() => {
    const dehors = (e) => { if (racine.current && !racine.current.contains(e.target)) setOuvert(false); };
    document.addEventListener('mousedown', dehors);
    return () => document.removeEventListener('mousedown', dehors);
  }, []);

  const ouvrir = async (n) => {
    setOuvert(false);
    if (!n.lue) {
      setDonnees((d) => ({ non_lues: Math.max(0, d.non_lues - 1), notifications: d.notifications.map((x) => (x.id === n.id ? { ...x, lue: true } : x)) }));
      notificationsService.lire(n.id).catch(() => {});
    }
    if (n.lien) navigate(n.lien);
  };

  const toutLire = async () => {
    await notificationsService.toutLire().catch(() => {});
    setDonnees((d) => ({ non_lues: 0, notifications: d.notifications.map((x) => ({ ...x, lue: true })) }));
  };

  return (
    <div ref={racine} className="relative">
      <button
        type="button"
        onClick={() => { setOuvert((v) => !v); if (!ouvert) charger(); }}
        className="relative rounded-lg p-2 text-white/90 transition-colors hover:bg-white/10"
        aria-label={donnees.non_lues ? `Notifications : ${donnees.non_lues} non lue(s)` : 'Notifications'}
        aria-expanded={ouvert}
        aria-haspopup="true"
      >
        <Bell size={18} />
        {donnees.non_lues > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-earth-500 px-1 text-2xs font-semibold leading-none text-white">
            {donnees.non_lues > 9 ? '9+' : donnees.non_lues}
          </span>
        )}
      </button>

      {ouvert && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-ink-100 bg-white shadow-soft-lg animate-scale-in">
          <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2.5">
            <p className="text-sm font-semibold text-ink-800">Notifications</p>
            {donnees.non_lues > 0 && (
              <button type="button" onClick={toutLire} className="inline-flex items-center gap-1 text-xs font-medium text-forest-700 hover:underline">
                <CheckCheck size={13} /> Tout marquer comme lu
              </button>
            )}
          </div>
          <ul className="max-h-88 divide-y divide-ink-100 overflow-y-auto">
            {donnees.notifications.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-500">Aucune notification.</li>}
            {donnees.notifications.map((n) => {
              const Icone = ICONES[n.type] || AlertTriangle;
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => ouvrir(n)}
                    className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-cream-50 ${n.lue ? '' : 'bg-forest-50/40'}`}>
                    <Icone size={16} className={`mt-0.5 shrink-0 ${n.lue ? 'text-ink-400' : 'text-forest-600'}`} />
                    <span className="min-w-0">
                      <span className={`block text-sm ${n.lue ? 'text-ink-700' : 'font-semibold text-ink-800'}`}>{n.titre}</span>
                      {n.message && <span className="block text-xs text-ink-600">{n.message}</span>}
                      <span className="mt-0.5 block text-2xs tabular-nums text-ink-400">{formatDateTime(n.date)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
