import { useState, useEffect, useMemo } from 'react';
import { Wallet, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';
import BlocPicker, { matchBlocFilter, buildBlocFilter } from '@/components/BlocPicker';
import { DataTable, Badge, Button, ErrorState, Select, StatCard, ConfirmDialog, Modal, Input } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { depensesService, campementsService, blocsService, categoriesDepensesService } from '@/services';
import { formatFCFA, formatDate } from '@/utils/format';
import { showServerErrors, today } from '@/utils/errors';
import { ROLE, STATUT_DEPENSE_LABELS } from '@/constants';

const emptyForm = () => ({ designation: '', categorie_id: '', montant_total: '', campement_id: '', bloc_id: '', date: today(), statut: 'NON_PAYEE' });

export default function DepensesPage() {
  const { user } = useAuth();
  const isBoss = user?.role === ROLE.BIG_BOSS;
  const [data, setData] = useState([]);
  const [campements, setCampements] = useState([]);
  const [blocs, setBlocs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filterCategorie, setFilterCategorie] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filtreBloc, setFiltreBloc] = useState({ campement_id: '', bloc_id: '' });
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    Promise.all([depensesService.getAll(), campementsService.getAll(), blocsService.getAll(), categoriesDepensesService.getAll()])
      .then(([d, c, b, cat]) => {
        setData(d);
        setCampements(c);
        setBlocs(b);
        setCategories(cat);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  // Les achats aux particuliers se saisissent depuis leur page (calcul automatique du montant)
  const categoriesSaisie = categories.filter((c) => c.actif && !c.systeme).map((c) => ({ value: c.id, label: c.libelle }));

  const filtered = useMemo(() => {
    const f = buildBlocFilter(filtreBloc, blocs);
    return data.filter((d) => (!filterCategorie || d.categorie_id === filterCategorie)
      && (!filterStatut || d.statut === filterStatut)
      && matchBlocFilter(d, f));
  }, [data, filterCategorie, filterStatut, filtreBloc, blocs]);

  const totalDepenses = filtered.reduce((s, d) => s + d.montant_total, 0);
  const depensesPayees = filtered.filter((d) => d.statut === 'PAYEE').reduce((s, d) => s + d.montant_total, 0);
  const reste = totalDepenses - depensesPayees;

  const validate = () => {
    const errs = {};
    if (!form.designation.trim()) errs.designation = 'La désignation est obligatoire';
    if (!form.categorie_id) errs.categorie_id = 'La catégorie est obligatoire';
    if (!(Number(form.montant_total) > 0)) errs.montant_total = 'Le montant doit être supérieur à 0';
    if (!form.date) errs.date = 'La date est obligatoire';
    else if (form.date > today()) errs.date = 'La date ne peut pas être dans le futur';
    if (!form.bloc_id) errs.bloc_id = 'Le bloc est obligatoire';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const item = await depensesService.create({
        designation: form.designation.trim(),
        categorie_id: form.categorie_id,
        montant_total: Number(form.montant_total),
        bloc_id: form.bloc_id,
        date: form.date,
        statut: form.statut,
      });
      setData((d) => [item, ...d]);
      setShowAddModal(false);
      setForm(emptyForm());
      setFormErrors({});
      toast.success('Dépense enregistrée');
    } catch (err) {
      showServerErrors(err, { setFormErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await depensesService.remove(deleteTarget.id);
      setData((d) => d.filter((x) => x.id !== deleteTarget.id));
      toast.success('Dépense supprimée');
    } catch (err) {
      showServerErrors(err, { toast });
    } finally {
      setDeleteTarget(null);
    }
  };

  const columns = [
    { key: 'designation', header: 'Désignation', sortable: true, render: (row) => (
      <span className="flex items-center gap-1.5 font-medium text-ink-800">
        {row.achat_id && <ShoppingBag size={13} className="text-olive-600 shrink-0" aria-label="Achat particulier" />}
        {row.designation}
      </span>
    ) },
    { key: 'categorie', header: 'Catégorie', sortable: true },
    { key: 'campement_nom', header: 'Campement' },
    { key: 'bloc_code', header: 'Bloc', render: (row) => <span className="font-mono text-xs">{row.bloc_code || '—'}</span> },
    { key: 'date', header: 'Date', sortable: true, render: (row) => formatDate(row.date) },
    { key: 'montant_total', header: 'Montant', sortable: true, render: (row) => <span className="tabular-nums font-medium">{formatFCFA(row.montant_total)}</span> },
    { key: 'statut', header: 'Statut', render: (row) => <Badge status={row.statut}>{STATUT_DEPENSE_LABELS[row.statut]}</Badge> },
  ];

  // Une dépense issue d'un achat se gère depuis la page Achats particuliers
  const ActionsCell = ({ row }) => (
    <div className="flex items-center justify-end gap-1">
      {row.achat_id ? (
        <Link to="/particuliers" className="text-xs text-forest-700 hover:underline">Voir l'achat</Link>
      ) : isBoss ? (
        <button onClick={() => setDeleteTarget(row)} className="p-1.5 rounded-lg text-ink-400 hover:bg-earth-50 hover:text-earth-600 transition-colors" aria-label="Supprimer"><Trash2 size={15} /></button>
      ) : null}
    </div>
  );

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dépenses"
        subtitle="Charges de l'exploitation, par bloc"
        icon={Wallet}
        actions={<Button size="sm" onClick={() => { setForm(emptyForm()); setFormErrors({}); setShowAddModal(true); }}><Plus size={16} /> Nouvelle dépense</Button>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Total dépenses" value={formatFCFA(totalDepenses)} icon={Wallet} accent="forest" />
        <StatCard label="Payé" value={formatFCFA(depensesPayees)} icon={Wallet} accent="leaf" />
        <StatCard label="Reste à payer" value={formatFCFA(reste)} icon={Wallet} accent="earth" />
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          value={filterCategorie}
          onChange={(e) => setFilterCategorie(e.target.value)}
          options={categories.map((c) => ({ value: c.id, label: c.libelle }))}
          placeholder="Toutes les catégories"
          className="w-full sm:w-56"
        />
        <Select
          value={filterStatut}
          onChange={(e) => setFilterStatut(e.target.value)}
          options={Object.entries(STATUT_DEPENSE_LABELS).map(([value, label]) => ({ value, label }))}
          placeholder="Tous les statuts"
          className="w-full sm:w-48"
        />
        <BlocPicker mode="filter" campements={campements} blocs={blocs} value={filtreBloc} onChange={setFiltreBloc} />
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        searchPlaceholder="Rechercher une dépense..."
        searchKeys={['designation', 'categorie', 'bloc_code']}
        actions={ActionsCell}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        message={`Voulez-vous vraiment supprimer la dépense "${deleteTarget?.designation}" ? Cette action est irréversible.`}
      />

      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Nouvelle dépense"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Annuler</Button>
            <Button onClick={handleSubmit} loading={saving}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Désignation"
            required
            placeholder="Ex: Achat herbicide"
            value={form.designation}
            onChange={(e) => setForm({ ...form, designation: e.target.value })}
            error={formErrors.designation}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Catégorie"
              required
              options={categoriesSaisie}
              placeholder="Choisir"
              value={form.categorie_id}
              onChange={(e) => setForm({ ...form, categorie_id: e.target.value })}
              error={formErrors.categorie_id}
              hint="Les achats aux particuliers se saisissent dans « Achats particuliers »."
            />
            <Input
              label="Montant (FCFA)"
              required
              type="number"
              min="0"
              placeholder="0"
              value={form.montant_total}
              onChange={(e) => setForm({ ...form, montant_total: e.target.value })}
              error={formErrors.montant_total}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Date"
              required
              type="date"
              max={today()}
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              error={formErrors.date}
            />
            <Select
              label="Statut"
              options={Object.entries(STATUT_DEPENSE_LABELS).map(([value, label]) => ({ value, label }))}
              placeholder=""
              value={form.statut}
              onChange={(e) => setForm({ ...form, statut: e.target.value || 'NON_PAYEE' })}
              error={formErrors.statut}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
