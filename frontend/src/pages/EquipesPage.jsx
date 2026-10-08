import { useState, useEffect, useMemo } from 'react';
import { Shield, Plus, Users, Crown } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import AutoCodeInput from '@/components/AutoCodeInput';
import BlocPicker, { matchBlocFilter, buildBlocFilter } from '@/components/BlocPicker';
import { DataTable, Badge, Button, ErrorState, Modal, Input, Select, MultiSelect } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { equipesService, campementsService, personnesService, blocsService } from '@/services';
import { showServerErrors } from '@/utils/errors';

const EMPTY_FORM = { nom: '', campement_id: '', bloc_id: '', membres_ids: [], chef_id: '' };
const nomComplet = (p) => (p ? `${p.prenom} ${p.nom}` : '—');

export default function EquipesPage() {
  const [data, setData] = useState([]);
  const [campements, setCampements] = useState([]);
  const [blocs, setBlocs] = useState([]);
  const [personnes, setPersonnes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filtreBloc, setFiltreBloc] = useState({ campement_id: '', bloc_id: '' });
  const [editing, setEditing] = useState(null); // null = fermé, 'new' = création, sinon l'équipe modifiée
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const load = () => Promise.all([equipesService.getAll(), campementsService.getAll(), personnesService.getAll(), blocsService.getAll()])
    .then(([eqs, camps, pers, bl]) => {
      setData(eqs);
      setCampements(camps);
      setPersonnes(pers);
      setBlocs(bl);
      setLoading(false);
    })
    .catch(() => { setError(true); setLoading(false); });

  useEffect(() => { load(); }, []);

  const getPersonne = (id) => personnes.find((p) => p.id === id);

  const filtered = useMemo(() => {
    const f = buildBlocFilter(filtreBloc, blocs);
    return data.filter((e) => matchBlocFilter(e, f));
  }, [data, filtreBloc, blocs]);

  // Personnes actives, avec leur équipe actuelle en indication
  const personneOptions = personnes
    .filter((p) => p.actif)
    .map((p) => {
      const autreEquipe = p.equipe_id && p.equipe_id !== editing?.id ? p.equipe_nom : null;
      return { value: p.id, label: `${nomComplet(p)} — ${p.matricule}`, hint: autreEquipe ? `actuellement : ${autreEquipe}` : 'sans équipe' };
    });

  const openCreate = () => { setForm(EMPTY_FORM); setFormErrors({}); setEditing('new'); };
  const openEdit = (equipe) => {
    setForm({
      nom: equipe.nom,
      campement_id: equipe.campement_id || '',
      bloc_id: equipe.bloc_id || '',
      membres_ids: equipe.membres_ids,
      chef_id: equipe.chef_id || '',
    });
    setFormErrors({});
    setEditing(equipe);
  };

  // Le chef doit faire partie des membres
  const setMembres = (membres) => setForm((f) => ({ ...f, membres_ids: membres, chef_id: membres.includes(f.chef_id) ? f.chef_id : '' }));

  const validate = () => {
    const errs = {};
    if (!form.nom.trim()) errs.nom = 'Le nom est obligatoire';
    if (!form.bloc_id) errs.bloc_id = 'Le bloc est obligatoire';
    if (form.membres_ids.length === 0) errs.membres_ids = 'Ajoutez au moins un membre';
    if (!form.chef_id) errs.chef_id = "Désignez le chef d'équipe";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = { nom: form.nom.trim(), bloc_id: form.bloc_id, membres_ids: form.membres_ids, chef_id: form.chef_id };
    try {
      const equipe = editing === 'new'
        ? await equipesService.create(payload)
        : await equipesService.update(editing.id, payload);
      await load();
      toast.success(editing === 'new'
        ? `Équipe ${equipe.code} créée avec ${equipe.nb_membres} membre(s)`
        : `Équipe ${equipe.code} mise à jour`);
      setEditing(null);
    } catch (err) {
      showServerErrors(err, { setFormErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'code', header: 'Code', sortable: true, render: (row) => <span className="font-mono text-xs font-medium text-forest-700">{row.code}</span> },
    { key: 'nom', header: 'Nom', sortable: true, render: (row) => (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-sage-50 flex items-center justify-center shrink-0">
          <Users size={14} className="text-sage-700" />
        </div>
        <span className="font-medium text-ink-800">{row.nom}</span>
      </div>
    ) },
    { key: 'campement_nom', header: 'Campement', render: (row) => row.campement_nom || '—' },
    { key: 'bloc_code', header: 'Bloc affecté', render: (row) => <span className="font-mono text-xs">{row.bloc_code || '—'}</span> },
    { key: 'chef_nom', header: "Chef d'équipe", render: (row) => row.chef_nom || '—' },
    { key: 'nb_membres', header: 'Membres', sortable: true, render: (row) => <span className="tabular-nums">{row.nb_membres}</span> },
    { key: 'actif', header: 'Statut', render: (row) => <Badge status={row.actif ? 'active' : 'inactive'}>{row.actif ? 'Actif' : 'Inactif'}</Badge> },
  ];

  const ActionsCell = ({ row }) => (
    <Button variant="outline" size="sm" onClick={() => openEdit(row)} disabled={!row.actif}>Membres</Button>
  );

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Équipes"
        subtitle="Équipes, membres et blocs affectés"
        icon={Shield}
        actions={<Button size="sm" onClick={openCreate}><Plus size={16} /> Nouvelle équipe</Button>}
      />
      <div className="flex flex-wrap gap-3">
        <BlocPicker mode="filter" campements={campements} blocs={blocs} value={filtreBloc} onChange={setFiltreBloc} />
      </div>
      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        searchPlaceholder="Rechercher une équipe..."
        searchKeys={['code', 'nom', 'chef_nom']}
        actions={ActionsCell}
      />

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Nouvelle équipe' : `Équipe ${editing?.code} — ${editing?.nom}`}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Annuler</Button>
            <Button onClick={handleSubmit} loading={saving}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <AutoCodeInput service={equipesService} value={editing === 'new' ? undefined : editing?.code} />
            <Input
              label="Nom"
              required
              placeholder="Ex: Équipe Foxtrot"
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              error={formErrors.nom}
              className="sm:col-span-2"
            />
          </div>

          <BlocPicker
            campements={campements}
            blocs={blocs}
            value={form}
            onChange={(v) => setForm({ ...form, ...v })}
            required
            errors={formErrors}
          />

          <MultiSelect
            label={`Membres (${form.membres_ids.length})`}
            options={personneOptions}
            value={form.membres_ids}
            onChange={setMembres}
            placeholder="Rechercher par nom ou matricule..."
            error={formErrors.membres_ids}
            hint="Une personne déjà dans une autre équipe y sera retirée (l'historique est conservé)."
          />

          <Select
            label="Chef d'équipe"
            required
            options={form.membres_ids.map((id) => ({ value: id, label: nomComplet(getPersonne(id)) }))}
            placeholder={form.membres_ids.length ? 'Choisir parmi les membres' : "Ajoutez d'abord des membres"}
            disabled={form.membres_ids.length === 0}
            value={form.chef_id}
            onChange={(e) => setForm({ ...form, chef_id: e.target.value })}
            error={formErrors.chef_id}
          />
          {form.chef_id && (
            <p className="flex items-center gap-1.5 text-xs text-forest-700">
              <Crown size={12} /> {nomComplet(getPersonne(form.chef_id))} dirigera l'équipe.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
