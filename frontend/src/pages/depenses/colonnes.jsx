import { Badge } from '@/components/ui';
import { formatDate, formatFCFA, formatPeriode } from '@/utils/format';
import { STATUT_DEPENSE_LABELS } from '@/constants';

// Page d'origine d'une dépense issue d'un paiement de salaire ou d'un achat : c'est là qu'elle se modifie
export const pageSource = (row) => (row.origine?.type === 'SALAIRE' ? '/salaires?onglet=paiements' : '/particuliers');

// Libellé court : pour un salaire, l'activité et le bénéficiaire plutôt que la longue désignation générée ;
// le numéro du paiement ou de l'achat à la source reste lisible en dessous
function Designation({ row }) {
  const o = row.origine;
  if (o?.type === 'SALAIRE') {
    return (
      <span className="block max-w-[18rem] whitespace-normal">
        <span className="font-medium text-ink-800">{o.est_avance ? 'Avance' : 'Salaire'}{o.activite ? ` — ${o.activite}` : ''}</span>
        <span className="block text-xs text-ink-500">{o.beneficiaire_nom}{o.beneficiaire_nom && ' · '}<span className="tabular-nums">{o.reference}</span></span>
      </span>
    );
  }
  return (
    <span className="block max-w-[18rem] whitespace-normal">
      <span className="font-medium text-ink-800">{row.designation}</span>
      {o?.type === 'ACHAT' && <span className="block text-xs text-ink-500">Achat <span className="tabular-nums">{o.reference}</span></span>}
    </span>
  );
}

// Colonnes du tableau des dépenses (clés de tri : voir `ordering_fields` de DepenseViewSet)
export const colonnesDepenses = [
  { key: 'designation', header: 'Désignation', sortable: true, render: (row) => <Designation row={row} /> },
  { key: 'categorie', header: 'Catégorie / période', sortable: true, render: (row) => (
    <span>
      <span className="text-ink-700">{row.categorie}</span>
      <span className="block text-xs text-ink-500">{formatPeriode(row.periode)}</span>
    </span>
  ) },
  { key: 'bloc_code', header: 'Bloc', mobile: false, render: (row) => (
    <span>
      <span className="text-xs tabular-nums">{row.bloc_code || '—'}</span>
      <span className="block text-xs text-ink-500">{row.campement_nom}</span>
    </span>
  ) },
  { key: 'date', header: 'Date', sortable: true, mobile: false, render: (row) => <span className="tabular-nums">{formatDate(row.date)}</span> },
  { key: 'montant_total', header: 'Montant', sortable: true, render: (row) => <span className="tabular-nums font-medium">{formatFCFA(row.montant_total)}</span> },
  { key: 'statut', header: 'Statut', mobile: false, render: (row) => <Badge status={row.statut}>{STATUT_DEPENSE_LABELS[row.statut]}</Badge> },
];
