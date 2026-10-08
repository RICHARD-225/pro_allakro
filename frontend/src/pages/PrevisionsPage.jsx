import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Plus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import PageHeader from '@/components/PageHeader';
import BlocPicker, { matchBlocFilter, buildBlocFilter } from '@/components/BlocPicker';
import { DataTable, Button, ErrorState, StatCard, ChartCard, Modal, Input, Select } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { previsionsService, categoriesDepensesService, campementsService, blocsService } from '@/services';
import { formatFCFA, formatPeriode } from '@/utils/format';
import { showServerErrors, currentPeriode } from '@/utils/errors';

const emptyForm = () => ({ campement_id: '', bloc_id: '', categorie_id: '', periode: currentPeriode(), montant_prevu: '' });

export default function PrevisionsPage() {
  const [data, setData] = useState([]);
  const [categories, setCategories] = useState([]);
  const [campements, setCampements] = useState([]);
  const [blocs, setBlocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filterPeriode, setFilterPeriode] = useState('');
  const [filtreBloc, setFiltreBloc] = useState({ campement_id: '', bloc_id: '' });
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    Promise.all([previsionsService.getAll(), categoriesDepensesService.getAll(), campementsService.getAll(), blocsService.getAll()])
      .then(([p, cat, c, b]) => {
        setData(p);
        setCategories(cat);
        setCampements(c);
        setBlocs(b);
        setFilterPeriode(p[0]?.periode || '');
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  const periodes = [...new Set(data.map((p) => p.periode))].sort().reverse();

  const filtered = useMemo(() => {
    const f = buildBlocFilter(filtreBloc, blocs);
    return data.filter((p) => (!filterPeriode || p.periode === filterPeriode) && matchBlocFilter(p, f));
  }, [data, filterPeriode, filtreBloc, blocs]);

  const totalPrevu = filtered.reduce((s, p) => s + p.montant_prevu, 0);
  const totalRealise = filtered.reduce((s, p) => s + p.realise, 0);
  const totalEcart = totalRealise - totalPrevu;

  // Graphique : prévu / réalisé cumulés par catégorie
  const chartData = Object.values(filtered.reduce((acc, p) => {
    const key = p.categorie;
    acc[key] = acc[key] || { name: key, Prévu: 0, Réalisé: 0 };
    acc[key].Prévu += p.montant_prevu;
    acc[key].Réalisé += p.realise;
    return acc;
  }, {}));

  const validate = () => {
    const errs = {};
    if (!form.campement_id) errs.campement_id = 'Le campement est obligatoire';
    if (!form.categorie_id) errs.categorie_id = 'La catégorie est obligatoire';
    if (!/^\d{4}-\d{2}$/.test(form.periode)) errs.periode = 'La période est obligatoire';
    if (!(Number(form.montant_prevu) > 0)) errs.montant_prevu = 'Le montant prévu doit être supérieur à 0';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const item = await previsionsService.create({
        campement_id: form.campement_id,
        bloc_id: form.bloc_id || null,
        categorie_id: form.categorie_id,
        periode: form.periode,
        montant_prevu: Number(form.montant_prevu),
      });
      setData((d) => [item, ...d]);
      setFilterPeriode(item.periode);
      setShowAddModal(false);
      setFormErrors({});
      toast.success(`Prévision enregistrée — déjà réalisé : ${formatFCFA(item.realise)}`);
    } catch (err) {
      showServerErrors(err, { setFormErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'categorie', header: 'Catégorie', sortable: true, render: (row) => <span className="font-medium text-ink-800">{row.categorie}</span> },
    { key: 'campement_nom', header: 'Campement' },
    { key: 'bloc_code', header: 'Bloc', render: (row) => <span className="font-mono text-xs">{row.bloc_code || 'Tous'}</span> },
    { key: 'periode', header: 'Période', sortable: true, render: (row) => formatPeriode(row.periode) },
    { key: 'montant_prevu', header: 'Prévu', sortable: true, render: (row) => <span className="tabular-nums">{formatFCFA(row.montant_prevu)}</span> },
    { key: 'realise', header: 'Réalisé', sortable: true, render: (row) => <span className="tabular-nums">{formatFCFA(row.realise)}</span> },
    { key: 'ecart', header: 'Écart', sortable: true, render: (row) => (
      <span className={`tabular-nums font-medium ${row.ecart > 0 ? 'text-earth-600' : 'text-leaf-700'}`}>
        {row.ecart > 0 ? '+' : ''}{formatFCFA(row.ecart)}
      </span>
    ) },
    { key: 'taux', header: 'Consommé', sortable: true, render: (row) => (
      <span className={`tabular-nums ${row.taux > 100 ? 'text-earth-600 font-medium' : 'text-ink-600'}`}>{row.taux ?? 0} %</span>
    ) },
  ];

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Prévisions"
        subtitle="Budget prévisionnel vs dépenses réellement engagées"
        icon={TrendingUp}
        actions={<Button size="sm" onClick={() => { setForm(emptyForm()); setFormErrors({}); setShowAddModal(true); }}><Plus size={16} /> Nouvelle prévision</Button>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Total prévu" value={formatFCFA(totalPrevu)} icon={TrendingUp} accent="sage" />
        <StatCard label="Total réalisé" value={formatFCFA(totalRealise)} icon={TrendingUp} accent="forest" />
        <StatCard label="Écart" value={`${totalEcart > 0 ? '+' : ''}${formatFCFA(totalEcart)}`} icon={TrendingUp} accent={totalEcart > 0 ? 'earth' : 'leaf'} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          value={filterPeriode}
          onChange={(e) => setFilterPeriode(e.target.value)}
          options={periodes.map((p) => ({ value: p, label: formatPeriode(p) }))}
          placeholder="Toutes les périodes"
          className="w-full sm:w-48"
        />
        <BlocPicker mode="filter" campements={campements} blocs={blocs} value={filtreBloc} onChange={setFiltreBloc} />
      </div>

      <ChartCard title="Prévu vs Réalisé par catégorie" subtitle={filterPeriode ? formatPeriode(filterPeriode) : 'Toutes périodes'}>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e9e7" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#888f88' }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" height={60} interval={0} />
            <YAxis tick={{ fontSize: 11, fill: '#888f88' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e7e9e7', borderRadius: '8px', fontSize: '12px' }} formatter={(v) => formatFCFA(v)} cursor={{ fill: '#f4f0e6', opacity: 0.4 }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
            <Bar dataKey="Prévu" fill="#aab4ae" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Réalisé" fill="#2f6142" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        searchPlaceholder="Rechercher une prévision..."
        searchKeys={['categorie', 'campement_nom', 'bloc_code']}
      />

      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Nouvelle prévision"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Annuler</Button>
            <Button onClick={handleSubmit} loading={saving}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-4">
          <BlocPicker
            campements={campements}
            blocs={blocs}
            value={form}
            onChange={(v) => setForm({ ...form, ...v })}
            errors={formErrors}
          />
          <p className="-mt-2 text-xs text-ink-400">Laissez le bloc vide pour un budget couvrant tout le campement.</p>
          <Select
            label="Catégorie"
            required
            options={categories.filter((c) => c.actif).map((c) => ({ value: c.id, label: c.libelle }))}
            placeholder="Choisir une catégorie"
            value={form.categorie_id}
            onChange={(e) => setForm({ ...form, categorie_id: e.target.value })}
            error={formErrors.categorie_id}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Période"
              required
              type="month"
              value={form.periode}
              onChange={(e) => setForm({ ...form, periode: e.target.value })}
              error={formErrors.periode}
            />
            <Input
              label="Montant prévu (FCFA)"
              required
              type="number"
              min="0"
              placeholder="0"
              value={form.montant_prevu}
              onChange={(e) => setForm({ ...form, montant_prevu: e.target.value })}
              error={formErrors.montant_prevu}
            />
          </div>
          <p className="text-xs text-ink-400">Le réalisé est calculé automatiquement à partir des dépenses enregistrées.</p>
        </div>
      </Modal>
    </div>
  );
}
