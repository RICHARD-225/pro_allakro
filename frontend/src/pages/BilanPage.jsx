import { useEffect, useState } from 'react';
import { FileBarChart, Wallet, CircleDollarSign, CheckCircle2, Hourglass } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import BlocPicker from '@/components/BlocPicker';
import ClotureMois from '@/components/ClotureMois';
import { RepartitionDepenses, ChartCard, Card, ErrorState, Select, DonutChart, Filtres, KpiGrid } from '@/components/ui';
import { compterFiltres } from '@/components/ui/Filtres';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useStyleGraphique } from '@/hooks/useStyleGraphique';
import { campementsService, blocsService } from '@/services';
import { formatFCFA, formatNumber, formatPeriode } from '@/utils/format';

export default function BilanPage() {
  const [periode, setPeriode] = useState('');
  const [perimetre, setPerimetre] = useState({ campement_id: '', bloc_id: '' });
  const [campements, setCampements] = useState([]);
  const [blocs, setBlocs] = useState([]);
  const { data, loading, error } = useDashboardData({ periode, ...perimetre });
  const style = useStyleGraphique();

  useEffect(() => {
    Promise.all([campementsService.getAll(), blocsService.getAll()])
      .then(([c, b]) => { setCampements(c); setBlocs(b); })
      .catch(() => {});
  }, []);

  if (error) return <ErrorState message={error.message} onRetry={() => window.location.reload()} />;

  const periodeAffichee = periode || data.periode;
  const { kpis } = data;
  // Regroupements proposés : le même total de dépenses, vu par campement, bloc, catégorie ou activité
  const axes = [
    { id: 'campement', label: 'Campement', lignes: data.depensesParCampement.map((c) => ({ name: c.label || c.name, sous: c.responsable ? `Responsable : ${c.responsable}` : undefined, value: c.value })) },
    { id: 'bloc', label: 'Bloc', lignes: data.depensesParBloc.map((b) => ({ name: b.name, sous: b.campement, value: b.value })) },
    { id: 'categorie', label: 'Catégorie', lignes: data.depensesParCategorie },
    { id: 'activite', label: 'Activité', lignes: data.depensesParActivite.map((a) => ({ ...a, sous: a.name === 'Hors travaux' ? 'Achats, charges et autres dépenses' : 'Salaires payés pour cette activité' })) },
  ];
  const libelle = periodeAffichee ? formatPeriode(periodeAffichee) : '';

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Bilan mensuel"
        subtitle={loading ? 'Calcul en cours…' : libelle}
        icon={FileBarChart}
        actions={(
          <Filtres
            actifs={compterFiltres(periode, perimetre.campement_id, perimetre.bloc_id)}
            onReset={() => { setPeriode(''); setPerimetre({ campement_id: '', bloc_id: '' }); }}
          >
            <Select
              value={periodeAffichee}
              onChange={(e) => setPeriode(e.target.value)}
              options={data.periodes.map((p) => ({ value: p, label: formatPeriode(p) }))}
              placeholder="Période"
              className="w-full sm:w-48"
            />
            <BlocPicker mode="filter" campements={campements} blocs={blocs} value={perimetre} onChange={setPerimetre} />
          </Filtres>
        )}
      />

      <ClotureMois periode={periodeAffichee} />

      <KpiGrid items={[
        { label: 'Dépenses', value: formatNumber(kpis.totalDepenses), unit: 'FCFA', icon: Wallet, accent: 'forest' },
        { label: 'Salaires dus', value: formatNumber(kpis.remunerationDuee), unit: 'FCFA', icon: CircleDollarSign, accent: 'olive' },
        { label: 'Salaires payés', value: formatNumber(kpis.remunerationPayee), unit: 'FCFA', icon: CheckCircle2, accent: 'leaf' },
        { label: 'Reste à payer', value: formatNumber(kpis.resteAPayer), unit: 'FCFA', icon: Hourglass, accent: 'earth' },
      ]} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Dépenses par catégorie" subtitle={libelle}>
          <DonutChart
            data={data.depensesParCategorie}
            colors={style.categories}
            height={280}
            unit="FCFA"
            formatValue={formatFCFA}
            tooltipStyle={style.infoBulle}
            emptyMessage="Aucune dépense sur la période"
          />
        </ChartCard>

        <ChartCard title="Répartition des dépenses" subtitle={`${libelle} · par campement, bloc, catégorie ou activité`}>
          <RepartitionDepenses axes={axes} />
        </ChartCard>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink-800 mb-4">Synthèse</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <p className="text-xs font-medium text-ink-500">Travaux</p>
            <p className="text-lg font-semibold tabular-nums text-ink-800">{kpis.nbTravaux} travaux</p>
            <p className="text-sm text-ink-500">{formatFCFA(kpis.montantTravaux ?? 0)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-ink-500">Dépenses payées</p>
            <p className="text-lg font-semibold tabular-nums text-leaf-700">{formatFCFA(kpis.depensesPayees)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-ink-500">Avances à solder</p>
            <p className="text-lg font-semibold tabular-nums text-earth-600">{formatFCFA(kpis.depensesAvances)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-ink-500">Achats particuliers</p>
            <p className="text-lg font-semibold tabular-nums text-ink-800">{formatFCFA(kpis.achatsParticuliers)}</p>
            <p className="text-sm text-ink-500">{kpis.nbAchats} achat(s)</p>
          </div>
          <div>
            <p className="text-xs font-medium text-ink-500">Taux de paiement des salaires</p>
            <p className="text-lg font-semibold tabular-nums text-ink-800">{kpis.tauxPaiement}%</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
