import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TreePine, Plus } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import CampementModal from '@/components/exploitation/CampementModal';
import RowActions from '@/components/RowActions';
import { DataTable, Badge, Button, ErrorState } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useSuppression } from '@/hooks/useSuppression';
import { campementsService, plantationsService } from '@/services';
import { formatNumber } from '@/utils/format';
import { ROLE } from '@/constants';

export default function CampementsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isBoss = user?.role === ROLE.BIG_BOSS;
  const [data, setData] = useState([]);
  const [plantations, setPlantations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [edition, setEdition] = useState(null);

  const { demander, dialogue } = useSuppression({
    supprimer: (row) => campementsService.remove(row.id),
    apres: (row) => setData((d) => d.filter((x) => x.id !== row.id)),
    message: (row) => `Supprimer le campement « ${row.nom} » (${row.code}) ? Un campement qui a des blocs ou des opérations ne peut pas être supprimé : désactivez-le plutôt.`,
    succes: (row) => `Campement ${row.code} supprimé`,
  });

  useEffect(() => {
    Promise.all([campementsService.getAll(), plantationsService.getAll()])
      .then(([camps, plants]) => { setData(camps); setPlantations(plants); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const ouvrir = (campement = null) => setEdition(campement || 'nouveau');

  const columns = [
    { key: 'nom', header: 'Campement', sortable: true, render: (row) => (
      <span>
        <span className="font-medium text-ink-800">{row.nom}</span>
        <span className="block text-xs font-normal text-ink-500"><span className="tabular-nums text-forest-700">{row.code}</span> · {row.plantation_nom}{row.localisation ? ` · ${row.localisation}` : ''}</span>
      </span>
    ) },
    { key: 'superficie', header: 'Superficie', sortable: true, render: (row) => <span className="tabular-nums">{formatNumber(row.superficie)} ha</span> },
    { key: 'nb_blocs', header: 'Blocs', sortable: true, render: (row) => <span className="tabular-nums">{row.nb_blocs}</span> },
    { key: 'responsable_nom', header: 'Responsable', mobile: false, render: (row) => row.responsable_nom || '—' },
    { key: 'actif', header: 'Statut', mobile: false, render: (row) => <Badge status={row.actif ? 'active' : 'inactive'}>{row.actif ? 'Actif' : 'Inactif'}</Badge> },
  ];

  const ActionsCell = ({ row }) => (
    <RowActions onView={() => navigate(`/campements/${row.id}`)} onEdit={isBoss ? () => ouvrir(row) : undefined}
      onDelete={isBoss ? () => demander(row) : undefined} />
  );

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Campements"
        subtitle="Campements de chaque plantation"
        icon={TreePine}
        actions={isBoss ? <Button size="sm" onClick={() => ouvrir()}><Plus size={16} /> Nouveau campement</Button> : undefined}
      />
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchPlaceholder="Rechercher un campement..."
        searchKeys={['code', 'nom', 'plantation_nom', 'responsable_nom']}
        onRowClick={(row) => navigate(`/campements/${row.id}`)}
        actions={ActionsCell}
        emptyAction={isBoss ? <Button size="sm" onClick={() => ouvrir()}><Plus size={14} /> Nouveau campement</Button> : undefined}
      />
      {dialogue}

      <CampementModal
        open={!!edition}
        onClose={() => setEdition(null)}
        campement={edition && edition !== 'nouveau' ? edition : null}
        plantations={plantations}
        onEnregistre={(item, modification) => setData((d) => (modification ? d.map((x) => (x.id === item.id ? item : x)) : [item, ...d]))}
      />
    </div>
  );
}
