import { useEffect, useRef, useState } from 'react';
import { Crown, HandCoins, Search, Users } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { salairesService } from '@/services';
import { formatFCFA, formatPeriode } from '@/utils/format';

const TAILLE = 30;
const GRILLE = 'sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]';
// Jour et mois seulement : l'année figure déjà dans la période affichée au-dessus
const jourMois = (date) => (date ? new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '');

function Montant({ libelle, valeur, fort = false }) {
  return (
    <div className="min-w-0">
      <span className="block text-2xs text-ink-500 sm:hidden">{libelle}</span>
      <span className={`tabular-nums ${fort ? 'font-semibold text-earth-700' : 'text-ink-700'}`}>{formatFCFA(valeur)}</span>
    </div>
  );
}

/**
 * « Nouveau paiement » : la liste des rémunérations à payer (solde positif, hors annulées), avec la personne, la
 * période, le montant, ce qui est déjà payé, le reste et un bouton « Payer » qui ouvre le paiement pré-rempli
 * (le montant proposé est le reste ; un paiement partiel reste possible, jamais au-delà du reste).
 * Une recherche retrouve une personne (ou un membre de l'équipe), une activité, un bloc, une période.
 */
export default function NouveauPaiementModal({ open, onClose, onPayer }) {
  const [recherche, setRecherche] = useState('');
  const [trouvees, setTrouvees] = useState([]);
  const [total, setTotal] = useState(0);     // rémunérations à payer correspondant à la recherche
  const [totalReste, setTotalReste] = useState(0);
  const [page, setPage] = useState(1);
  const [chargement, setChargement] = useState(false);
  const jeton = useRef(0);

  // La liste vient du serveur : rémunérations à solde positif (hors annulées), recherche sans accents, 30 par « page » (Afficher plus)
  useEffect(() => {
    if (!open) return undefined;
    const numero = ++jeton.current;
    const minuteur = window.setTimeout(() => {
      setChargement(true);
      const filtres = { a_payer: 1, ...(recherche.trim() ? { q: recherche.trim() } : {}) };
      Promise.all([
        salairesService.page({ ...filtres, page: 1, page_size: TAILLE * page, ordering: '-reste' }),
        salairesService.totaux(filtres),
      ]).then(([liste, totaux]) => {
        if (numero !== jeton.current) return;
        setTrouvees(liste.results);
        setTotal(liste.count);
        setTotalReste(totaux.reste || 0);
      }).catch(() => {}).finally(() => { if (numero === jeton.current) setChargement(false); });
    }, recherche ? 300 : 0);
    return () => window.clearTimeout(minuteur);
  }, [open, recherche, page]);

  const fermer = () => {
    setRecherche('');
    setPage(1);
    onClose();
  };

  if (!open) return null;

  return (
    <Modal open onClose={fermer} size="xl" title="Nouveau paiement"
      footer={<Button variant="outline" onClick={fermer}>Fermer</Button>}>
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            autoFocus
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher une personne..."
            aria-label="Rechercher une personne ou une rémunération"
            className="input-base pl-9"
          />
        </div>
        <p className="text-xs text-ink-500">
          {total === 0
            ? (chargement ? 'Chargement…' : 'Aucune rémunération à payer.')
            : <>{total} rémunération{total > 1 ? 's' : ''} à payer · reste <span className="font-semibold tabular-nums text-ink-700">{formatFCFA(totalReste)}</span></>}
        </p>

        <div className="overflow-hidden rounded-xl border border-ink-100">
          <div className={`hidden gap-4 border-b border-ink-100 bg-cream-50 px-4 py-2 text-xs font-medium text-ink-500 sm:grid ${GRILLE}`}>
            <span>Personne</span><span>Période</span><span>Rémunération</span><span>Déjà payé</span><span>Reste</span><span className="w-20" />
          </div>
          <ul className="max-h-[58vh] divide-y divide-ink-100 overflow-y-auto" aria-label="Rémunérations à payer">
            {trouvees.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-ink-500">
                {chargement ? 'Chargement…' : recherche.trim() ? 'Aucune rémunération ne correspond à cette recherche.' : 'Toutes les rémunérations sont payées.'}
              </li>
            )}
            {trouvees.map((s) => {
              const equipe = s.equipe;
              const detail = [s.travail ? s.travail.activite : s.libelle, s.bloc_code].filter(Boolean).join(' · ');
              return (
                <li key={s.id} data-remuneration={s.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-4 py-3.5 transition-colors hover:bg-cream-50 sm:items-center sm:gap-4 ${GRILLE}`}>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-medium text-ink-800">
                      <span className="truncate">{s.personne_nom}</span>
                      {equipe && <Crown size={13} className="shrink-0 text-olive-600" aria-label="Chef d'équipe" />}
                    </p>
                    <p className="truncate text-xs text-ink-500">{detail}</p>
                    {equipe && (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-2xs text-forest-700">
                        <Users size={11} className="shrink-0" /> {equipe.nom} · {s.participants.length} pers.
                      </p>
                    )}
                  </div>

                  <div className="col-start-2 row-start-1 sm:hidden">
                    <Button size="sm" onClick={() => onPayer(s)} aria-label={`Payer ${s.personne_nom}`}><HandCoins size={14} /> Payer</Button>
                  </div>

                  <div className="col-span-2 flex items-center gap-2 text-xs text-ink-600 sm:col-span-1 sm:block">
                    <span className="font-medium text-ink-700">{formatPeriode(s.periode)}</span>
                    <span className="block whitespace-nowrap text-2xs tabular-nums text-ink-500">{jourMois(s.date_debut)} → {jourMois(s.date_fin)}</span>
                  </div>

                  <div className="col-span-2 grid grid-cols-3 gap-2 text-sm sm:contents">
                    <Montant libelle="Rémunération" valeur={s.montant_du} />
                    <Montant libelle="Déjà payé" valeur={s.montant_paye} />
                    <div className="min-w-0">
                      <span className="block text-2xs text-ink-500 sm:hidden">Reste</span>
                      <span className="tabular-nums font-semibold text-earth-700">{formatFCFA(s.reste)}</span>
                    </div>
                  </div>

                  <div className="hidden sm:block">
                    <Button size="sm" onClick={() => onPayer(s)} aria-label={`Payer ${s.personne_nom}`}><HandCoins size={14} /> Payer</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        {trouvees.length < total && (
          <div className="text-center">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} loading={chargement}>
              Afficher plus ({trouvees.length} sur {total})
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
