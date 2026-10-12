import { useState, useEffect } from 'react';
import { ScrollText, Plus, Minus, Eye, CreditCard, LogIn, Settings, Ban, Lock, LockOpen } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { DataTable, ErrorState, Select } from '@/components/ui';
import { journalService } from '@/services';
import { useListeServeur } from '@/hooks/useListeServeur';
import { formatDateTime } from '@/utils/format';

const ACTION_ICONS = {
  'Connexion': LogIn,
  'Création': Plus,
  'Modification': Settings,
  'Suppression': Minus,
  'Consultation': Eye,
  'Paiement': CreditCard,
  'Annulation': Ban,
  'Clôture': Lock,
  'Réouverture': LockOpen,
};

const ACTION_BADGES = {
  'Connexion': 'bg-sage-50 text-sage-700',
  'Création': 'bg-leaf-50 text-leaf-700',
  'Modification': 'bg-olive-50 text-olive-700',
  'Suppression': 'bg-earth-50 text-earth-700',
  'Consultation': 'bg-ink-100 text-ink-600',
  'Paiement': 'bg-forest-50 text-forest-700',
  'Annulation': 'bg-earth-50 text-earth-700',
  'Clôture': 'bg-forest-50 text-forest-700',
  'Réouverture': 'bg-olive-50 text-olive-700',
};

// Actions enregistrées au journal (filtre)
const ACTIONS = ['Connexion', 'Création', 'Modification', 'Suppression', 'Consultation', 'Paiement', 'Annulation', 'Clôture', 'Réouverture'];

export default function JournalPage() {
  const [error, setError] = useState(false);
  const [filterAction, setFilterAction] = useState('');

  // Journal paginé par le serveur : page, recherche (action, élément, détails, utilisateur), tri et filtre par action
  const { lignes, serveur, chargement: loading, erreur } = useListeServeur({
    charger: (p) => journalService.page(p),
    filtres: { action: filterAction },
    tailleDefaut: 25,
  });
  useEffect(() => { if (erreur) setError(true); }, [erreur]);

  const actions = ACTIONS;

  const columns = [
    { key: 'details', header: 'Action', render: (row) => {
      const Icon = ACTION_ICONS[row.action] || Eye;
      const badgeClass = ACTION_BADGES[row.action] || 'bg-ink-100 text-ink-600';
      return (
        <span className="block max-w-xl whitespace-normal">
          <span className={`mr-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium ${badgeClass}`}>
            <Icon size={11} />
            {row.action}
          </span>
          <span className="text-sm text-ink-700">{row.details}</span>
        </span>
      );
    } },
    { key: 'utilisateur', header: 'Utilisateur', sortable: true, render: (row) => <span className="font-medium text-ink-800">{row.utilisateur}</span> },
    { key: 'timestamp', header: 'Date', sortable: true, render: (row) => <span className="tabular-nums text-ink-600">{formatDateTime(row.timestamp)}</span> },
    { key: 'entite', header: 'Élément', mobile: false },
  ];

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader title="Journal" subtitle="Historique des actions" icon={ScrollText} />

      <DataTable
        columns={columns}
        data={lignes}
        serveur={serveur}
        loading={loading}
        searchPlaceholder="Rechercher une action..."
        filters={(
          <Select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            options={actions.map((a) => ({ value: a, label: a }))}
            placeholder="Action" emptyLabel="Toutes les actions"
            className="w-full sm:w-40"
          />
        )}
        filtersActive={filterAction ? 1 : 0}
        onResetFilters={() => setFilterAction('')}
        emptyTitle="Aucune action"
      />
    </div>
  );
}
