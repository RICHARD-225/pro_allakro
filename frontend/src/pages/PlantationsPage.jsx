import { useState, useEffect } from 'react';
import { Sprout, Plus } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import AutoCodeInput from '@/components/AutoCodeInput';
import { DataTable, Badge, Button, ErrorState, Modal, Input } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { plantationsService } from '@/services';
import { formatDate, formatNumber } from '@/utils/format';
import { showServerErrors } from '@/utils/errors';

const EMPTY_FORM = { nom: '', localisation: '', superficie: '' };

export default function PlantationsPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    plantationsService.getAll()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

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
    try {
      const item = await plantationsService.create({
        nom: form.nom.trim(),
        localisation: form.localisation.trim() || 'Côte d\'Ivoire',
        superficie: Number(form.superficie) || 0,
      });
      setData((d) => [item, ...d]);
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      setFormErrors({});
      toast.success(`Plantation ${item.code} ajoutée avec succès`);
    } catch (err) {
      showServerErrors(err, { setFormErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'code', header: 'Code', sortable: true, render: (row) => <span className="font-mono text-xs font-medium text-forest-700">{row.code}</span> },
    { key: 'nom', header: 'Nom', sortable: true, render: (row) => <span className="font-medium text-ink-800">{row.nom}</span> },
    { key: 'localisation', header: 'Localisation' },
    { key: 'superficie', header: 'Superficie', sortable: true, render: (row) => <span className="tabular-nums">{formatNumber(row.superficie)} ha</span> },
    { key: 'nb_campements', header: 'Campements', sortable: true, render: (row) => <span className="tabular-nums">{row.nb_campements}</span> },
    { key: 'actif', header: 'Statut', render: (row) => <Badge status={row.actif ? 'active' : 'inactive'}>{row.actif ? 'Actif' : 'Inactif'}</Badge> },
    { key: 'created_at', header: 'Créée le', sortable: true, render: (row) => formatDate(row.created_at) },
  ];

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Plantations"
        subtitle="Gestion des plantations"
        icon={Sprout}
        actions={<Button size="sm" onClick={() => setShowAddModal(true)}><Plus size={16} /> Nouvelle plantation</Button>}
      />
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchPlaceholder="Rechercher une plantation..."
        searchKeys={['code', 'nom', 'localisation']}
      />

      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Nouvelle plantation"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Annuler</Button>
            <Button onClick={handleSubmit} loading={saving}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AutoCodeInput service={plantationsService} />
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
        </div>
      </Modal>
    </div>
  );
}
