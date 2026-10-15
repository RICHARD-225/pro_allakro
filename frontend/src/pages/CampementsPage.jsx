import { useState, useEffect } from 'react';
import { TreePine, Plus } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import AutoCodeInput from '@/components/AutoCodeInput';
import RowActions from '@/components/RowActions';
import { DataTable, Badge, Button, ErrorState, Modal, Input, Select } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSuppression } from '@/hooks/useSuppression';
import NouveauResponsableModal from '@/components/NouveauResponsableModal';
import { campementsService, plantationsService } from '@/services';
import { formatNumber } from '@/utils/format';
import { showServerErrors } from '@/utils/errors';
import { ROLE } from '@/constants';

const EMPTY_FORM = { nom: '', plantation_id: '', responsable_id: '', superficie: '', actif: true };

export default function CampementsPage() {
  const { user } = useAuth();
  const isBoss = user?.role === ROLE.BIG_BOSS;
  const [data, setData] = useState([]);
  const [plantations, setPlantations] = useState([]);
  const [responsables, setResponsables] = useState([]);
  const [nouveauResponsable, setNouveauResponsable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [edition, setEdition] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const enModification = edition && edition !== 'nouveau';

  const { demander, dialogue } = useSuppression({
    supprimer: (row) => campementsService.remove(row.id),
    apres: (row) => setData((d) => d.filter((x) => x.id !== row.id)),
    message: (row) => `Supprimer le campement « ${row.nom} » (${row.code}) ? Un campement qui a des blocs ou des opérations ne peut pas être supprimé : désactivez-le plutôt.`,
    succes: (row) => `Campement ${row.code} supprimé`,
  });

  useEffect(() => {
    // La liste des responsables est réservée au Big Boss : un superviseur consulte la page sans l'appeler (sinon 403 et page en erreur)
    Promise.all([campementsService.getAll(), plantationsService.getAll(),
      isBoss ? campementsService.responsables().catch(() => []) : Promise.resolve([])])
      .then(([camps, plants, pers]) => {
        setData(camps);
        setPlantations(plants);
        setResponsables(pers);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [isBoss]);

  const ouvrir = (campement = null) => {
    setForm(campement
      ? {
        nom: campement.nom, plantation_id: campement.plantation_id, responsable_id: campement.responsable_id || '',
        superficie: String(campement.superficie ?? ''), actif: campement.actif,
      }
      : EMPTY_FORM);
    setFormErrors({});
    setEdition(campement || 'nouveau');
  };

  const validate = () => {
    const errs = {};
    if (!form.nom.trim()) errs.nom = 'Le nom est obligatoire';
    if (!form.plantation_id) errs.plantation_id = 'La plantation est obligatoire';
    if (!form.responsable_id) errs.responsable_id = 'Le responsable est obligatoire : un campement a toujours un responsable';
    if (form.superficie && !(Number(form.superficie) >= 0)) errs.superficie = 'La superficie doit être un nombre positif';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      nom: form.nom.trim(),
      plantation_id: form.plantation_id,
      responsable_id: form.responsable_id,
      superficie: Number(form.superficie) || 0,
      actif: form.actif,
    };
    try {
      const item = enModification ? await campementsService.update(edition.id, payload) : await campementsService.create(payload);
      setData((d) => (enModification ? d.map((x) => (x.id === item.id ? item : x)) : [item, ...d]));
      setEdition(null);
      toast.success(enModification ? `Campement ${item.code} modifié` : `Campement ${item.code} ajouté avec succès`);
    } catch (err) {
      showServerErrors(err, { setFormErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'nom', header: 'Campement', sortable: true, render: (row) => (
      <span>
        <span className="font-medium text-ink-800">{row.nom}</span>
        <span className="block text-xs font-normal text-ink-500"><span className="tabular-nums text-forest-700">{row.code}</span> · {row.plantation_nom}</span>
      </span>
    ) },
    { key: 'superficie', header: 'Superficie', sortable: true, render: (row) => <span className="tabular-nums">{formatNumber(row.superficie)} ha</span> },
    { key: 'nb_blocs', header: 'Blocs', sortable: true, render: (row) => <span className="tabular-nums">{row.nb_blocs}</span> },
    { key: 'responsable_nom', header: 'Responsable', mobile: false, render: (row) => row.responsable_nom || '—' },
    { key: 'actif', header: 'Statut', mobile: false, render: (row) => <Badge status={row.actif ? 'active' : 'inactive'}>{row.actif ? 'Actif' : 'Inactif'}</Badge> },
  ];

  const ActionsCell = ({ row }) => (isBoss ? <RowActions onEdit={() => ouvrir(row)} onDelete={() => demander(row)} /> : null);

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
        onRowClick={isBoss ? (row) => ouvrir(row) : undefined}
        actions={ActionsCell}
        emptyAction={isBoss ? <Button size="sm" onClick={() => ouvrir()}><Plus size={14} /> Nouveau campement</Button> : undefined}
      />
      {dialogue}

      <Modal
        open={!!edition}
        onClose={() => setEdition(null)}
        title={enModification ? `Modifier ${edition.code}` : 'Nouveau campement'}
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
              : <AutoCodeInput service={campementsService} />}
            <Input
              label="Nom"
              required
              placeholder="Ex: Campement Est"
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              error={formErrors.nom}
            />
          </div>
          <Select
            label="Plantation"
            required
            options={plantations.filter((p) => p.actif || p.id === form.plantation_id)
              .map((p) => ({ value: p.id, label: `${p.nom} (${formatNumber(p.superficie)} ha)` }))}
            placeholder="Choisir une plantation"
            value={form.plantation_id}
            onChange={(e) => setForm({ ...form, plantation_id: e.target.value })}
            error={formErrors.plantation_id}
          />
          <Select
            label="Responsable"
            required
            options={[...(form.responsable_id && !responsables.some((p) => p.id === form.responsable_id)
              ? [{ value: form.responsable_id, label: `${data.find((c) => c.responsable_id === form.responsable_id)?.responsable_nom || 'Responsable actuel'} (sans compte utilisateur)` }] : []),
            ...responsables.map((p) => ({
              value: p.id,
              label: `${p.prenom} ${p.nom} — ${p.role_libelle}${p.campements.length ? ` (gère : ${p.campements.join(', ')})` : ''}`,
            }))]}
            placeholder="Choisir un responsable"
            hint="Superviseur ou Big Boss. Un responsable peut gérer plusieurs campements et tous leurs blocs."
            value={form.responsable_id}
            onChange={(e) => setForm({ ...form, responsable_id: e.target.value })}
            error={formErrors.responsable_id}
          />
          <button type="button" onClick={() => setNouveauResponsable(true)} className="-mt-2 text-xs font-medium text-forest-700 hover:underline">
            + Nouveau responsable (créer un compte superviseur)
          </button>
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
          {enModification && (
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={form.actif} onChange={(e) => setForm({ ...form, actif: e.target.checked })}
                className="h-4 w-4 rounded-sm border-ink-300 text-forest-600" />
              Campement actif
            </label>
          )}
        </div>
      </Modal>
      <NouveauResponsableModal
        open={nouveauResponsable}
        onClose={() => setNouveauResponsable(false)}
        onCree={async ({ id }) => {
          const liste = await campementsService.responsables().catch(() => responsables);
          setResponsables(liste);
          setForm((f) => ({ ...f, responsable_id: id }));
        }}
      />
    </div>
  );
}
