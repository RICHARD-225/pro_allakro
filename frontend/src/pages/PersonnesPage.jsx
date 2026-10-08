import { useState, useEffect, useMemo } from 'react';
import { Users, Plus, Phone, UserCircle } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import AutoCodeInput from '@/components/AutoCodeInput';
import BlocPicker, { matchBlocFilter, buildBlocFilter } from '@/components/BlocPicker';
import { DataTable, Badge, Button, ErrorState, Select, Modal, Input } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { personnesService, fonctionsService, equipesService, campementsService, blocsService } from '@/services';
import { formatDate } from '@/utils/format';
import { showServerErrors, today } from '@/utils/errors';

// La date d'embauche est pré-remplie avec la date du jour
const emptyForm = () => ({ nom: '', prenom: '', telephone: '', fonction_id: '', equipe_id: '', campement_id: '', date_embauche: today() });

export default function PersonnesPage() {
  const [data, setData] = useState([]);
  const [fonctions, setFonctions] = useState([]);
  const [equipes, setEquipes] = useState([]);
  const [campements, setCampements] = useState([]);
  const [blocs, setBlocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFonction, setFilterFonction] = useState('');
  const [filtreBloc, setFiltreBloc] = useState({ campement_id: '', bloc_id: '' });
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    Promise.all([
      personnesService.getAll(),
      fonctionsService.getAll(),
      equipesService.getAll(),
      campementsService.getAll(),
      blocsService.getAll(),
    ]).then(([pers, fons, eqs, camps, bl]) => {
      setData(pers);
      setFonctions(fons);
      setEquipes(eqs);
      setCampements(camps);
      setBlocs(bl);
      setLoading(false);
    }).catch(() => { setError(true); setLoading(false); });
  }, []);

  const getEquipe = (id) => equipes.find((e) => e.id === id);

  const filtered = useMemo(() => {
    const f = buildBlocFilter(filtreBloc, blocs);
    return data.filter((p) => {
      if (filterStatus && String(p.actif) !== filterStatus) return false;
      if (filterFonction && p.fonction_id !== filterFonction) return false;
      return matchBlocFilter(p, f);
    });
  }, [data, filterStatus, filterFonction, filtreBloc, blocs]);

  // Choisir une équipe impose son campement (celui de son bloc)
  const choisirEquipe = (equipeId) => {
    const equipe = getEquipe(equipeId);
    setForm((f) => ({ ...f, equipe_id: equipeId, campement_id: equipe?.campement_id || f.campement_id }));
  };

  const creerFonction = async (libelle) => {
    try {
      const fonction = await fonctionsService.create({ libelle });
      setFonctions((list) => [...list, fonction].sort((a, b) => a.libelle.localeCompare(b.libelle)));
      setForm((f) => ({ ...f, fonction_id: fonction.id }));
      toast.success(`Fonction « ${fonction.libelle} » ajoutée`);
    } catch (err) {
      setFormErrors((e) => ({ ...e, fonction_id: err.fields?.libelle || err.message }));
    }
  };

  const validate = () => {
    const errs = {};
    if (!form.nom.trim()) errs.nom = 'Le nom est obligatoire';
    if (!form.prenom.trim()) errs.prenom = 'Le prénom est obligatoire';
    if (!form.fonction_id) errs.fonction_id = 'La fonction est obligatoire';
    if (!form.campement_id && !form.equipe_id) errs.campement_id = 'Le campement est obligatoire';
    if (form.telephone && !/^\+?[0-9][0-9\s()-]{7,19}$/.test(form.telephone.trim()))
      errs.telephone = 'Numéro de téléphone invalide';
    if (!form.date_embauche) errs.date_embauche = "La date d'embauche est obligatoire";
    else if (form.date_embauche > today()) errs.date_embauche = 'La date ne peut pas être dans le futur';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const item = await personnesService.create({
        nom: form.nom.trim(),
        prenom: form.prenom.trim(),
        telephone: form.telephone.trim(),
        fonction_id: form.fonction_id,
        equipe_id: form.equipe_id || null,
        campement_id: form.campement_id || null,
        date_embauche: form.date_embauche,
      });
      setData((d) => [item, ...d]);
      setShowAddModal(false);
      setForm(emptyForm());
      setFormErrors({});
      toast.success(`${item.prenom} ${item.nom} enregistré(e) — matricule ${item.matricule}`);
    } catch (err) {
      showServerErrors(err, { setFormErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'matricule', header: 'Matricule', sortable: true, render: (row) => <span className="font-mono text-xs font-medium text-forest-700">{row.matricule}</span> },
    { key: 'nom', header: 'Nom', sortable: true, render: (row) => (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-forest-50 flex items-center justify-center shrink-0">
          <UserCircle size={16} className="text-forest-600" />
        </div>
        <span className="font-medium text-ink-800">{row.prenom} {row.nom}</span>
      </div>
    ) },
    { key: 'telephone', header: 'Téléphone', render: (row) => (row.telephone
      ? <span className="flex items-center gap-1 text-ink-600"><Phone size={12} />{row.telephone}</span>
      : '—') },
    { key: 'fonction_libelle', header: 'Fonction', render: (row) => row.fonction_libelle || '—' },
    { key: 'equipe_nom', header: 'Équipe', render: (row) => row.equipe_nom || <span className="text-ink-400">Sans équipe</span> },
    { key: 'bloc_code', header: 'Bloc', render: (row) => <span className="font-mono text-xs">{row.bloc_code || '—'}</span> },
    { key: 'campement_nom', header: 'Campement', render: (row) => row.campement_nom || '—' },
    { key: 'actif', header: 'Statut', render: (row) => <Badge status={row.actif ? 'active' : 'inactive'}>{row.actif ? 'Actif' : 'Inactif'}</Badge> },
    { key: 'date_embauche', header: 'Embauche', sortable: true, render: (row) => formatDate(row.date_embauche) },
  ];

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  const equipeChoisie = getEquipe(form.equipe_id);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Personnes"
        subtitle="Gestion du personnel"
        icon={Users}
        actions={<Button size="sm" onClick={() => { setForm(emptyForm()); setFormErrors({}); setShowAddModal(true); }}><Plus size={16} /> Nouvelle personne</Button>}
      />
      <div className="flex flex-wrap gap-3">
        <Select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          options={[{ value: 'true', label: 'Actif' }, { value: 'false', label: 'Inactif' }]}
          placeholder="Tous les statuts"
          className="w-full sm:w-40"
        />
        <Select
          value={filterFonction}
          onChange={(e) => setFilterFonction(e.target.value)}
          options={fonctions.map((f) => ({ value: f.id, label: f.libelle }))}
          placeholder="Toutes les fonctions"
          className="w-full sm:w-48"
        />
        <BlocPicker mode="filter" campements={campements} blocs={blocs} value={filtreBloc} onChange={setFiltreBloc} />
      </div>
      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        searchPlaceholder="Rechercher par nom, matricule, téléphone..."
        searchKeys={['matricule', 'nom', 'prenom', 'telephone']}
      />

      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Nouvelle personne"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Annuler</Button>
            <Button onClick={handleSubmit} loading={saving}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-4">
          <AutoCodeInput service={personnesService} label="Matricule" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Prénom"
              required
              placeholder="Ex: Jean"
              value={form.prenom}
              onChange={(e) => setForm({ ...form, prenom: e.target.value })}
              error={formErrors.prenom}
            />
            <Input
              label="Nom"
              required
              placeholder="Ex: Kouassi"
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              error={formErrors.nom}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Téléphone"
              placeholder="Ex: 07 01 23 45 67"
              value={form.telephone}
              onChange={(e) => setForm({ ...form, telephone: e.target.value })}
              error={formErrors.telephone}
            />
            <Select
              label="Fonction"
              required
              creatable
              onCreate={creerFonction}
              options={fonctions.map((f) => ({ value: f.id, label: f.libelle }))}
              placeholder="Choisir ou saisir une fonction"
              value={form.fonction_id}
              onChange={(e) => setForm({ ...form, fonction_id: e.target.value })}
              error={formErrors.fonction_id}
            />
          </div>
          <Select
            label="Affecter à une équipe (facultatif)"
            options={equipes.filter((e) => e.actif).map((e) => ({
              value: e.id,
              label: `${e.nom} — ${e.campement_nom || 'sans bloc'}${e.bloc_code ? ` / ${e.bloc_code}` : ''}`,
            }))}
            placeholder="Aucune équipe"
            value={form.equipe_id}
            onChange={(e) => choisirEquipe(e.target.value)}
            error={formErrors.equipe_id}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Campement"
              required
              options={campements.filter((c) => c.actif).map((c) => ({ value: c.id, label: c.nom }))}
              placeholder="Choisir un campement"
              value={form.campement_id}
              onChange={(e) => setForm({ ...form, campement_id: e.target.value })}
              disabled={!!equipeChoisie?.campement_id}
              error={formErrors.campement_id}
              hint={equipeChoisie?.campement_id ? "Campement de l'équipe choisie" : undefined}
            />
            <Input
              label="Date d'embauche"
              required
              type="date"
              max={today()}
              value={form.date_embauche}
              onChange={(e) => setForm({ ...form, date_embauche: e.target.value })}
              error={formErrors.date_embauche}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
