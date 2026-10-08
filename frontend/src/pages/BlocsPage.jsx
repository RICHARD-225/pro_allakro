import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Leaf, Plus } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import AutoCodeInput from '@/components/AutoCodeInput';
import { DataTable, Badge, Button, ErrorState, Modal, Input, Select } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { blocsService, campementsService } from '@/services';
import { formatNumber } from '@/utils/format';
import { showServerErrors } from '@/utils/errors';

const EMPTY_FORM = { nom: '', campement_id: '', superficie: '' };

export default function BlocsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [campements, setCampements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filterCampement, setFilterCampement] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

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

  const validate = () => {
    const errs = {};
    if (!form.nom.trim()) errs.nom = 'Le nom est obligatoire';
    if (!form.campement_id) errs.campement_id = 'Le campement est obligatoire';
    if (form.superficie && !(Number(form.superficie) >= 0)) errs.superficie = 'La superficie doit être un nombre positif';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const item = await blocsService.create({
        nom: form.nom.trim(),
        campement_id: form.campement_id,
        superficie: Number(form.superficie) || 0,
      });
      setData((d) => [item, ...d]);
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      setFormErrors({});
      toast.success(`Bloc ${item.code} ajouté avec succès`);
    } catch (err) {
      showServerErrors(err, { setFormErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'code', header: 'Code', sortable: true, render: (row) => <span className="font-mono text-xs font-medium text-forest-700">{row.code}</span> },
    { key: 'nom', header: 'Nom', sortable: true, render: (row) => <span className="font-medium text-ink-800">{row.nom}</span> },
    { key: 'campement_nom', header: 'Campement' },
    { key: 'superficie', header: 'Superficie', sortable: true, render: (row) => <span className="tabular-nums">{formatNumber(row.superficie)} ha</span> },
    { key: 'actif', header: 'Statut', render: (row) => <Badge status={row.actif ? 'active' : 'inactive'}>{row.actif ? 'Actif' : 'Inactif'}</Badge> },
  ];

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Blocs / Parcelles"
        subtitle="Gestion des blocs et parcelles"
        icon={Leaf}
        actions={<Button size="sm" onClick={() => setShowAddModal(true)}><Plus size={16} /> Nouveau bloc</Button>}
      />
      <Select
        value={filterCampement}
        onChange={(e) => setFilterCampement(e.target.value)}
        options={campements.map((c) => ({ value: c.id, label: c.nom }))}
        placeholder="Tous les campements"
        className="w-full sm:w-56"
      />
      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        searchPlaceholder="Rechercher un bloc..."
        searchKeys={['code', 'nom', 'campement_nom']}
        onRowClick={(row) => navigate(`/blocs/${row.id}`)}
      />

      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Nouveau bloc"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Annuler</Button>
            <Button onClick={handleSubmit} loading={saving}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AutoCodeInput service={blocsService} />
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
            options={campements.filter((c) => c.actif).map((c) => ({ value: c.id, label: `${c.nom} (${formatNumber(c.superficie)} ha)` }))}
            placeholder="Choisir un campement"
            value={form.campement_id}
            onChange={(e) => setForm({ ...form, campement_id: e.target.value })}
            error={formErrors.campement_id}
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
