import { useState, useEffect, useMemo } from 'react';
import { Wallet, Plus, UserCircle } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import BlocPicker, { matchBlocFilter, buildBlocFilter } from '@/components/BlocPicker';
import { DataTable, Badge, Button, ErrorState, StatCard, Select, Modal, Input } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { remunerationsService, personnesService, campementsService, blocsService } from '@/services';
import { formatFCFA, formatPeriode } from '@/utils/format';
import { showServerErrors, currentPeriode } from '@/utils/errors';
import { STATUT_DEPENSE_LABELS as STATUS_LABELS } from '@/constants';

const emptyForm = () => ({ personne_id: '', periode: currentPeriode(), montant_brut: '', montant_ponction: '' });

export default function RemunerationsPage() {
  const [data, setData] = useState([]);
  const [personnes, setPersonnes] = useState([]);
  const [campements, setCampements] = useState([]);
  const [blocs, setBlocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPeriode, setFilterPeriode] = useState('');
  const [filtreBloc, setFiltreBloc] = useState({ campement_id: '', bloc_id: '' });
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    Promise.all([remunerationsService.getAll(), personnesService.getAll(), campementsService.getAll(), blocsService.getAll()])
      .then(([r, p, c, b]) => {
        setData(r);
        setPersonnes(p);
        setCampements(c);
        setBlocs(b);
        setFilterPeriode(r[0]?.periode || '');
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  const periodes = [...new Set(data.map((r) => r.periode))].sort().reverse();

  const filtered = useMemo(() => {
    const f = buildBlocFilter(filtreBloc, blocs);
    return data.filter((r) => (!filterStatus || r.statut === filterStatus)
      && (!filterPeriode || r.periode === filterPeriode)
      && matchBlocFilter(r, f));
  }, [data, filterStatus, filterPeriode, filtreBloc, blocs]);

  const totalDu = filtered.reduce((s, r) => s + r.montant_du, 0);
  const totalPaye = filtered.reduce((s, r) => s + r.montant_paye, 0);
  const totalReste = filtered.reduce((s, r) => s + r.reste, 0);
  const net = (Number(form.montant_brut) || 0) - (Number(form.montant_ponction) || 0);

  const validate = () => {
    const errs = {};
    if (!form.personne_id) errs.personne_id = 'La personne est obligatoire';
    if (!/^\d{4}-\d{2}$/.test(form.periode)) errs.periode = 'La période est obligatoire';
    if (!(Number(form.montant_brut) > 0)) errs.montant_brut = 'Le montant brut doit être supérieur à 0';
    if (Number(form.montant_ponction) < 0) errs.montant_ponction = 'La ponction ne peut pas être négative';
    else if (net < 0) errs.montant_ponction = 'La ponction ne peut pas dépasser le brut';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const item = await remunerationsService.create({
        personne_id: form.personne_id,
        periode: form.periode,
        montant_brut: Number(form.montant_brut),
        montant_ponction: Number(form.montant_ponction) || 0,
      });
      setData((d) => [item, ...d]);
      setShowAddModal(false);
      setFormErrors({});
      toast.success(`Rémunération de ${item.personne_nom} enregistrée (${formatFCFA(item.montant_net)} net)`);
    } catch (err) {
      showServerErrors(err, { setFormErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'personne_nom', header: 'Personne', sortable: true, render: (row) => (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-forest-50 flex items-center justify-center shrink-0">
          <UserCircle size={16} className="text-forest-600" />
        </div>
        <span>
          <span className="block font-medium text-ink-800">{row.personne_nom}</span>
          <span className="block text-xs text-ink-400 font-mono">{row.matricule}</span>
        </span>
      </div>
    ) },
    { key: 'bloc_code', header: 'Bloc', render: (row) => <span className="font-mono text-xs">{row.bloc_code || '—'}</span> },
    { key: 'periode', header: 'Période', sortable: true, render: (row) => formatPeriode(row.periode) },
    { key: 'montant_brut', header: 'Brut', sortable: true, render: (row) => <span className="tabular-nums text-ink-500">{formatFCFA(row.montant_brut)}</span> },
    { key: 'montant_du', header: 'Net dû', sortable: true, render: (row) => <span className="tabular-nums">{formatFCFA(row.montant_du)}</span> },
    { key: 'montant_paye', header: 'Payé', sortable: true, render: (row) => <span className="tabular-nums text-leaf-700">{formatFCFA(row.montant_paye)}</span> },
    { key: 'reste', header: 'Reste', sortable: true, render: (row) => <span className={`tabular-nums ${row.reste > 0 ? 'text-earth-600' : 'text-ink-400'}`}>{formatFCFA(row.reste)}</span> },
    { key: 'statut', header: 'Statut', render: (row) => <Badge status={row.statut}>{STATUS_LABELS[row.statut]}</Badge> },
  ];

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rémunérations"
        subtitle="Montants dus par personne et par mois — les paiements se font dans « Paiements »"
        icon={Wallet}
        actions={<Button size="sm" onClick={() => { setForm(emptyForm()); setFormErrors({}); setShowAddModal(true); }}><Plus size={16} /> Nouvelle rémunération</Button>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Total dû (net)" value={formatFCFA(totalDu)} icon={Wallet} accent="olive" />
        <StatCard label="Total payé" value={formatFCFA(totalPaye)} icon={Wallet} accent="leaf" />
        <StatCard label="Reste à payer" value={formatFCFA(totalReste)} icon={Wallet} accent="earth" />
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          value={filterPeriode}
          onChange={(e) => setFilterPeriode(e.target.value)}
          options={periodes.map((p) => ({ value: p, label: formatPeriode(p) }))}
          placeholder="Toutes les périodes"
          className="w-full sm:w-48"
        />
        <Select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          placeholder="Tous les statuts"
          className="w-full sm:w-48"
        />
        <BlocPicker mode="filter" campements={campements} blocs={blocs} value={filtreBloc} onChange={setFiltreBloc} />
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        searchPlaceholder="Rechercher une personne..."
        searchKeys={['personne_nom', 'matricule']}
      />

      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Nouvelle rémunération"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Annuler</Button>
            <Button onClick={handleSubmit} loading={saving}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Personne"
            required
            options={personnes.filter((p) => p.actif).map((p) => ({ value: p.id, label: `${p.prenom} ${p.nom} — ${p.matricule}` }))}
            placeholder="Rechercher une personne"
            value={form.personne_id}
            onChange={(e) => setForm({ ...form, personne_id: e.target.value })}
            error={formErrors.personne_id}
          />
          <Input
            label="Période"
            required
            type="month"
            value={form.periode}
            onChange={(e) => setForm({ ...form, periode: e.target.value })}
            error={formErrors.periode}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Montant brut (FCFA)"
              required
              type="number"
              min="0"
              placeholder="0"
              value={form.montant_brut}
              onChange={(e) => setForm({ ...form, montant_brut: e.target.value })}
              error={formErrors.montant_brut}
            />
            <Input
              label="Ponctions (FCFA)"
              type="number"
              min="0"
              placeholder="0"
              value={form.montant_ponction}
              onChange={(e) => setForm({ ...form, montant_ponction: e.target.value })}
              error={formErrors.montant_ponction}
              hint="Avances, retenues..."
            />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-forest-50 px-4 py-3">
            <span className="text-sm text-forest-800">Net à payer</span>
            <span className={`text-lg font-bold tabular-nums ${net < 0 ? 'text-earth-600' : 'text-forest-800'}`}>{formatFCFA(net)}</span>
          </div>
        </div>
      </Modal>
    </div>
  );
}
