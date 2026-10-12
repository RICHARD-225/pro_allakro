import { Users } from 'lucide-react';
import { Badge } from '@/components/ui';
import { formatDate, formatFCFA, formatPeriode } from '@/utils/format';
import { STATUT_SALAIRE_LABELS, TYPE_PAIEMENT_LABELS } from '@/constants';

// Bénéficiaire(s) des paiements d'une équipe : « via le chef d'équipe » ou le nom du membre payé
export function payeVia(salaire) {
  if (!salaire.equipe || !salaire.paiements.length) return null;
  if (salaire.paiements.every((p) => p.via_chef)) return "via le chef d'équipe";
  return `via ${[...new Set(salaire.paiements.map((p) => p.beneficiaire_nom))].join(', ')}`;
}

// Colonnes du tableau des rémunérations (clés de tri : voir `ordering_fields` de SalaireViewSet)
export const colonnesRemunerations = [
  {
    key: 'libelle', header: 'Rémunération', sortable: true,
    render: (row) => (
      <span className="block min-w-0 max-w-[15rem] whitespace-normal">
        <span className="font-medium text-ink-800">{row.travail ? row.travail.activite : row.libelle}</span>
        <span className="block text-xs text-ink-500">{formatPeriode(row.periode)} · {row.bloc_code || '—'}</span>
      </span>
    ),
  },
  {
    key: 'personne_nom', header: 'Bénéficiaire / équipe', sortable: true,
    render: (row) => (row.equipe ? (
      <span>
        <span className="inline-flex items-center gap-1 font-medium text-ink-800"><Users size={13} className="text-forest-600" />{row.equipe.nom}</span>
        <span className="block text-xs text-ink-500">Chef : {row.equipe.chef_nom} · {row.participants.length} pers.</span>
      </span>
    ) : <span className="font-medium text-ink-800">{row.personne_nom}</span>),
  },
  {
    key: 'date_debut', header: 'Période', sortable: true, mobile: false,
    render: (row) => (
      <span className="text-xs leading-tight tabular-nums">
        {formatDate(row.date_debut)}
        <span className="block text-ink-500">→ {formatDate(row.date_fin)}</span>
      </span>
    ),
  },
  {
    key: 'montant_du', header: 'Dû (net) / payé', sortable: true, mobile: false,
    render: (row) => (
      <span className="tabular-nums">
        {formatFCFA(row.montant_du)}
        <span className="block text-xs text-leaf-700">payé {formatFCFA(row.montant_paye)}</span>
      </span>
    ),
  },
  {
    key: 'reste', header: 'Reste', sortable: true,
    render: (row) => <span className={`tabular-nums font-semibold ${row.reste > 0 ? 'text-earth-700' : 'text-ink-500'}`}>{formatFCFA(row.reste)}</span>,
  },
  {
    key: 'statut', header: 'Statut', mobile: false,
    render: (row) => (
      <span>
        <Badge status={row.statut}>{STATUT_SALAIRE_LABELS[row.statut]}</Badge>
        {payeVia(row) && <span className="block text-2xs text-olive-700">{payeVia(row)}</span>}
      </span>
    ),
  },
];

// Colonnes du tableau des paiements effectués
export const colonnesPaiements = [
  {
    key: 'numero', header: 'N°', sortable: true,
    render: (row) => (
      <span className="inline-flex items-center gap-2">
        <span className={`text-xs font-medium tabular-nums ${row.annule ? 'text-ink-500 line-through' : 'text-forest-700'}`}>{row.numero}</span>
        {row.annule && <Badge status="ANNULEE">Annulé</Badge>}
      </span>
    ),
  },
  { key: 'date', header: 'Date', sortable: true, mobile: false, render: (row) => <span className="tabular-nums">{formatDate(row.date)}</span> },
  {
    key: 'beneficiaire_nom', header: 'Bénéficiaire', sortable: true,
    render: (row) => (
      <span>
        <span className="font-medium text-ink-800">{row.beneficiaire_nom}</span>
        {row.via_chef && <span className="block text-xs text-forest-700">Chef d'équipe · {row.equipe_nom}</span>}
        {!row.via_chef && row.mode === 'EQUIPE' && <span className="block text-xs text-olive-700">Membre · {row.equipe_nom}</span>}
      </span>
    ),
  },
  {
    key: 'salaire_libelle', header: 'Rémunération', mobile: false,
    render: (row) => (
      <span>
        <span className="text-ink-700">{row.activite || row.salaire_libelle}</span>
        {row.est_avance && <Badge status="pending" className="ml-1.5">Avance</Badge>}
        <span className="block text-xs text-ink-500">{row.bloc_code || '—'}</span>
      </span>
    ),
  },
  { key: 'type_paiement', header: 'Mode', mobile: false, render: (row) => TYPE_PAIEMENT_LABELS[row.type_paiement] || row.type_paiement },
  {
    key: 'montant', header: 'Montant', sortable: true,
    render: (row) => <span className={`tabular-nums font-semibold ${row.annule ? 'text-ink-500 line-through' : ''}`}>{formatFCFA(row.montant)}</span>,
  },
];
