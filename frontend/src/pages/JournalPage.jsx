import { useState, useEffect } from 'react';
import { ScrollText, Plus, Minus, Eye, CreditCard, LogIn, Settings } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { DataTable, Badge, ErrorState, Select } from '@/components/ui';
import { journalService } from '@/services';
import { formatDateTime } from '@/utils/format';

const ACTION_ICONS = {
  'Connexion': LogIn,
  'Création': Plus,
  'Modification': Settings,
  'Suppression': Minus,
  'Consultation': Eye,
  'Paiement': CreditCard,
};

const ACTION_BADGES = {
  'Connexion': 'bg-sage-50 text-sage-700',
  'Création': 'bg-leaf-50 text-leaf-700',
  'Modification': 'bg-olive-50 text-olive-700',
  'Suppression': 'bg-earth-50 text-earth-700',
  'Consultation': 'bg-ink-100 text-ink-600',
  'Paiement': 'bg-forest-50 text-forest-700',
};

export default function JournalPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filterAction, setFilterAction] = useState('');

  useEffect(() => {
    journalService.getAll()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const actions = [...new Set(data.map((d) => d.action))];

  const filtered = data.filter((d) => !filterAction || d.action === filterAction);

  const columns = [
    { key: 'timestamp', header: 'Date/Heure', sortable: true, render: (row) => <span className="text-ink-600 text-xs">{formatDateTime(row.timestamp)}</span> },
    { key: 'utilisateur', header: 'Utilisateur', sortable: true, render: (row) => <span className="font-medium text-ink-800">{row.utilisateur}</span> },
    { key: 'action', header: 'Action', render: (row) => {
      const Icon = ACTION_ICONS[row.action] || Eye;
      const badgeClass = ACTION_BADGES[row.action] || 'bg-ink-100 text-ink-600';
      return (
        <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs font-medium ${badgeClass}`}>
          <Icon size={11} />
          {row.action}
        </span>
      );
    } },
    { key: 'entite', header: 'Entité' },
    { key: 'details', header: 'Détails', render: (row) => <span className="text-ink-600 text-xs">{row.details}</span> },
  ];

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-5">
      <PageHeader title="Journal" subtitle="Historique des actions" icon={ScrollText} />

      <Select
        value={filterAction}
        onChange={(e) => setFilterAction(e.target.value)}
        options={actions.map((a) => ({ value: a, label: a }))}
        placeholder="Toutes les actions"
        className="w-48"
      />

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        searchPlaceholder="Rechercher dans le journal..."
        searchKeys={['utilisateur', 'entite', 'details']}
      />
    </div>
  );
}
