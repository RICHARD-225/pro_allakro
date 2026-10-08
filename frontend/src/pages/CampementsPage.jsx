import { useState, useEffect } from 'react';
import { TreePine, Plus } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import AutoCodeInput from '@/components/AutoCodeInput';
import { DataTable, Badge, Button, ErrorState, Modal, Input, Select } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { campementsService, plantationsService, personnesService } from '@/services';
import { formatNumber } from '@/utils/format';
import { showServerErrors } from '@/utils/errors';

const EMPTY_FORM = { nom: '', plantation_id: '', responsable_id: '', superficie: '' };

export default function CampementsPage() {
  const [data, setData] = useState([]);
  const [plantations, setPlantations] = useState([]);
  const [personnes, setPersonnes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    Promise.all([campementsService.getAll(), plantationsService.getAll(), personnesService.getAll()])
      .then(([camps, plants, pers]) => {
        setData(camps);
        setPlantations(plants);
        setPersonnes(pers);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const validate = () => {
    const errs = {};
    if (!form.nom.trim()) errs.nom = 'Le nom est obligatoire';
    if (!form.plantation_id) errs.plantation_id = 'La plantation est obligatoire';
    if (form.superficie && !(Number(form.superficie) >= 0)) errs.superficie = 'La superficie doit être un nombre positif';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const item = await campementsService.create({
        nom: form.nom.trim(),
        plantation_id: form.plantation_id,
        responsable_id: form.responsable_id || null,
        superficie: Number(form.superficie) || 0,
      });
      setData((d) => [item, ...d]);
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      setFormErrors({});
      toast.success(`Campement ${item.code} ajouté avec succès`);
    } catch (err) {
      showServerErrors(err, { setFormErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'code', header: 'Code', sortable: true, render: (row) => <span className="font-mono text-xs font-medium text-forest-700">{row.code}</span> },
    { key: 'nom', header: 'Nom', sortable: true, render: (row) => <span className="font-medium text-ink-800">{row.nom}</span> },
    { key: 'plantation_nom', header: 'Plantation' },
    { key: 'responsable_nom', header: 'Responsable', render: (row) => row.responsable_nom || '—' },
    { key: 'superficie', header: 'Superficie', sortable: true, render: (row) => <span className="tabular-nums">{formatNumber(row.superficie)} ha</span> },
    { key: 'nb_blocs', header: 'Blocs', sortable: true, render: (row) => <span className="tabular-nums">{row.nb_blocs}</span> },
    { key: 'actif', header: 'Statut', render: (row) => <Badge status={row.actif ? 'active' : 'inactive'}>{row.actif ? 'Actif' : 'Inactif'}</Badge> },
  ];

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Campements"
        subtitle="Gestion des campements"
        icon={TreePine}
        actions={<Button size="sm" onClick={() => setShowAddModal(true)}><Plus size={16} /> Nouveau campement</Button>}
      />
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchPlaceholder="Rechercher un campement..."
        searchKeys={['code', 'nom', 'plantation_nom', 'responsable_nom']}
      />

      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Nouveau campement"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Annuler</Button>
            <Button onClick={handleSubmit} loading={saving}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AutoCodeInput service={campementsService} />
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
            options={plantations.filter((p) => p.actif).map((p) => ({ value: p.id, label: `${p.nom} (${formatNumber(p.superficie)} ha)` }))}
            placeholder="Choisir une plantation"
            value={form.plantation_id}
            onChange={(e) => setForm({ ...form, plantation_id: e.target.value })}
            error={formErrors.plantation_id}
          />
          <Select
            label="Responsable"
            options={personnes.filter((p) => p.actif).map((p) => ({ value: p.id, label: `${p.prenom} ${p.nom} — ${p.matricule}` }))}
            placeholder="Rechercher une personne"
            value={form.responsable_id}
            onChange={(e) => setForm({ ...form, responsable_id: e.target.value })}
            error={formErrors.responsable_id}
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
        </div>
      </Modal>
    </div>
  );
}
