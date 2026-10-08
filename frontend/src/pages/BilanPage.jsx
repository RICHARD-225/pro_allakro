import { useEffect, useState } from 'react';
import { FileBarChart } from 'lucide-react';
import { Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import PageHeader from '@/components/PageHeader';
import BlocPicker from '@/components/BlocPicker';
import { StatCard, ChartCard, Card, ErrorState, Select, DonutChart } from '@/components/ui';
import { useDashboardData } from '@/hooks/useDashboardData';
import { campementsService, blocsService } from '@/services';
import { formatFCFA, formatNumber, formatPeriode } from '@/utils/format';
import { CHART_COLORS } from '@/constants';

export default function BilanPage() {
  const [periode, setPeriode] = useState('');
  const [perimetre, setPerimetre] = useState({ campement_id: '', bloc_id: '' });
  const [campements, setCampements] = useState([]);
  const [blocs, setBlocs] = useState([]);
  const { data, loading, error } = useDashboardData({ periode, ...perimetre });

  useEffect(() => {
    Promise.all([campementsService.getAll(), blocsService.getAll()])
      .then(([c, b]) => { setCampements(c); setBlocs(b); })
      .catch(() => {});
  }, []);

  if (error) return <ErrorState message={error.message} onRetry={() => window.location.reload()} />;

  const periodeAffichee = periode || data.periode;
  const { kpis } = data;
  const libelle = periodeAffichee ? formatPeriode(periodeAffichee) : '';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bilan mensuel"
        subtitle={loading ? 'Calcul en cours…' : `Synthèse financière et opérationnelle — ${libelle}`}
        icon={FileBarChart}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <BlocPicker mode="filter" campements={campements} blocs={blocs} value={perimetre} onChange={setPerimetre} />
            <Select
              value={periodeAffichee}
              onChange={(e) => setPeriode(e.target.value)}
              options={data.periodes.map((p) => ({ value: p, label: formatPeriode(p) }))}
              placeholder="Période"
              className="w-full sm:w-44"
            />
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Dépenses" value={formatFCFA(kpis.totalDepenses)} icon={FileBarChart} accent="forest" period={libelle} />
        <StatCard label="Rémunérations dues" value={formatFCFA(kpis.remunerationDuee)} icon={FileBarChart} accent="olive" />
        <StatCard label="Rémunérations payées" value={formatFCFA(kpis.remunerationPayee)} icon={FileBarChart} accent="leaf" />
        <StatCard label="Reste à payer" value={formatFCFA(kpis.resteAPayer)} icon={FileBarChart} accent="earth" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Dépenses par catégorie" subtitle={libelle}>
          <DonutChart
            data={data.depensesParCategorie}
            colors={CHART_COLORS}
            height={280}
            unit="FCFA"
            formatValue={formatFCFA}
            tooltipStyle={{ backgroundColor: 'white', border: '1px solid #e7e9e7', borderRadius: '8px', fontSize: '12px' }}
            emptyMessage="Aucune dépense sur la période"
          />
        </ChartCard>

        <ChartCard title="Dépenses par campement" subtitle={libelle}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.depensesParCampement.filter((d) => d.value > 0)} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e9e7" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#888f88' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#888f88' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e7e9e7', borderRadius: '8px', fontSize: '12px' }} formatter={(v) => formatFCFA(v)} cursor={{ fill: '#f4f0e6', opacity: 0.4 }} />
              <Bar dataKey="value" fill="#5e8767" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-ink-800 mb-4">Synthèse</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <p className="text-xs text-ink-400 uppercase">Travaux</p>
            <p className="text-lg font-bold text-ink-800">{kpis.nbTravaux} travaux</p>
            <p className="text-sm text-ink-500">{formatNumber(kpis.quantiteTotale)} ha réalisés</p>
          </div>
          <div>
            <p className="text-xs text-ink-400 uppercase">Dépenses payées</p>
            <p className="text-lg font-bold text-leaf-700">{formatFCFA(kpis.depensesPayees)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400 uppercase">Dépenses en attente</p>
            <p className="text-lg font-bold text-earth-600">{formatFCFA(kpis.depensesEnAttente)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-400 uppercase">Achats particuliers</p>
            <p className="text-lg font-bold text-ink-800">{formatFCFA(kpis.achatsParticuliers)}</p>
            <p className="text-sm text-ink-500">{kpis.nbAchats} achat(s)</p>
          </div>
          <div>
            <p className="text-xs text-ink-400 uppercase">Taux de paiement des salaires</p>
            <p className="text-lg font-bold text-ink-800">{kpis.tauxPaiement}%</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
