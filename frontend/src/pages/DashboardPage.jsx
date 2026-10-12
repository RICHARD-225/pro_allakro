import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet, HardHat, Package, ShoppingBag, Leaf, AlertTriangle, LayoutDashboard, CheckCircle2, Hourglass, Coins, ArrowRight,
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import PageHeader from '@/components/PageHeader';
import BlocPicker from '@/components/BlocPicker';
import { ChartCard, Badge, BarresHorizontales, DonutChart, Filtres, KpiGrid, Select, ErrorState } from '@/components/ui';
import { compterFiltres } from '@/components/ui/Filtres';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useFilters } from '@/contexts/FilterContext';
import { useAuth } from '@/contexts/AuthContext';
import { useStyleGraphique } from '@/hooks/useStyleGraphique';
import { campementsService, blocsService } from '@/services';
import { ROLE } from '@/constants';
import { formatFCFA, formatNumber, formatPeriode } from '@/utils/format';

const milliers = (v) => (Math.abs(v) >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : `${Math.round(v / 1000)}k`);

export default function DashboardPage() {
  const { user } = useAuth();
  const { filters, updateFilter } = useFilters();
  const style = useStyleGraphique();
  const [periode, setPeriode] = useState(filters.periode || '');
  const [perimetre, setPerimetre] = useState({ campement_id: '', bloc_id: '' });
  const [campements, setCampements] = useState([]);
  const [blocs, setBlocs] = useState([]);
  const { data, loading, error } = useDashboardData({ periode, ...perimetre });
  // Sans période choisie, le serveur renvoie la plus récente disposant de données
  const periodeAffichee = periode || data.periode;

  useEffect(() => {
    Promise.all([campementsService.getAll(), blocsService.getAll()])
      .then(([c, b]) => { setCampements(c); setBlocs(b); })
      .catch(() => {});
  }, []);

  // Couleurs des graphiques selon le thème (libellés d'axes lisibles)
  const { axe, infoBulle: tooltipStyle } = style;
  const couleurs = style;
  const choisirPeriode = (valeur) => {
    setPeriode(valeur);
    updateFilter('periode', valeur);
  };

  const { kpis } = data;
  const campementsAvecDepenses = data.depensesParCampement.filter((d) => d.value > 0);
  const isBoss = user?.role === ROLE.BIG_BOSS;

  if (error) return <ErrorState message={error.message} onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title={isBoss ? `Bienvenue, ${user?.name?.split(' ')[0]}` : 'Tableau de bord'}
        subtitle={loading ? 'Chargement des indicateurs…' : (periodeAffichee ? formatPeriode(periodeAffichee) : 'Aucune donnée')}
        icon={LayoutDashboard}
        actions={(
          <Filtres
            actifs={compterFiltres(periode, perimetre.campement_id, perimetre.bloc_id)}
            onReset={() => { choisirPeriode(''); setPerimetre({ campement_id: '', bloc_id: '' }); }}
          >
            <Select
              value={periodeAffichee}
              onChange={(e) => choisirPeriode(e.target.value)}
              options={data.periodes.map((value) => ({ value, label: formatPeriode(value) }))}
              placeholder="Période"
              className="w-full sm:w-48"
            />
            <BlocPicker mode="filter" campements={campements} blocs={blocs} value={perimetre} onChange={setPerimetre} />
          </Filtres>
        )}
      />

      <KpiGrid items={[
        { label: 'Dépenses du mois', value: formatNumber(kpis.totalDepenses), unit: 'FCFA', icon: Wallet, accent: 'forest',
          evolution: kpis.depensesEvolution, evolutionLabel: 'vs mois précédent' },
        { label: 'Salaires à payer', value: formatNumber(kpis.resteAPayer), unit: 'FCFA', icon: Hourglass, accent: 'earth',
          hint: `sur ${formatFCFA(kpis.remunerationDuee)} dus` },
        { label: 'Travaux du mois', value: kpis.nbTravaux, unit: 'travaux', icon: HardHat, accent: 'sage',
          hint: formatFCFA(kpis.montantTravaux ?? 0) },
        { label: 'Alertes stock', value: data.stockAlerts.length, unit: 'produit(s)', icon: AlertTriangle,
          accent: data.stockAlerts.length ? 'earth' : 'leaf', hint: data.stockAlerts.length ? 'sous le seuil' : 'aucune' },
      ]} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Évolution des dépenses" subtitle="6 derniers mois" compact>
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={data.depensesEvolutionData} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={couleurs.grille} vertical={false} />
              <XAxis dataKey="month" tick={axe} axisLine={false} tickLine={false} />
              <YAxis tick={axe} axisLine={false} tickLine={false} tickFormatter={milliers} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatFCFA(v)} />
              <Line type="monotone" dataKey="total" stroke={couleurs.ligne} strokeWidth={2.5} dot={{ r: 2, fill: couleurs.ligne }} activeDot={{ r: 5 }} name="Dépenses" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Dépenses par catégorie" subtitle={formatPeriode(periodeAffichee)} compact>
          <DonutChart
            data={data.depensesParCategorie}
            colors={style.categories}
            height={210}
            unit="FCFA"
            formatValue={formatFCFA}
            tooltipStyle={tooltipStyle}
            emptyMessage="Aucune dépense sur la période"
          />
        </ChartCard>
      </div>

      <section aria-labelledby="dashboard-details" className="space-y-4 pt-1">
        <h2 id="dashboard-details" className="text-base font-semibold text-ink-800">Détails du mois</h2>

        <KpiGrid items={[
          { label: 'Salaires payés', value: formatNumber(kpis.remunerationPayee), unit: 'FCFA', icon: CheckCircle2, accent: 'leaf',
            hint: `${kpis.tauxPaiement} % des salaires dus` },
          { label: 'Achats particuliers', value: formatNumber(kpis.achatsParticuliers), unit: 'FCFA', icon: ShoppingBag, accent: 'earth',
            hint: `${kpis.nbAchats} achat(s)` },
          { label: 'Valeur du stock', value: formatNumber(kpis.valeurStock ?? 0), unit: 'FCFA', icon: Coins, accent: 'olive' },
          { label: 'Blocs actifs', value: kpis.blocsActifs, icon: Leaf, accent: 'forest' },
        ]} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Salaires" subtitle="Dû, payé et reste à payer"
            action={<Link to="/salaires" className="inline-flex items-center gap-1 text-xs font-medium text-forest-700 hover:underline">Salaires <ArrowRight size={13} /></Link>}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.remunerationData} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={couleurs.grille} vertical={false} />
                <XAxis dataKey="name" tick={{ ...axe, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={axe} axisLine={false} tickLine={false} tickFormatter={milliers} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatFCFA(v)} cursor={{ fill: couleurs.survol }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} name="Montant">
                  <Cell fill="#97902f" />
                  <Cell fill="#519744" />
                  <Cell fill="#ad6e47" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Dépenses par campement" subtitle={formatPeriode(periodeAffichee)}>
            {campementsAvecDepenses.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-500">Aucune dépense sur la période.</p>
            ) : (
              <BarresHorizontales data={campementsAvecDepenses} series={[{ cle: 'value', nom: 'Dépenses', couleur: '#5e8767' }]} />
            )}
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Travaux par activité" subtitle="Montant du mois (FCFA)">
            {data.travauxData.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-500">Aucun travail ce mois-ci.</p>
            ) : (
              <BarresHorizontales data={data.travauxData} series={[{ cle: 'value', nom: 'Montant', couleur: '#519744' }]} />
            )}
          </ChartCard>

          <ChartCard title="Alertes stock" subtitle={`${data.stockAlerts.length} produit(s) sous le seuil`}
            action={<Link to="/stock" className="inline-flex items-center gap-1 text-xs font-medium text-forest-700 hover:underline">Stock <ArrowRight size={13} /></Link>}>
            {data.stockAlerts.length === 0 ? (
              <p className="py-3 text-center text-sm text-ink-500">Aucune alerte de stock.</p>
            ) : (
              <ul className="space-y-2">
                {data.stockAlerts.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-earth-100 bg-earth-50/50 px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Package size={15} className="shrink-0 text-earth-600" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink-700">{p.nom}</span>
                        <span className="text-xs tabular-nums text-ink-500">{formatNumber(p.stock_calcule)} {p.unite} · seuil {formatNumber(p.stock_minimum)} {p.unite}</span>
                      </span>
                    </span>
                    <Badge status="low">Faible</Badge>
                  </li>
                ))}
              </ul>
            )}
          </ChartCard>
        </div>
      </section>
    </div>
  );
}
