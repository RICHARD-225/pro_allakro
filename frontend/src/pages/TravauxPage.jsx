import { useState, useEffect, useMemo } from 'react';
import { HardHat, Plus } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import BlocPicker, { matchBlocFilter, buildBlocFilter } from '@/components/BlocPicker';
import { DataTable, Badge, Button, ErrorState, Select, Modal, Input } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { travauxService, blocsService, equipesService, campementsService, typesTravauxService } from '@/services';
import { formatFCFA, formatDate, formatNumber } from '@/utils/format';
import { showServerErrors, today } from '@/utils/errors';
import { STATUT_TRAVAIL_LABELS } from '@/constants';

const emptyForm = () => ({
  type_travail_id: '', campement_id: '', bloc_id: '', equipe_id: '', date_travail: today(),
  quantite: '', unite: 'ha', prix_unitaire: '', statut: 'PLANIFIE',
});

export default function TravauxPage() {
  const [data, setData] = useState([]);
  const [blocs, setBlocs] = useState([]);
  const [campements, setCampements] = useState([]);
  const [equipes, setEquipes] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filtreBloc, setFiltreBloc] = useState({ campement_id: '', bloc_id: '' });
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    Promise.all([travauxService.getAll(), blocsService.getAll(), equipesService.getAll(), campementsService.getAll(), typesTravauxService.getAll()])
      .then(([t, b, e, c, tt]) => {
        setData(t);
        setBlocs(b);
        setEquipes(e);
        setCampements(c);
        setTypes(tt);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  // Montant affiché pendant la saisie ; le serveur le recalcule à l'enregistrement
  const montant = (Number(form.quantite) || 0) * (Number(form.prix_unitaire) || 0);

  // Équipes proposées : celles du campement choisi, l'équipe affectée au bloc en premier
  const equipesProposees = useMemo(() => {
    const actives = equipes.filter((e) => e.actif);
    const list = form.campement_id ? actives.filter((e) => e.campement_id === form.campement_id) : actives;
    return [...list].sort((a, b) => (b.bloc_id === form.bloc_id) - (a.bloc_id === form.bloc_id));
  }, [equipes, form.campement_id, form.bloc_id]);

  const filtered = useMemo(() => {
    const f = buildBlocFilter(filtreBloc, blocs);
    return data.filter((t) => (!filterType || t.type_travail_id === filterType)
      && (!filterStatus || t.statut === filterStatus)
      && matchBlocFilter(t, f));
  }, [data, filterType, filterStatus, filtreBloc, blocs]);

  const choisirType = (id) => {
    const type = types.find((t) => t.id === id);
    setForm((f) => ({ ...f, type_travail_id: id, unite: type?.unite_par_defaut || f.unite }));
  };

  const choisirBloc = (v) => {
    // Propose automatiquement l'équipe affectée au bloc
    const equipeDuBloc = equipes.find((e) => e.actif && e.bloc_id && e.bloc_id === v.bloc_id);
    setForm((f) => ({ ...f, ...v, equipe_id: equipeDuBloc?.id || f.equipe_id }));
  };

  const validate = () => {
    const errs = {};
    if (!form.type_travail_id) errs.type_travail_id = 'Le type est obligatoire';
    if (!form.bloc_id) errs.bloc_id = 'Le bloc est obligatoire';
    if (!form.equipe_id) errs.equipe_id = "L'équipe est obligatoire";
    if (!form.date_travail) errs.date_travail = 'La date est obligatoire';
    if (!(Number(form.quantite) > 0)) errs.quantite = 'La quantité doit être supérieure à 0';
    if (form.prix_unitaire === '' || Number(form.prix_unitaire) < 0) errs.prix_unitaire = 'Le prix unitaire est obligatoire';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const item = await travauxService.create({
        type_travail_id: form.type_travail_id,
        bloc_id: form.bloc_id,
        equipe_id: form.equipe_id,
        date_travail: form.date_travail,
        quantite: Number(form.quantite),
        unite: form.unite.trim(),
        prix_unitaire: Number(form.prix_unitaire),
        statut: form.statut,
      });
      setData((d) => [item, ...d]);
      setShowAddModal(false);
      setForm(emptyForm());
      setFormErrors({});
      toast.success(`Travail enregistré — ${formatFCFA(item.montant_total)}`);
    } catch (err) {
      showServerErrors(err, { setFormErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'type_travail_libelle', header: 'Type', sortable: true, render: (row) => <span className="font-medium text-ink-800">{row.type_travail_libelle}</span> },
    { key: 'bloc_code', header: 'Bloc', render: (row) => <span className="font-mono text-xs">{row.bloc_code}</span> },
    { key: 'equipe_nom', header: 'Équipe', render: (row) => row.equipe_nom || '—' },
    { key: 'date_travail', header: 'Date', sortable: true, render: (row) => formatDate(row.date_travail) },
    { key: 'quantite', header: 'Quantité', sortable: true, render: (row) => <span className="tabular-nums">{formatNumber(row.quantite)} {row.unite}</span> },
    { key: 'prix_unitaire', header: 'Prix unit.', render: (row) => <span className="tabular-nums">{formatFCFA(row.prix_unitaire)}</span> },
    { key: 'montant_total', header: 'Montant', sortable: true, render: (row) => <span className="tabular-nums font-medium">{formatFCFA(row.montant_total)}</span> },
    { key: 'statut', header: 'Statut', render: (row) => <Badge status={row.statut}>{STATUT_TRAVAIL_LABELS[row.statut] || row.statut}</Badge> },
  ];

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Travaux"
        subtitle="Travaux agricoles réalisés sur les blocs"
        icon={HardHat}
        actions={<Button size="sm" onClick={() => { setForm(emptyForm()); setFormErrors({}); setShowAddModal(true); }}><Plus size={16} /> Nouveau travail</Button>}
      />
      <div className="flex flex-wrap gap-3">
        <Select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          options={types.map((t) => ({ value: t.id, label: t.libelle }))}
          placeholder="Tous les types"
          className="w-full sm:w-44"
        />
        <Select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          options={Object.entries(STATUT_TRAVAIL_LABELS).map(([value, label]) => ({ value, label }))}
          placeholder="Tous les statuts"
          className="w-full sm:w-40"
        />
        <BlocPicker mode="filter" campements={campements} blocs={blocs} value={filtreBloc} onChange={setFiltreBloc} />
      </div>
      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        searchPlaceholder="Rechercher un travail..."
        searchKeys={['type_travail_libelle', 'bloc_code', 'equipe_nom', 'periode']}
      />

      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Nouveau travail"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Annuler</Button>
            <Button onClick={handleSubmit} loading={saving}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Type de travail"
            required
            options={types.filter((t) => t.actif).map((t) => ({ value: t.id, label: t.libelle }))}
            placeholder="Choisir un type"
            value={form.type_travail_id}
            onChange={(e) => choisirType(e.target.value)}
            error={formErrors.type_travail_id}
          />
          <BlocPicker
            campements={campements}
            blocs={blocs}
            value={form}
            onChange={choisirBloc}
            required
            errors={formErrors}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Équipe"
              required
              options={equipesProposees.map((e) => ({ value: e.id, label: e.bloc_id === form.bloc_id && form.bloc_id ? `${e.nom} (affectée au bloc)` : e.nom }))}
              placeholder="Choisir une équipe"
              value={form.equipe_id}
              onChange={(e) => setForm({ ...form, equipe_id: e.target.value })}
              error={formErrors.equipe_id}
            />
            <Input
              label="Date du travail"
              required
              type="date"
              value={form.date_travail}
              onChange={(e) => setForm({ ...form, date_travail: e.target.value })}
              error={formErrors.date_travail}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Input
              label="Quantité"
              required
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={form.quantite}
              onChange={(e) => setForm({ ...form, quantite: e.target.value })}
              error={formErrors.quantite}
            />
            <Input label="Unité" value={form.unite} onChange={(e) => setForm({ ...form, unite: e.target.value })} error={formErrors.unite} />
            <Input
              label="Prix unitaire (FCFA)"
              required
              type="number"
              min="0"
              placeholder="0"
              value={form.prix_unitaire}
              onChange={(e) => setForm({ ...form, prix_unitaire: e.target.value })}
              error={formErrors.prix_unitaire}
            />
            <Select
              label="Statut"
              options={Object.entries(STATUT_TRAVAIL_LABELS).map(([value, label]) => ({ value, label }))}
              placeholder=""
              value={form.statut}
              onChange={(e) => setForm({ ...form, statut: e.target.value || 'PLANIFIE' })}
              error={formErrors.statut}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-forest-50 px-4 py-3">
            <span className="text-sm text-forest-800">
              Montant du travail
              <span className="block text-xs text-forest-600">
                {formatNumber(Number(form.quantite) || 0)} {form.unite} × {formatFCFA(Number(form.prix_unitaire) || 0)}
              </span>
            </span>
            <span className="text-lg font-bold text-forest-800 tabular-nums">{formatFCFA(montant)}</span>
          </div>
        </div>
      </Modal>
    </div>
  );
}
