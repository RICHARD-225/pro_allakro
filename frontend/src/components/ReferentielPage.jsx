import { useState, useEffect } from 'react';
import { Plus, Lock } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import AutoCodeInput from '@/components/AutoCodeInput';
import { DataTable, Badge, Button, ErrorState, Modal, Input, Select } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { showServerErrors } from '@/utils/errors';

/**
 * Page de gestion d'une liste de référence (catégories, types de travaux...).
 * Le code est attribué automatiquement par le serveur.
 * - fields : champs supplémentaires du formulaire [{ key, label, options?, default? }]
 */
export default function ReferentielPage({ title, subtitle, icon, service, itemLabel, placeholder, fields = [] }) {
  const emptyForm = () => ({ libelle: '', ...Object.fromEntries(fields.map((f) => [f.key, f.default ?? ''])) });
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    service.getAll()
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [service]);

  const handleSubmit = async () => {
    const libelle = form.libelle.trim();
    if (!libelle) { setFormErrors({ libelle: 'Le libellé est obligatoire' }); return; }
    setSaving(true);
    try {
      const item = await service.create({ ...form, libelle });
      setData((d) => [item, ...d]);
      setShowAddModal(false);
      setForm(emptyForm());
      setFormErrors({});
      toast.success(`${itemLabel} « ${item.libelle} » ajouté(e) — code ${item.code}`);
    } catch (err) {
      showServerErrors(err, { setFormErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  const toggleActif = async (row) => {
    try {
      const updated = await service.update(row.id, { actif: !row.actif });
      setData((d) => d.map((x) => (x.id === row.id ? updated : x)));
    } catch (err) {
      showServerErrors(err, { toast });
    }
  };

  const columns = [
    { key: 'code', header: 'Code', sortable: true, render: (row) => <span className="font-mono text-xs font-medium text-forest-700">{row.code}</span> },
    { key: 'libelle', header: 'Libellé', sortable: true, render: (row) => (
      <span className="flex items-center gap-1.5 font-medium text-ink-800">
        {row.libelle}
        {row.systeme && <Lock size={12} className="text-ink-400" aria-label="Catégorie système" />}
      </span>
    ) },
    ...fields.map((f) => ({ key: f.key, header: f.label })),
    { key: 'actif', header: 'Statut', render: (row) => <Badge status={row.actif ? 'active' : 'inactive'}>{row.actif ? 'Actif' : 'Inactif'}</Badge> },
  ];

  const ActionsCell = ({ row }) => (row.systeme
    ? <span className="text-xs text-ink-400">Automatique</span>
    : (
      <Button variant="outline" size="sm" onClick={() => toggleActif(row)}>
        {row.actif ? 'Désactiver' : 'Activer'}
      </Button>
    ));

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        actions={<Button size="sm" onClick={() => { setForm(emptyForm()); setFormErrors({}); setShowAddModal(true); }}><Plus size={16} /> Ajouter</Button>}
      />
      <DataTable columns={columns} data={data} loading={loading} searchKeys={['code', 'libelle']} actions={ActionsCell} />

      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={`Nouveau : ${itemLabel.toLowerCase()}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Annuler</Button>
            <Button onClick={handleSubmit} loading={saving}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-4">
          <AutoCodeInput service={service} />
          <Input
            label="Libellé"
            required
            placeholder={placeholder}
            value={form.libelle}
            onChange={(e) => { setForm({ ...form, libelle: e.target.value }); setFormErrors({}); }}
            error={formErrors.libelle}
            autoFocus
          />
          {fields.map((f) => (f.options ? (
            <Select
              key={f.key}
              label={f.label}
              options={f.options}
              placeholder=""
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value || f.default })}
              error={formErrors[f.key]}
            />
          ) : (
            <Input key={f.key} label={f.label} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} error={formErrors[f.key]} />
          )))}
        </div>
      </Modal>
    </div>
  );
}
