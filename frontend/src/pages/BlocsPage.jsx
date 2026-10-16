import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Leaf, Plus } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import BlocModal from '@/components/exploitation/BlocModal';
import RowActions from '@/components/RowActions';
import { DataTable, Badge, Button, ErrorState, Select } from '@/components/ui';
import { compterFiltres } from '@/components/ui/Filtres';
import { useAuth } from '@/contexts/AuthContext';
import { useSuppression } from '@/hooks/useSuppression';
import { blocsService, campementsService } from '@/services';
import { formatNumber } from '@/utils/format';
import { ROLE } from '@/constants';

export default function BlocsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isBoss = user?.role === ROLE.BIG_BOSS;
  const [data, setData] = useState([]);
  const [campements, setCampements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filterCampement, setFilterCampement] = useState('');
  const [edition, setEdition] = useState(null);

  const { demander, dialogue } = useSuppression({
    supprimer: (row) => blocsService.remove(row.id),
    apres: (row) => setData((d) => d.filter((x) => x.id !== row.id)),
    message: (row) => `Supprimer le bloc ${row.code} — ${row.nom} ? Un bloc qui a des personnes, des travaux ou des dépenses ne peut pas être supprimé : désactivez-le plutôt.`,
    succes: (row) => `Bloc ${row.code} supprimé`,
  });

  useEffect(() => {
    Promise.all([blocsService.getAll(), campementsService.getAll()])
      .then(([blocs, camps]) => {
        setData(blocs);
        setCampements(camps);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const filtered = data.filter((b) => !filterCampement || b.campement_id === filterCampement);

  const ouvrir = (bloc = null) => setEdition(bloc || 'nouveau');

  const columns = [
    { key: 'nom', header: 'Bloc', sortable: true, render: (row) => (
      <span>
        <span className="font-medium text-ink-800">{row.nom}</span>
        <span className="block text-xs font-normal text-ink-500"><span className="tabular-nums text-forest-700">{row.code}</span> · {row.campement_nom}{row.localisation ? ` · ${row.localisation}` : ''}</span>
      </span>
    ) },
    { key: 'nombre_plantes', header: 'Plantes', sortable: true, render: (row) => <span className="tabular-nums">{formatNumber(row.nombre_plantes)}</span> },
    { key: 'superficie', header: 'Superficie', sortable: true, render: (row) => <span className="tabular-nums">{formatNumber(row.superficie)} ha</span> },
    { key: 'nb_personnes', header: 'Personnes', sortable: true, mobile: false, render: (row) => <span className="tabular-nums">{row.nb_personnes}</span> },
    { key: 'actif', header: 'Statut', mobile: false, render: (row) => <Badge status={row.actif ? 'active' : 'inactive'}>{row.actif ? 'Actif' : 'Inactif'}</Badge> },
  ];

  const ActionsCell = ({ row }) => (
    <RowActions onView={() => navigate(`/blocs/${row.id}`)} onEdit={() => ouvrir(row)}
      onDelete={isBoss ? () => demander(row) : undefined} />
  );

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Blocs / Parcelles"
        subtitle="Superficie, plantes et personnes de chaque bloc"
        icon={Leaf}
        actions={<Button size="sm" onClick={() => ouvrir()}><Plus size={16} /> Nouveau bloc</Button>}
      />
      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        searchPlaceholder="Rechercher un bloc..."
        searchKeys={['code', 'nom', 'campement_nom']}
        onRowClick={(row) => navigate(`/blocs/${row.id}`)}
        actions={ActionsCell}
        filters={(
          <Select
            value={filterCampement}
            onChange={(e) => setFilterCampement(e.target.value)}
            options={campements.map((c) => ({ value: c.id, label: c.nom }))}
            placeholder="Campement" emptyLabel="Tous les campements"
            className="w-full sm:w-40"
          />
        )}
        filtersActive={compterFiltres(filterCampement)}
        onResetFilters={() => setFilterCampement('')}
        emptyTitle="Aucun bloc"
        emptyAction={<Button size="sm" onClick={() => ouvrir()}><Plus size={14} /> Nouveau bloc</Button>}
      />
      {dialogue}

      <BlocModal
        open={!!edition}
        onClose={() => setEdition(null)}
        bloc={edition && edition !== 'nouveau' ? edition : null}
        campements={campements}
        onEnregistre={(item, modification) => setData((d) => (modification ? d.map((x) => (x.id === item.id ? item : x)) : [item, ...d]))}
      />
    </div>
  );
}
