import { useCallback, useEffect, useState } from 'react';
import { Lock, LockOpen, ShieldCheck } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { useSuppression } from '@/hooks/useSuppression';
import { useAuth } from '@/contexts/AuthContext';
import { cloturesService } from '@/services';
import { ROLE } from '@/constants';
import { formatDateTime, formatPeriode } from '@/utils/format';

const moisCourant = () => new Date().toISOString().slice(0, 7);

/**
 * Clôture du mois affiché dans le bilan : chiffres figés, plus aucune écriture sur les données du mois (Big Boss : clôturer / rouvrir).
 * `periode` : AAAA-MM du bilan affiché.
 */
export default function ClotureMois({ periode, onChange }) {
  const { user } = useAuth();
  const estBoss = user?.role === ROLE.BIG_BOSS;
  const [clotures, setClotures] = useState([]);
  const charger = useCallback(() => cloturesService.getAll().then(setClotures).catch(() => {}), []);
  useEffect(() => { charger(); }, [charger]);

  const cloture = clotures.find((c) => c.periode === periode);
  const fermee = Boolean(cloture?.cloturee);
  const termine = periode && periode < moisCourant();

  const { demander: cloturerMois, dialogue: dialogueCloture } = useSuppression({
    supprimer: (p) => cloturesService.cloturer(p),
    apres: () => { charger(); onChange?.(); },
    titre: 'Clôturer le mois',
    libelleBouton: 'Clôturer le mois',
    message: (p) => `Clôturer ${formatPeriode(p)} ? Les chiffres du mois sont figés et plus aucun travail, dépense, paiement, achat ou mouvement de stock `
      + 'de ce mois ne peut être ajouté, modifié ou supprimé. Vous pourrez rouvrir le mois si nécessaire.',
    succes: (p) => `${formatPeriode(p)} clôturé`,
  });
  const { demander: rouvrir, dialogue: dialogueReouverture } = useSuppression({
    supprimer: (p) => cloturesService.rouvrir(p),
    apres: () => { charger(); onChange?.(); },
    titre: 'Rouvrir le mois',
    libelleBouton: 'Rouvrir le mois',
    message: (p) => `Rouvrir ${formatPeriode(p)} ? Les écritures redeviennent possibles sur ce mois ; la réouverture est tracée au journal.`,
    succes: (p) => `${formatPeriode(p)} rouvert`,
  });

  if (!periode) return null;

  return (
    <Card className={`flex flex-wrap items-center justify-between gap-3 p-4 ${fermee ? 'border-forest-200 bg-forest-50/40' : ''}`}>
      <div className="flex min-w-0 items-start gap-3">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${fermee ? 'bg-forest-100 text-forest-700' : 'bg-cream-100 text-ink-500'}`}>
          {fermee ? <Lock size={16} /> : <ShieldCheck size={16} />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-800">{fermee ? `${formatPeriode(periode)} est clôturé` : `${formatPeriode(periode)} est ouvert`}</p>
          <p className="text-xs text-ink-600">
            {fermee
              ? `Clôturé le ${formatDateTime(cloture.date_cloture)}${cloture.cloturee_par ? ` par ${cloture.cloturee_par}` : ''} : les chiffres sont figés et le mois n'accepte plus d'écriture.`
              : cloture?.date_reouverture
                ? `Rouvert le ${formatDateTime(cloture.date_reouverture)}${cloture.reouverte_par ? ` par ${cloture.reouverte_par}` : ''}.`
                : termine ? 'Mois terminé : il peut être clôturé pour figer ses chiffres.' : 'Le mois en cours ne peut pas encore être clôturé.'}
          </p>
        </div>
      </div>
      {estBoss && fermee && (
        <Button variant="outline" size="sm" onClick={() => rouvrir(periode)}><LockOpen size={15} /> Rouvrir le mois</Button>
      )}
      {estBoss && !fermee && termine && (
        <Button size="sm" onClick={() => cloturerMois(periode)}><Lock size={15} /> Clôturer le mois</Button>
      )}
      {dialogueCloture}
      {dialogueReouverture}
    </Card>
  );
}
