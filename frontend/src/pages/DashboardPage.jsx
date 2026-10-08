import { useEffect, useState } from 'react';
import {
  Wallet, Users, HardHat, Package, ShoppingBag, Leaf,
  TrendingUp, AlertTriangle, ArrowRight, FileBarChart,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ComposedChart,
} from 'recharts';
import PageHeader from '@/components/PageHeader';
import { StatCard, ChartCard, Badge, Card, DonutChart } from '@/components/ui';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useFilters } from '@/contexts/FilterContext';
import { CHART_COLORS, MONTHS, ROLE } from '@/constants';
import { useAuth } from '@/contexts/AuthContext';
import Select from '@/components/ui/Select';
import ErrorState from '@/components/ui/ErrorState';
import BlocPicker from '@/components/BlocPicker';
import { campementsService, blocsService } from '@/services';
import { formatFCFA, formatNumber, formatPeriode } from '@/utils/format';
import { useTheme } from '@/contexts/ThemeContext';

export default function DashboardPage() {
  const { user } = useAuth();
  const { filters, updateFilter } = useFilters();
  const { theme } = useTheme();
  const [periode, setPeriode] = useState(filters.periode || '');
  const [perimetre, setPerimetre] = useState({ campement_id: '', bloc_id: '' });
  const [campements, setCampements] = useState([]);
  const [blocs, setBlocs] = useState([]);
  const { data, loading, error } = useDashboardData({ periode, ...perimetre });
  // Sans période choisie, le serveur renvoie la plus récente disposant de données
  const periodeAffichee = periode || data.periode;
  const periodeOptions = data.periodes.map((value) => ({ value, label: formatPeriode(value) }));

  useEffect(() => {
    Promise.all([campementsService.getAll(), blocsService.getAll()])
      .then(([c, b]) => { setCampements(c); setBlocs(b); })
      .catch(() => {});
  }, []);
  const isBoss = user?.role === ROLE.BIG_BOSS;
  const chartTextColor = theme === 'dark' ? '#bdcbbf' : '#888f88';
  const chartGridColor = theme === 'dark' ? '#34443a' : '#e7e9e7';
  const chartLineColor = theme === 'dark' ? '#a6d6af' : '#2f6142';
  const tooltipStyle = {
    backgroundColor: theme === 'dark' ? '#233128' : 'white',
    border: `1px solid ${chartGridColor}`,
    borderRadius: '8px',
    color: theme === 'dark' ? '#e5eee7' : '#3c403c',
    fontSize: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
  };

  const kpis = data.kpis;

  if (error) return <ErrorState message={error.message} onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title={isBoss ? `Bienvenue, ${user?.name?.split(' ')[0]}` : 'Dashboard'}
        subtitle={loading ? 'Chargement des indicateurs…' : (periodeAffichee ? formatPeriode(periodeAffichee) : 'Aucune donnée')}
        icon={FileBarChart}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <BlocPicker mode="filter" campements={campements} blocs={blocs} value={perimetre} onChange={setPerimetre} />
            <Select
              value={periodeAffichee}
              onChange={(e) => {
                setPeriode(e.target.value);
                updateFilter('periode', e.target.value);
              }}
              options={periodeOptions}
              placeholder="Période"
              className="w-full sm:w-44"
            />
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard
          label="Dépenses du mois"
          value={formatFCFA(kpis.totalDepenses)}
          evolution={kpis.depensesEvolution}
          evolutionLabel="vs mois précédent"
          icon={Wallet}
          accent="forest"
          compact
        />
        <StatCard
          label="Reste à payer"
          value={formatFCFA(kpis.resteAPayer)}
          icon={Wallet}
          accent="earth"
          compact
        />
        <StatCard
          label="Quantité réalisée"
          value={formatNumber(kpis.quantiteTotale)}
          unit="ha"
          icon={Leaf}
          accent="leaf"
          compact
        />
        <StatCard
          label="Alertes stock"
          value={data.stockAlerts.length}
          icon={Package}
          accent={data.stockAlerts.length ? 'earth' : 'leaf'}
          compact
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {/* Expenses evolution — line chart */}
        <ChartCard
          title="Évolution des dépenses"
          subtitle="6 derniers mois"
          compact
        >
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={data.depensesEvolutionData} margin={{ top: 5, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: chartTextColor }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: chartTextColor }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatFCFA(v)} />
              <Line
                type="monotone"
                dataKey="total"
                stroke={chartLineColor}
                strokeWidth={2.5}
                dot={{ r: 2, fill: chartLineColor }}
                activeDot={{ r: 5 }}
                name="Dépenses"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Expenses by category — donut */}
        <ChartCard
          title="Dépenses par catégorie"
          subtitle={formatPeriode(periodeAffichee)}
          compact
        >
          <DonutChart
            data={data.depensesParCategorie}
            colors={theme === 'dark' ? ['#a6d6af', '#80bd8a', '#d5ca75', '#83b49a', '#d69d74'] : CHART_COLORS}
            height={210}
            unit="FCFA"
            formatValue={formatFCFA}
            tooltipStyle={tooltipStyle}
            emptyMessage="Aucune dépense sur la période"
          />
        </ChartCard>
      </div>

      <section aria-labelledby="dashboard-details" className="space-y-4 pt-2">
        <h2 id="dashboard-details" className="text-base font-semibold text-ink-800">Indicateurs et analyses détaillés</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard label="Rémunérations payées" value={formatFCFA(kpis.remunerationPayee)} icon={TrendingUp} accent="leaf" compact />
          <StatCard label="Travaux" value={kpis.nbTravaux} unit="travaux" icon={HardHat} accent="sage" compact />
          <StatCard label="Stock disponible" value={formatNumber(kpis.stockDisponible)} unit="unités" icon={Package} accent="sage" compact />
          <StatCard label="Achats particuliers" value={formatFCFA(kpis.achatsParticuliers)} icon={ShoppingBag} accent="earth" compact />
          <StatCard label="Blocs actifs" value={kpis.blocsActifs} icon={Leaf} accent="forest" compact />
        </div>

        {/* Additional charts remain available below the first-screen summary. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Remuneration comparison — bar chart */}
        <ChartCard
          title="Rémunérations"
          subtitle="Dû / Payé / Reste à payer"
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.remunerationData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e9e7" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#888f88' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#888f88' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatFCFA(v)} cursor={{ fill: '#f4f0e6', opacity: 0.4 }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} name="Montant">
                <Cell fill="#97902f" />
                <Cell fill="#519744" />
                <Cell fill="#ad6e47" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Expenses by campement — bar chart */}
        <ChartCard
          title="Dépenses par campement"
          subtitle="Comparaison des campements"
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.depensesParCampement} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e9e7" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#888f88' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#888f88' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatFCFA(v)} cursor={{ fill: '#f4f0e6', opacity: 0.4 }} />
              <Bar dataKey="value" fill="#5e8767" radius={[6, 6, 0, 0]} name="Dépenses" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        </div>

      {/* Charts row 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Previsions vs Realise */}
        <ChartCard
          title="Prévisions vs Réalisé"
          subtitle="Comparaison budgétaire"
        >
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={data.previsionsData} margin={{ top: 5, right: 10, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e9e7" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#888f88' }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" height={60} interval={0} />
              <YAxis tick={{ fontSize: 11, fill: '#888f88' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatFCFA(v)} cursor={{ fill: '#f4f0e6', opacity: 0.4 }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="Prévu" fill="#aab4ae" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Réalisé" fill="#2f6142" radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Stock alerts + travaux */}
        <div className="space-y-4">
          <ChartCard
            title="Alertes stock"
            subtitle={`${data.stockAlerts.length} produit(s) en stock faible`}
          >
            <div className="space-y-2">
              {data.stockAlerts.length === 0 ? (
                <p className="text-sm text-ink-400 py-4 text-center">Aucune alerte de stock</p>
              ) : (
                data.stockAlerts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-earth-50/50 border border-earth-100">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={16} className="text-earth-600" />
                      <div>
                        <p className="text-sm font-medium text-ink-700">{p.nom}</p>
                        <p className="text-xs text-ink-400">Stock: {p.stock_calcule} {p.unite} / Seuil: {p.stock_minimum} {p.unite}</p>
                      </div>
                    </div>
                    <Badge status="low">Faible</Badge>
                  </div>
                ))
              )}
            </div>
          </ChartCard>

          <ChartCard
            title="Travaux par type"
            subtitle="Quantité réalisée (ha)"
          >
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.travauxData} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: '#888f88' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#888f88' }} axisLine={false} tickLine={false} width={80} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v} ha`} cursor={{ fill: '#f4f0e6', opacity: 0.4 }} />
                <Bar dataKey="value" fill="#519744" radius={[0, 4, 4, 0]} name="Quantité" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
      </section>
    </div>
  );
}
