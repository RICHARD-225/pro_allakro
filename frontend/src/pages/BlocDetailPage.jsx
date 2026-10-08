import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Leaf, MapPin, Calendar, HardHat, Wallet, Package, Users, BarChart3 } from 'lucide-react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import PageHeader from '@/components/PageHeader';
import { Card, Badge, ErrorState, Skeleton } from '@/components/ui';
import { blocsService, travauxService, depensesService, equipesService } from '@/services';
import { formatFCFA, formatDate, formatPeriode } from '@/utils/format';
import { CHART_COLORS, STATUT_TRAVAIL_LABELS } from '@/constants';

const TABS = [
  { key: 'info', label: 'Informations', icon: MapPin },
  { key: 'travaux', label: 'Travaux', icon: HardHat },
  { key: 'depenses', label: 'Dépenses', icon: Wallet },
  { key: 'equipes', label: 'Équipes', icon: Users },
  { key: 'stats', label: 'Statistiques', icon: BarChart3 },
];

export default function BlocDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('info');
  const [bloc, setBloc] = useState(null);
  const [campement, setCampement] = useState(null);
  const [travaux, setTravaux] = useState([]);
  const [depenses, setDepenses] = useState([]);
  const [equipes, setEquipes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Données filtrées par le serveur sur ce bloc
    Promise.all([
      blocsService.getById(id),
      travauxService.getByBloc(id),
      depensesService.getAll({ bloc_id: id }),
      equipesService.getAll(),
    ]).then(([b, t, d, e]) => {
      setBloc(b);
      setCampement({ id: b.campement_id, nom: b.campement_nom });
      setTravaux(t);
      setDepenses(d);
      // Équipe affectée au bloc + équipes y ayant réalisé des travaux
      const equipeIds = new Set(t.map((x) => x.equipe_id));
      setEquipes(e.filter((x) => x.bloc_id === id || equipeIds.has(x.id)));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!bloc) return <ErrorState message="Bloc introuvable" onRetry={() => navigate('/blocs')} />;

  const totalDepenses = depenses.reduce((s, d) => s + d.montant_total, 0);
  const totalTravaux = travaux.reduce((s, t) => s + t.montant_total, 0);
  const quantiteTotale = travaux.reduce((s, t) => s + t.quantite, 0);

  const travauxChartData = travaux.map((t) => ({ name: t.type_travail_libelle, value: t.quantite }));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/blocs" className="p-2 rounded-lg text-ink-500 hover:bg-ink-50 transition-colors" aria-label="Retour">
          <ArrowLeft size={18} />
        </Link>
        <PageHeader title={`${bloc.code} — ${bloc.nom}`} subtitle={campement?.nom} icon={Leaf} />
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-ink-500 uppercase">Superficie</p>
          <p className="mt-1 text-xl font-bold text-ink-800 tabular-nums">{bloc.superficie} ha</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-500 uppercase">Travaux</p>
          <p className="mt-1 text-xl font-bold text-ink-800">{travaux.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-500 uppercase">Dépenses</p>
          <p className="mt-1 text-xl font-bold text-ink-800">{formatFCFA(totalDepenses)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-500 uppercase">Quantité réalisée</p>
          <p className="mt-1 text-xl font-bold text-ink-800 tabular-nums">{quantiteTotale} ha</p>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-ink-100 overflow-x-auto scrollbar-none">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-forest-600 text-forest-700'
                  : 'border-transparent text-ink-400 hover:text-ink-600'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'info' && (
        <Card className="p-5 space-y-4 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-ink-400 uppercase">Code</p>
              <p className="text-sm font-medium text-ink-800 font-mono">{bloc.code}</p>
            </div>
            <div>
              <p className="text-xs text-ink-400 uppercase">Nom</p>
              <p className="text-sm font-medium text-ink-800">{bloc.nom}</p>
            </div>
            <div>
              <p className="text-xs text-ink-400 uppercase">Campement</p>
              <p className="text-sm font-medium text-ink-800">{campement?.nom || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-ink-400 uppercase">Superficie</p>
              <p className="text-sm font-medium text-ink-800 tabular-nums">{bloc.superficie} ha</p>
            </div>
            <div>
              <p className="text-xs text-ink-400 uppercase">Statut</p>
              <Badge status={bloc.actif ? 'active' : 'inactive'}>{bloc.actif ? 'Actif' : 'Inactif'}</Badge>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'travaux' && (
        <Card className="overflow-hidden animate-fade-in">
          <table className="w-full">
            <thead className="bg-cream-50/50 border-b border-ink-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-500 uppercase">Période</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-500 uppercase">Quantité</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-500 uppercase">Montant</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-500 uppercase">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100/60">
              {travaux.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-ink-400">Aucun travail enregistré</td></tr>
              ) : travaux.map((t) => (
                <tr key={t.id} className="table-row-hover">
                  <td className="px-4 py-3 text-sm text-ink-700">{t.type_travail_libelle}</td>
                  <td className="px-4 py-3 text-sm text-ink-600">{formatPeriode(t.periode)}</td>
                  <td className="px-4 py-3 text-sm text-ink-700 tabular-nums">{t.quantite} {t.unite}</td>
                  <td className="px-4 py-3 text-sm text-ink-700 tabular-nums">{formatFCFA(t.montant_total)}</td>
                  <td className="px-4 py-3"><Badge status={t.statut}>{STATUT_TRAVAIL_LABELS[t.statut] || t.statut}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {activeTab === 'depenses' && (
        <Card className="overflow-hidden animate-fade-in">
          <table className="w-full">
            <thead className="bg-cream-50/50 border-b border-ink-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-500 uppercase">Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-500 uppercase">Catégorie</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ink-500 uppercase">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100/60">
              {depenses.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-ink-400">Aucune dépense enregistrée</td></tr>
              ) : depenses.map((d) => (
                <tr key={d.id} className="table-row-hover">
                  <td className="px-4 py-3 text-sm text-ink-700">{d.designation}</td>
                  <td className="px-4 py-3 text-sm text-ink-600">{d.categorie}</td>
                  <td className="px-4 py-3 text-sm text-ink-600">{formatDate(d.date)}</td>
                  <td className="px-4 py-3 text-sm text-ink-700 tabular-nums">{formatFCFA(d.montant_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {activeTab === 'equipes' && (
        <Card className="p-5 animate-fade-in">
          {equipes.length === 0 ? (
            <p className="text-sm text-ink-400 text-center py-8">Aucune équipe affectée ou ayant travaillé sur ce bloc</p>
          ) : (
            <div className="space-y-2">
              {equipes.map((e) => (
                <div key={e.id} className="flex items-center justify-between p-3 rounded-lg bg-cream-50/50 border border-ink-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-sage-50 flex items-center justify-center">
                      <Users size={16} className="text-sage-700" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink-800">{e.nom}</p>
                      <p className="text-xs text-ink-400">{e.code} · {e.nb_membres} membre(s){e.bloc_id === bloc.id ? ' · affectée à ce bloc' : ''}</p>
                    </div>
                  </div>
                  <Badge status={e.actif ? 'active' : 'inactive'}>{e.actif ? 'Actif' : 'Inactif'}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeTab === 'stats' && (
        <Card className="p-5 animate-fade-in">
          <h3 className="text-sm font-semibold text-ink-800 mb-4">Travaux par type (ha)</h3>
          {travauxChartData.length === 0 ? (
            <p className="text-sm text-ink-400 text-center py-8">Aucune donnée disponible</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={travauxChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e9e7" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#888f88' }} axisLine={false} tickLine={false} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11, fill: '#888f88' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e7e9e7', borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {travauxChartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      )}
    </div>
  );
}
