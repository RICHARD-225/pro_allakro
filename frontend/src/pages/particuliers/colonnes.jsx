import { Phone } from 'lucide-react';
import { Badge } from '@/components/ui';
import { formatDate, formatFCFA, formatNumber } from '@/utils/format';
import { STATUT_ACHAT_LABELS } from '@/constants';

// Colonnes du tableau des achats aux particuliers (clés de tri : voir `ordering_fields` d'AchatParticulierViewSet)
export const colonnesAchats = [
  { key: 'particulier_nom', header: 'Vendeur', sortable: true, render: (row) => (
    <span>
      <span className="font-medium text-ink-800">{row.particulier_nom}</span>
      {row.particulier_telephone && (
        <span className="flex items-center gap-1 text-xs font-normal tabular-nums text-ink-500"><Phone size={12} />{row.particulier_telephone}</span>
      )}
    </span>
  ) },
  { key: 'montant_total', header: 'Montant', sortable: true, render: (row) => (
    <span className="tabular-nums">
      <span className="font-medium">{formatFCFA(row.montant_total)}</span>
      {row.reste > 0 && <span className="block text-2xs text-earth-600">reste {formatFCFA(row.reste)}</span>}
    </span>
  ) },
  { key: 'statut', header: 'Paiement', render: (row) => <Badge status={row.statut}>{STATUT_ACHAT_LABELS[row.statut]}</Badge> },
  { key: 'date_achat', header: 'Réf. / date', sortable: true, mobile: false, render: (row) => (
    <span>
      <span className="text-xs font-medium tabular-nums text-forest-700">{row.reference}</span>
      <span className="block text-xs tabular-nums text-ink-500">{formatDate(row.date_achat)}</span>
    </span>
  ) },
  { key: 'designation', header: 'Produit', sortable: true, mobile: false, render: (row) => (
    <span>
      <span className="text-ink-700">{row.designation}</span>
      <span className="block text-2xs tabular-nums text-ink-500">{row.bloc_code}</span>
    </span>
  ) },
  { key: 'poids', header: 'Quantité', sortable: true, mobile: false, render: (row) => (
    <span className="tabular-nums">
      {formatNumber(row.poids)} {row.unite_poids}
      <span className="block text-2xs text-ink-500">× {formatFCFA(row.prix_unitaire)}</span>
    </span>
  ) },
];
