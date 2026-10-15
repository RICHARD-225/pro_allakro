import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Leaf, MapPin, HardHat, Wallet, Users, BarChart3, Sprout } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import PersonneDetail from '@/components/PersonneDetail';
import TravailDetail from '@/components/TravailDetail';
import { Card, Badge, BarresHorizontales, ErrorState, KpiGrid, Skeleton } from '@/components/ui';
import { blocsService, travauxService, depensesService, personnesService } from '@/services';
import { formatFCFA, formatDate, formatNumber } from '@/utils/format';
import { STATUT_TRAVAIL_LABELS } from '@/constants';

const TABS = [
  { key: 'info', label: 'Informations', icon: MapPin },
  { key: 'personnes', label: 'Personnes', icon: Users },
  { key: 'travaux', label: 'Travaux', icon: HardHat },
  { key: 'depenses', label: 'Dépenses', icon: Wallet },
  { key: 'stats', label: 'Statistiques', icon: BarChart3 },
];

// En-têtes en casse normale. Un code ou un nom a son style dans un <span> : sur la cellule, sa couleur se heurterait à celle de TD.
const TH = 'px-4 py-3 text-left text-xs font-medium text-ink-500 whitespace-nowrap';
const TD = 'px-4 py-3 text-sm text-ink-700';

function Info({ label, children }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <div className="text-sm font-medium text-ink-800">{children}</div>
    </div>
  );
}

export default function BlocDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('info');
  const [bloc, setBloc] = useState(null);
  const [travaux, setTravaux] = useState([]);
  const [depenses, setDepenses] = useState([]);
  const [personnes, setPersonnes] = useState([]);
  const [personneOuverte, setPersonneOuverte] = useState(null);
  const [travailOuvert, setTravailOuvert] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Données filtrées par le serveur sur ce bloc
    // Les personnes sont enregistrées au niveau du campement : celles du campement du bloc travaillent sur tous ses blocs
    blocsService.getById(id).then((b) => Promise.all([
      Promise.resolve(b),
      travauxService.getByBloc(id),
      depensesService.getAll({ bloc_id: id }),
      personnesService.getAll({ campement_id: b.campement_id }),
    ])).then(([b, t, d, p]) => {
      setBloc(b);
      setTravaux(t);
      setDepenses(d);
      setPersonnes(p);
    }).catch(() => setBloc(null))
      .finally(() => setLoading(false));
  }, [id]);

  // Montant des travaux par activité (les unités diffèrent d'une activité à l'autre)
  const parActivite = useMemo(() => {
    const totaux = new Map();
    travaux.filter((t) => t.statut !== 'ANNULE').forEach((t) => totaux.set(t.activite, (totaux.get(t.activite) || 0) + t.montant_total));
    return [...totaux.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [travaux]);

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
  const actives = personnes.filter((p) => p.actif).length;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/blocs" className="p-2 rounded-lg text-ink-500 hover:bg-ink-50 transition-colors" aria-label="Retour">
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <PageHeader title={`${bloc.code} — ${bloc.nom}`} subtitle={[bloc.plantation_nom, bloc.campement_nom].filter(Boolean).join(' · ')} icon={Leaf} />
        </div>
      </div>

      <KpiGrid items={[
        { label: 'Superficie', value: formatNumber(bloc.superficie), unit: 'ha', icon: MapPin, accent: 'forest' },
        { label: 'Plantes', value: formatNumber(bloc.nombre_plantes), icon: Sprout, accent: 'leaf' },
        { label: 'Personnes', value: actives, icon: Users, accent: 'sage' },
        { label: 'Travaux', value: travaux.length, icon: HardHat, accent: 'olive' },
        { label: 'Dépenses', value: formatNumber(totalDepenses), unit: 'FCFA', icon: Wallet, accent: 'earth' },
      ]} />

      <div className="flex gap-1 border-b border-ink-100 overflow-x-auto scrollbar-none" role="tablist">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key ? 'border-forest-600 text-forest-700' : 'border-transparent text-ink-500 hover:text-ink-800'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'info' && (
        <Card className="p-5 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Info label="Code"><span className="tabular-nums">{bloc.code}</span></Info>
            <Info label="Nom">{bloc.nom}</Info>
            <Info label="Plantation · campement">{[bloc.plantation_nom, bloc.campement_nom].filter(Boolean).join(' · ') || '—'}</Info>
            <Info label="Superficie"><span className="tabular-nums">{formatNumber(bloc.superficie)} ha</span></Info>
            <Info label="Nombre de plantes">
              <span className="tabular-nums">{formatNumber(bloc.nombre_plantes)}</span>
              {Number(bloc.superficie) > 0 && (
                <span className="ml-1 text-xs font-normal text-ink-500">
                  (≈ {formatNumber(Math.round(bloc.nombre_plantes / bloc.superficie))} / ha)
                </span>
              )}
            </Info>
            <Info label="Statut"><Badge status={bloc.actif ? 'active' : 'inactive'}>{bloc.actif ? 'Actif' : 'Inactif'}</Badge></Info>
          </div>
        </Card>
      )}

      {activeTab === 'personnes' && (
        <Card className="overflow-x-auto animate-fade-in">
          <table className="w-full">
            <thead className="bg-cream-50/50 border-b border-ink-100">
              <tr>
                <th className={TH}>Matricule</th>
                <th className={TH}>Nom</th>
                <th className={TH}>Fonction</th>
                <th className={TH}>Téléphone</th>
                <th className={TH}>Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100/60">
              {personnes.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-ink-500">Aucune personne enregistrée dans ce campement</td></tr>
              ) : personnes.map((p) => (
                <tr key={p.id} className="table-row-hover cursor-pointer" onClick={() => setPersonneOuverte(p)}>
                  <td className={TD}><span className="text-xs tabular-nums text-forest-700">{p.matricule}</span></td>
                  <td className={TD}><span className="font-medium text-ink-800">{p.prenom} {p.nom}</span></td>
                  <td className={TD}>{p.fonction_libelle || '—'}</td>
                  <td className={`${TD} tabular-nums`}>{p.telephone || '—'}</td>
                  <td className="px-4 py-3"><Badge status={p.actif ? 'active' : 'inactive'}>{p.actif ? 'Active' : 'Inactive'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {activeTab === 'travaux' && (
        <Card className="overflow-x-auto animate-fade-in">
          <table className="w-full">
            <thead className="bg-cream-50/50 border-b border-ink-100">
              <tr>
                <th className={TH}>Activité</th>
                <th className={TH}>Équipe / responsable</th>
                <th className={TH}>Dates</th>
                <th className={TH}>Quantité</th>
                <th className={TH}>Montant</th>
                <th className={TH}>Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100/60">
              {travaux.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-500">Aucun travail enregistré</td></tr>
              ) : travaux.map((t) => (
                <tr key={t.id} className="table-row-hover cursor-pointer" onClick={() => setTravailOuvert(t)}>
                  <td className={TD}><span className="font-medium text-ink-800">{t.activite}</span></td>
                  <td className={TD}>
                    {t.equipe_nom ? (
                      <>{t.equipe_nom}<span className="block text-xs text-ink-500">Chef : {t.responsable_nom}</span></>
                    ) : (t.responsable_nom || '—')}
                  </td>
                  <td className={`${TD} whitespace-nowrap text-xs tabular-nums`}>{formatDate(t.date_travail)} → {formatDate(t.date_fin)}</td>
                  <td className={`${TD} tabular-nums whitespace-nowrap`}>{formatNumber(t.quantite)} {t.unite}</td>
                  <td className={`${TD} tabular-nums whitespace-nowrap`}>{formatFCFA(t.montant_total)}</td>
                  <td className="px-4 py-3"><Badge status={t.statut}>{STATUT_TRAVAIL_LABELS[t.statut] || t.statut}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {activeTab === 'depenses' && (
        <Card className="overflow-x-auto animate-fade-in">
          <table className="w-full">
            <thead className="bg-cream-50/50 border-b border-ink-100">
              <tr>
                <th className={TH}>Description</th>
                <th className={TH}>Catégorie</th>
                <th className={TH}>Date</th>
                <th className={TH}>Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100/60">
              {depenses.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-ink-500">Aucune dépense enregistrée</td></tr>
              ) : depenses.map((d) => (
                <tr key={d.id} className="table-row-hover">
                  <td className={TD}>{d.designation}</td>
                  <td className={`${TD} text-ink-600`}>{d.categorie}</td>
                  <td className={`${TD} text-ink-600 whitespace-nowrap tabular-nums`}>{formatDate(d.date)}</td>
                  <td className={`${TD} tabular-nums whitespace-nowrap`}>{formatFCFA(d.montant_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {activeTab === 'stats' && (
        <Card className="p-5 animate-fade-in">
          <h3 className="text-sm font-semibold text-ink-800 mb-4">Montant des travaux par activité (FCFA, hors annulés)</h3>
          {parActivite.length === 0 ? (
            <p className="text-sm text-ink-500 text-center py-8">Aucune donnée disponible</p>
          ) : (
            <BarresHorizontales data={parActivite} series={[{ cle: 'value', nom: 'Montant', couleur: '#519744' }]} />
          )}
        </Card>
      )}

      <PersonneDetail personne={personneOuverte} onClose={() => setPersonneOuverte(null)}
        onChange={(p) => { setPersonnes((d) => d.map((x) => (x.id === p.id ? p : x))); setPersonneOuverte(p); }} />
      <TravailDetail travail={travailOuvert} onClose={() => setTravailOuvert(null)}
        onChange={(t) => { setTravaux((d) => d.map((x) => (x.id === t.id ? t : x))); setTravailOuvert(t); }} />
    </div>
  );
}
