import { useState, useEffect } from 'react';
import { Plus, Lock, Power, PowerOff } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import AutoCodeInput from '@/components/AutoCodeInput';
import RowActions from '@/components/RowActions';
import { DataTable, Badge, Button, ErrorState, Modal, Input, Select } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSuppression } from '@/hooks/useSuppression';
import { showServerErrors } from '@/utils/errors';
import { ROLE } from '@/constants';

const valeurAffichee = (f, row) => {
  if (f.type === 'boolean') return row[f.key] ? 'Oui' : 'Non';
  if (f.options) return f.options.find((o) => o.value === row[f.key])?.label || row[f.key] || '—';
  return row[f.key] ?? '—';
};

/**
 * Page de gestion d'une liste de référence (catégories, activités...) : ajout, modification, activation et suppression.
 * Le code est attribué automatiquement par le serveur ; un élément « système » (alimenté automatiquement) est verrouillé.
 * - fields : champs supplémentaires [{ key, label, options?, type?: 'boolean' | 'number', default?, hint? }]
 */
export default function ReferentielPage({ title, subtitle, icon, service, itemLabel, placeholder, fields = [], libelleHint }) {
  const { user } = useAuth();
  const isBoss = user?.role === ROLE.BIG_BOSS;
  const emptyForm = () => ({ libelle: '', ...Object.fromEntries(fields.map((f) => [f.key, f.default ?? ''])) });
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [edition, setEdition] = useState(null); // null fermé · 'nouveau' · élément modifié
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const enModification = edition && edition !== 'nouveau';

  useEffect(() => {
    service.getAll()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [service]);

  const { demander, dialogue } = useSuppression({
    supprimer: (row) => service.remove(row.id),
    apres: (row) => setData((d) => d.filter((x) => x.id !== row.id)),
    message: (row) => `Supprimer « ${row.libelle} » (${row.code}) ? Un élément déjà utilisé ne peut pas être supprimé : désactivez-le plutôt.`,
    succes: (row) => `« ${row.libelle} » supprimé(e)`,
  });

  const ouvrir = (row = null) => {
    setForm(row
      ? { libelle: row.libelle, ...Object.fromEntries(fields.map((f) => [f.key, row[f.key] ?? f.default ?? ''])) }
      : emptyForm());
    setFormErrors({});
    setEdition(row || 'nouveau');
  };

  const handleSubmit = async () => {
    const libelle = form.libelle.trim();
    if (!libelle) { setFormErrors({ libelle: 'Le libellé est obligatoire' }); return; }
    const payload = { ...form, libelle };
    fields.filter((f) => f.type === 'number').forEach((f) => { payload[f.key] = Number(form[f.key]) || 0; });
    setSaving(true);
    try {
      const item = enModification ? await service.update(edition.id, payload) : await service.create(payload);
      setData((d) => (enModification ? d.map((x) => (x.id === item.id ? item : x)) : [item, ...d]));
      setEdition(null);
      toast.success(enModification ? `« ${item.libelle} » modifié(e)` : `${itemLabel} « ${item.libelle} » ajouté(e) — code ${item.code}`);
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

  // Le libellé vient en premier : il sert de titre à chaque carte sur téléphone, le code suit
  const columns = [
    { key: 'libelle', header: 'Libellé', sortable: true, render: (row) => (
      <span className="flex items-center gap-1.5 font-medium text-ink-800">
        {row.libelle}
        {row.systeme && <Lock size={12} className="text-ink-400" aria-label="Élément système" />}
      </span>
    ) },
    { key: 'code', header: 'Code', sortable: true, render: (row) => <span className="text-xs font-medium tabular-nums text-forest-700">{row.code}</span> },
    ...fields.map((f) => ({
      key: f.key, header: f.label, sortable: f.type === 'number', mobile: false,
      render: (row) => (f.type === 'number' ? <span className="tabular-nums">{valeurAffichee(f, row)}</span> : valeurAffichee(f, row)),
    })),
    { key: 'actif', header: 'Statut', render: (row) => <Badge status={row.actif ? 'active' : 'inactive'}>{row.actif ? 'Actif' : 'Inactif'}</Badge> },
  ];

  const ActionsCell = ({ row }) => (row.systeme
    ? <span className="text-xs text-ink-500">Automatique</span>
    : !isBoss ? null : (
      <RowActions
        onEdit={() => ouvrir(row)}
        menu={[{ label: row.actif ? 'Désactiver' : 'Activer', icon: row.actif ? PowerOff : Power, onClick: () => toggleActif(row) }]}
        onDelete={isBoss ? () => demander(row) : undefined}
      />
    ));

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        actions={isBoss ? <Button size="sm" onClick={() => ouvrir()}><Plus size={16} /> Ajouter</Button> : undefined}
      />
      {/* Clic sur une ligne : ouvre la modification (sauf élément système, verrouillé) */}
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchKeys={['code', 'libelle']}
        actions={ActionsCell}
        onRowClick={(row) => { if (isBoss && !row.systeme) ouvrir(row); }}
        emptyAction={isBoss ? <Button size="sm" onClick={() => ouvrir()}><Plus size={14} /> Ajouter</Button> : undefined}
      />
      {dialogue}

      <Modal
        open={!!edition}
        onClose={() => setEdition(null)}
        title={enModification ? `Modifier « ${edition.libelle} »` : `Nouveau : ${itemLabel.toLowerCase()}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEdition(null)}>Annuler</Button>
            <Button onClick={handleSubmit} loading={saving}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-4">
          {enModification ? <Input label="Code" value={edition.code} disabled readOnly /> : <AutoCodeInput service={service} />}
          <Input
            label="Libellé"
            required
            placeholder={placeholder}
            value={form.libelle}
            onChange={(e) => { setForm({ ...form, libelle: e.target.value }); setFormErrors({}); }}
            error={formErrors.libelle}
            hint={libelleHint}
            autoFocus
          />
          {fields.map((f) => {
            if (f.type === 'boolean') {
              return (
                <label key={f.key} className="flex items-start gap-2 text-sm text-ink-700">
                  <input type="checkbox" checked={!!form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-ink-300 text-forest-600" />
                  <span>{f.label}{f.hint && <span className="block text-xs text-ink-500">{f.hint}</span>}</span>
                </label>
              );
            }
            if (f.options) {
              return (
                <Select
                  key={f.key}
                  label={f.label}
                  options={f.options}
                  placeholder=""
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value || f.default })}
                  error={formErrors[f.key]}
                  hint={f.hint}
                />
              );
            }
            return (
              <Input key={f.key} label={f.label} type={f.type === 'number' ? 'number' : 'text'} value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} error={formErrors[f.key]} hint={f.hint} />
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
