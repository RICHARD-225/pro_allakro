import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { Badge } from '@/components/ui';
import { formatDate, formatFCFA, formatNumber } from '@/utils/format';

// Entrée : +, sortie : −, ajustement d'inventaire : le signe de l'écart (la quantité d'un ajustement est signée)
const sensDe = (m) => (m.type_mouvement === 'SORTIE' || Number(m.quantite) < 0 ? -1 : 1);

// Colonnes du tableau des produits
export const colonnesProduits = [
  { key: 'nom', header: 'Produit', sortable: true, render: (row) => (
    <span>
      <span className="font-medium text-ink-800">{row.nom}</span>
      <span className="block text-xs font-normal text-ink-500"><span className="tabular-nums text-forest-700">{row.code}</span> · {row.categorie || '—'}</span>
    </span>
  ) },
  { key: 'stock_calcule', header: 'Stock', sortable: true, render: (row) => (
    <span className="tabular-nums">
      <span className={`font-medium ${row.status === 'low' ? 'text-earth-600' : 'text-ink-800'}`}>{formatNumber(row.stock_calcule)} {row.unite}</span>
      <span className="block text-2xs text-ink-500">seuil {formatNumber(row.stock_minimum)} {row.unite}</span>
    </span>
  ) },
  { key: 'status', header: 'État', render: (row) => (row.actif
    ? <Badge status={row.status}>{row.status === 'low' ? 'Faible' : 'OK'}</Badge>
    : <Badge status="inactive">Retiré du stock</Badge>) },
  { key: 'valeur_stock', header: 'Valeur', sortable: true, mobile: false, render: (row) => <span className="tabular-nums">{formatFCFA(row.valeur_stock)}</span> },
];

// Colonnes du tableau des mouvements (clés de tri : voir `ordering_fields` de MouvementStockViewSet)
export const colonnesMouvements = [
  { key: 'produit_nom', header: 'Produit', sortable: true, render: (row) => (
    <span>
      <span className="font-medium text-ink-800">{row.produit_nom}</span>
      <span className="block max-w-[16rem] truncate text-xs font-normal text-ink-500">{row.motif}</span>
    </span>
  ) },
  { key: 'quantite', header: 'Quantité', sortable: true, render: (row) => (
    // Entrée : +, sortie : −, ajustement d'inventaire : le signe de l'écart (la quantité d'un ajustement est signée)
    <span className={`inline-flex items-center gap-1 tabular-nums ${sensDe(row) > 0 ? 'text-leaf-700' : 'text-earth-700'}`}>
      {sensDe(row) > 0 ? <ArrowDownCircle size={14} /> : <ArrowUpCircle size={14} />}
      {sensDe(row) > 0 ? '+' : '−'}{formatNumber(Math.abs(row.quantite))} {row.unite}
      {row.type_mouvement === 'AJUSTEMENT' && <span className="ml-1 rounded bg-olive-100 px-1.5 text-2xs font-medium text-olive-700">Ajustement</span>}
    </span>
  ) },
  { key: 'date', header: 'Date', sortable: true, render: (row) => <span className="tabular-nums">{formatDate(row.date)}</span> },
  { key: 'bloc_code', header: 'Bloc', mobile: false, render: (row) => (
    <span>
      <span className="text-xs font-medium tabular-nums">{row.bloc_code || '—'}</span>
      <span className="block text-xs text-ink-500">{row.campement_nom}</span>
    </span>
  ) },
];
