import { useState, useEffect } from 'react';
import { Sprout, Plus } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import AutoCodeInput from '@/components/AutoCodeInput';
import RowActions from '@/components/RowActions';
import { DataTable, Badge, Button, ErrorState, Modal, Input } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSuppression } from '@/hooks/useSuppression';
import { plantationsService } from '@/services';
import { formatDate, formatNumber } from '@/utils/format';
import { showServerErrors } from '@/utils/errors';
import { ROLE } from '@/constants';

const EMPTY_FORM = { nom: '', localisation: '', superficie: '', actif: true };

export default function PlantationsPage() {
  const { user } = useAuth();
  const isBoss = user?.role === ROLE.BIG_BOSS;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [edition, setEdition] = useState(null); // null : fermé · 'nouveau' · plantation modifiée
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const enModification = edition && edition !== 'nouveau';

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

  const ouvrir = (plantation = null) => {
    setForm(plantation
      ? { nom: plantation.nom, localisation: plantation.localisation || '', superficie: String(plantation.superficie ?? ''), actif: plantation.actif }
      : EMPTY_FORM);
    setFormErrors({});
    setEdition(plantation || 'nouveau');
  };

  const validate = () => {
    const errs = {};
    if (!form.nom.trim()) errs.nom = 'Le nom est obligatoire';
    if (form.superficie && !(Number(form.superficie) >= 0)) errs.superficie = 'La superficie doit être un nombre positif';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      nom: form.nom.trim(),
      localisation: form.localisation.trim() || 'Côte d\'Ivoire',
      superficie: Number(form.superficie) || 0,
      actif: form.actif,
    };
    try {
      const item = enModification
        ? await plantationsService.update(edition.id, payload)
        : await plantationsService.create(payload);
      setData((d) => (enModification ? d.map((x) => (x.id === item.id ? item : x)) : [item, ...d]));
      setEdition(null);
      toast.success(enModification ? `Plantation ${item.code} modifiée` : `Plantation ${item.code} ajoutée avec succès`);
    } catch (err) {
      showServerErrors(err, { setFormErrors, toast });
    } finally {
      setSaving(false);
    }
  };

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

  const ActionsCell = ({ row }) => (isBoss ? <RowActions onEdit={() => ouvrir(row)} onDelete={() => demander(row)} /> : null);

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
        onRowClick={isBoss ? (row) => ouvrir(row) : undefined}
        actions={ActionsCell}
        emptyAction={isBoss ? <Button size="sm" onClick={() => ouvrir()}><Plus size={14} /> Nouvelle plantation</Button> : undefined}
      />
      {dialogue}

      <Modal
        open={!!edition}
        onClose={() => setEdition(null)}
        title={enModification ? `Modifier ${edition.code}` : 'Nouvelle plantation'}
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
              : <AutoCodeInput service={plantationsService} />}
            <Input
              label="Nom"
              required
              placeholder="Ex: ALLAKRO Est"
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              error={formErrors.nom}
            />
          </div>
          <Input
            label="Localisation"
            placeholder="Ex: Côte d'Ivoire"
            value={form.localisation}
            onChange={(e) => setForm({ ...form, localisation: e.target.value })}
            error={formErrors.localisation}
          />
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
                className="h-4 w-4 rounded border-ink-300 text-forest-600" />
              Plantation active
            </label>
          )}
        </div>
      </Modal>
    </div>
  );
}
