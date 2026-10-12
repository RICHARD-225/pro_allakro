import { Users, User } from 'lucide-react';
import { Badge } from '@/components/ui';
import { formatFCFA, formatDate, formatNumber } from '@/utils/format';
import { STATUT_TRAVAIL_LABELS } from '@/constants';

// Colonnes du tableau des travaux (le travail n'a que son propre statut ; sa rémunération et ses paiements se suivent dans Salaires)
export const colonnesTravaux = [
  {
    key: 'activite', header: 'Activité', sortable: true,
    render: (row) => (
      <span className="block min-w-0">
        <span className="font-medium text-ink-800">{row.activite}</span>
        {row.precision_requise && <span className="ml-1.5 text-2xs font-normal text-ink-500">(autre)</span>}
        {/* Sur téléphone, le bloc et l'équipe sous l'activité (les colonnes dédiées sont masquées) */}
        <span className="block text-xs font-normal text-ink-500 md:hidden">
          {row.bloc_code} · {row.equipe_nom || row.responsable_nom || 'sans responsable'}
        </span>
      </span>
    ),
  },
  {
    key: 'bloc_code', header: 'Bloc', sortable: true, mobile: false,
    render: (row) => (
      <span>
        <span className="text-xs font-medium tabular-nums">{row.bloc_code}</span>
        <span className="block text-xs text-ink-500">{row.campement_nom}</span>
      </span>
    ),
  },
  {
    key: 'equipe_nom', header: 'Équipe / responsable', mobile: false,
    render: (row) => (row.equipe_nom ? (
      <span>
        <span className="inline-flex items-center gap-1 text-ink-700"><Users size={13} className="text-forest-600" />{row.equipe_nom}</span>
        <span className="block text-xs text-ink-500">Chef : {row.responsable_nom} · {row.nb_personnes} pers.</span>
      </span>
    ) : row.responsable_nom ? (
      <span className="inline-flex items-center gap-1 text-ink-700"><User size={13} className="text-forest-600" />{row.responsable_nom}</span>
    ) : <span className="text-ink-400">—</span>),
  },
  {
    key: 'date_travail', header: 'Période', sortable: true, mobile: false,
    render: (row) => (
      <span className="tabular-nums">
        {formatDate(row.date_travail)}
        <span className="block text-xs text-ink-500">→ {formatDate(row.date_fin)}</span>
      </span>
    ),
  },
  {
    key: 'quantite', header: 'Quantité', sortable: true, mobile: false,
    render: (row) => <span className="tabular-nums">{formatNumber(row.quantite)} {row.unite}</span>,
  },
  {
    key: 'montant_total', header: 'Montant', sortable: true,
    render: (row) => <span className="tabular-nums font-medium">{formatFCFA(row.montant_total)}</span>,
  },
  {
    // Le travail n'a que son propre statut ; sa rémunération et ses paiements se suivent dans Salaires
    key: 'statut', header: 'Statut',
    render: (row) => <Badge status={row.statut}>{STATUT_TRAVAIL_LABELS[row.statut] || row.statut}</Badge>,
  },
];
