import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sprout, Plus } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import PlantationModal from '@/components/exploitation/PlantationModal';
import RowActions from '@/components/RowActions';
import { DataTable, Badge, Button, ErrorState } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useSuppression } from '@/hooks/useSuppression';
import { plantationsService } from '@/services';
import { formatDate, formatNumber } from '@/utils/format';
import { ROLE } from '@/constants';

export default function PlantationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isBoss = user?.role === ROLE.BIG_BOSS;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [edition, setEdition] = useState(null); // null : fermé · 'nouveau' · plantation modifiée

  const { demander, dialogue } = useSuppression({
    supprimer: (row) => plantationsService.remove(row.id),
    apres: (row) => setData((d) => d.filter((x) => x.id !== row.id)),
    message: (row) => `Supprimer la plantation « ${row.nom} » (${row.code}) ? Une plantation qui a des campements ne peut pas être supprimée : désactivez-la plutôt.`,
    succes: (row) => `Plantation ${row.code} supprimée`,
  });

  useEffect(() => {
    plantationsService.getAll()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const ouvrir = (plantation = null) => setEdition(plantation || 'nouveau');

  const columns = [
    { key: 'nom', header: 'Plantation', sortable: true, render: (row) => (
      <span>
        <span className="font-medium text-ink-800">{row.nom}</span>
        <span className="block text-2xs font-normal tabular-nums text-forest-700">{row.code}</span>
      </span>
    ) },
    { key: 'superficie', header: 'Superficie', sortable: true, render: (row) => <span className="tabular-nums">{formatNumber(row.superficie)} ha</span> },
    { key: 'nb_campements', header: 'Campements', sortable: true, render: (row) => <span className="tabular-nums">{row.nb_campements}</span> },
    { key: 'localisation', header: 'Localisation', mobile: false, render: (row) => row.localisation || '—' },
    { key: 'actif', header: 'Statut', mobile: false, render: (row) => <Badge status={row.actif ? 'active' : 'inactive'}>{row.actif ? 'Actif' : 'Inactif'}</Badge> },
    { key: 'created_at', header: 'Créée le', sortable: true, mobile: false, render: (row) => <span className="tabular-nums">{formatDate(row.created_at)}</span> },
  ];

  const ActionsCell = ({ row }) => (
    <RowActions onView={() => navigate(`/plantations/${row.id}`)} onEdit={isBoss ? () => ouvrir(row) : undefined}
      onDelete={isBoss ? () => demander(row) : undefined} />
  );

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Plantations"
        subtitle="Plantations de l'exploitation"
        icon={Sprout}
        actions={isBoss ? <Button size="sm" onClick={() => ouvrir()}><Plus size={16} /> Nouvelle plantation</Button> : undefined}
      />
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchPlaceholder="Rechercher une plantation..."
        searchKeys={['code', 'nom', 'localisation']}
        onRowClick={(row) => navigate(`/plantations/${row.id}`)}
        actions={ActionsCell}
        emptyAction={isBoss ? <Button size="sm" onClick={() => ouvrir()}><Plus size={14} /> Nouvelle plantation</Button> : undefined}
      />
      {dialogue}

      <PlantationModal
        open={!!edition}
        onClose={() => setEdition(null)}
        plantation={edition && edition !== 'nouveau' ? edition : null}
        onEnregistre={(item, modification) => setData((d) => (modification ? d.map((x) => (x.id === item.id ? item : x)) : [item, ...d]))}
      />
    </div>
  );
}
