import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Leaf, Plus } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import AutoCodeInput from '@/components/AutoCodeInput';
import RowActions from '@/components/RowActions';
import { DataTable, Badge, Button, ErrorState, Modal, Input, Select } from '@/components/ui';
import { compterFiltres } from '@/components/ui/Filtres';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSuppression } from '@/hooks/useSuppression';
import { blocsService, campementsService } from '@/services';
import { formatNumber } from '@/utils/format';
import { showServerErrors } from '@/utils/errors';
import { ROLE } from '@/constants';

const EMPTY_FORM = { nom: '', campement_id: '', superficie: '', nombre_plantes: '', actif: true };
const ENTIER_POSITIF = /^\d+$/;

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
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const enModification = edition && edition !== 'nouveau';

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

  const ouvrir = (bloc = null) => {
    setForm(bloc
      ? { nom: bloc.nom, campement_id: bloc.campement_id, superficie: String(bloc.superficie ?? ''),
        nombre_plantes: String(bloc.nombre_plantes ?? ''), actif: bloc.actif }
      : EMPTY_FORM);
    setFormErrors({});
    setEdition(bloc || 'nouveau');
  };

  const validate = () => {
    const errs = {};
    if (!form.nom.trim()) errs.nom = 'Le nom est obligatoire';
    if (!form.campement_id) errs.campement_id = 'Le campement est obligatoire';
    if (form.superficie && !(Number(form.superficie) >= 0)) errs.superficie = 'La superficie doit être un nombre positif';
    if (form.nombre_plantes === '') errs.nombre_plantes = 'Le nombre de plantes est obligatoire';
    else if (!ENTIER_POSITIF.test(String(form.nombre_plantes).trim())) errs.nombre_plantes = 'Saisissez un nombre entier positif';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      nom: form.nom.trim(),
      campement_id: form.campement_id,
      superficie: Number(form.superficie) || 0,
      nombre_plantes: Number(form.nombre_plantes),
      actif: form.actif,
    };
    try {
      const item = enModification ? await blocsService.update(edition.id, payload) : await blocsService.create(payload);
      setData((d) => (enModification ? d.map((x) => (x.id === item.id ? item : x)) : [item, ...d]));
      setEdition(null);
      toast.success(enModification ? `Bloc ${item.code} modifié` : `Bloc ${item.code} ajouté avec succès`);
    } catch (err) {
      showServerErrors(err, { setFormErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  // Densité indicative (plantes par hectare) pour repérer une erreur de saisie
  const densite = Number(form.superficie) > 0 && ENTIER_POSITIF.test(String(form.nombre_plantes).trim())
    ? Math.round(Number(form.nombre_plantes) / Number(form.superficie)) : null;

  const columns = [
    { key: 'nom', header: 'Bloc', sortable: true, render: (row) => (
      <span>
        <span className="font-medium text-ink-800">{row.nom}</span>
        <span className="block text-xs font-normal text-ink-500"><span className="tabular-nums text-forest-700">{row.code}</span> · {row.campement_nom}</span>
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

      <Modal
        open={!!edition}
        onClose={() => setEdition(null)}
        title={enModification ? `Modifier ${edition.code}` : 'Nouveau bloc'}
        footer={
          <>
            <Button variant="outline" onClick={() => setEdition(null)}>Annuler</Button>
            <Button onClick={handleSubmit} loading={saving}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {enModification
              ? <Input label="Code" value={edition.code} disabled readOnly />
              : <AutoCodeInput service={blocsService} />}
            <Input
              label="Nom"
              required
              placeholder="Ex: Bloc F1"
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              error={formErrors.nom}
            />
          </div>
          <Select
            label="Campement"
            required
            options={campements.filter((c) => c.actif || c.id === form.campement_id)
              .map((c) => ({ value: c.id, label: `${c.nom} (${formatNumber(c.superficie)} ha)` }))}
            placeholder="Choisir un campement"
            value={form.campement_id}
            onChange={(e) => setForm({ ...form, campement_id: e.target.value })}
            error={formErrors.campement_id}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Superficie (ha)"
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={form.superficie}
              onChange={(e) => setForm({ ...form, superficie: e.target.value })}
              error={formErrors.superficie}
            />
            <Input
              label="Nombre de plantes"
              required
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="Ex: 6435"
              value={form.nombre_plantes}
              onChange={(e) => setForm({ ...form, nombre_plantes: e.target.value })}
              error={formErrors.nombre_plantes}
              hint={densite !== null ? `Soit environ ${formatNumber(densite)} plantes par hectare` : 'Plantes présentes sur la superficie du bloc'}
            />
          </div>
          {enModification && (
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={form.actif} onChange={(e) => setForm({ ...form, actif: e.target.checked })}
                className="h-4 w-4 rounded-sm border-ink-300 text-forest-600" />
              Bloc actif
            </label>
          )}
        </div>
      </Modal>
    </div>
  );
}
