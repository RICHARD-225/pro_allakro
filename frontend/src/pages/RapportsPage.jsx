import { useEffect, useMemo, useState } from 'react';
import {
  FileBarChart, FileSpreadsheet, Download, CalendarDays, MapPin, Layers, LayoutDashboard, Scale, Receipt,
  ShoppingBag, Wallet, HandCoins, HardHat, Trees, Package, ArrowLeftRight, History,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import BlocPicker from '@/components/BlocPicker';
import { Card, Button, Select } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { rapportsService, dashboardService, campementsService, blocsService } from '@/services';
import { formatPeriode } from '@/utils/format';
import { showServerErrors } from '@/utils/errors';
import { ROLE } from '@/constants';

// Feuilles du classeur, dans l'ordre où elles apparaissent dans le fichier
const FEUILLES = [
  { nom: 'Synthèse', description: 'Indicateurs clés, graphiques et sommaire cliquable', icon: LayoutDashboard },
  { nom: 'Bilan financier', description: 'Dépenses par catégorie et par campement, règlements, total des charges', icon: Scale },
  { nom: 'Dépenses', description: 'Toutes les dépenses (achats et salaires payés compris) avec catégorie, bloc et statut', icon: Receipt },
  { nom: 'Achats particuliers', description: 'Achats aux particuliers et règlement des vendeurs', icon: ShoppingBag },
  { nom: 'Rémunérations', description: 'Salaires des travaux et saisies manuelles : net dû, payé, reste et statut', icon: Wallet },
  { nom: 'Paiements', description: "Paiements et avances (n° de reçu), directs ou via le chef d'équipe", icon: HandCoins },
  { nom: 'Travaux', description: 'Activité, équipe ou responsable, dates, quantité, prix et statut', icon: HardHat },
  { nom: 'Exploitation', description: 'Chaque bloc : superficie, plantes, personnes affectées, travaux et dépenses', icon: Trees },
  { nom: 'Stock', description: 'État du stock du jour, valeur et alertes', icon: Package },
  { nom: 'Mouvements de stock', description: 'Entrées, sorties et ajustements', icon: ArrowLeftRight },
  { nom: 'Journal', description: 'Historique des actions des utilisateurs', icon: History, bigBoss: true },
];

export default function RapportsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [periodes, setPeriodes] = useState([]);
  const [periode, setPeriode] = useState('');
  const [perimetre, setPerimetre] = useState({ campement_id: '', bloc_id: '' });
  const [campements, setCampements] = useState([]);
  const [blocs, setBlocs] = useState([]);
  const [enCours, setEnCours] = useState(false);

  // La période est renseignée automatiquement : le mois le plus récent disposant de données
  useEffect(() => {
    Promise.all([dashboardService.get(), campementsService.getAll(), blocsService.getAll()])
      .then(([d, c, b]) => { setPeriodes(d.periodes); setPeriode(d.periode); setCampements(c); setBlocs(b); })
      .catch((err) => showServerErrors(err, { toast }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const feuilles = FEUILLES.filter((f) => !f.bigBoss || user?.role === ROLE.BIG_BOSS);

  const { libellePerimetre, nomFichier } = useMemo(() => {
    const bloc = blocs.find((b) => b.id === perimetre.bloc_id);
    const campement = campements.find((c) => c.id === (bloc?.campement_id || perimetre.campement_id));
    let libelle = "Toute l'exploitation";
    if (bloc) libelle = `Bloc ${bloc.code} — ${bloc.nom}${campement ? ` (${campement.nom})` : ''}`;
    else if (campement) libelle = campement.nom;
    const suffixe = bloc ? `_${bloc.code}` : (campement ? `_${campement.code}` : '');
    return { libellePerimetre: libelle, nomFichier: `ALLAKRO_Rapport_${periode || 'complet'}${suffixe}.xlsx` };
  }, [perimetre, blocs, campements, periode]);

  const telecharger = async () => {
    setEnCours(true);
    try {
      const fichier = await rapportsService.telecharger({ periode, ...perimetre });
      toast.success(`Rapport téléchargé : ${fichier}`);
    } catch (err) {
      showServerErrors(err, { toast });
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Rapports"
        subtitle="Un seul classeur Excel regroupant tous les rapports, une feuille par thème"
        icon={FileBarChart}
      />

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="flex items-start gap-4 lg:w-2/5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-forest-50">
              <FileSpreadsheet size={28} className="text-forest-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink-800">Rapport de gestion ALLAKRO</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-500">
                Toutes les données de la période dans un seul fichier Excel : synthèse avec graphiques, bilan financier
                et une feuille par thème, mises en page pour l'impression A4.
              </p>
            </div>
          </div>

          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select
                label="Période"
                value={periode}
                onChange={(e) => setPeriode(e.target.value)}
                options={periodes.map((p) => ({ value: p, label: formatPeriode(p) }))}
                placeholder="Toutes les périodes"
                hint="Renseignée automatiquement avec le mois le plus récent"
              />
              <div className="sm:col-span-2">
                <span className="mb-1.5 block text-sm font-medium text-ink-700">Périmètre</span>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <BlocPicker mode="filter" campements={campements} blocs={blocs} value={perimetre} onChange={setPerimetre} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cream-100 px-3 py-1 text-ink-600">
                <CalendarDays size={13} /> {periode ? formatPeriode(periode) : 'Toutes les périodes'}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cream-100 px-3 py-1 text-ink-600">
                <MapPin size={13} /> {libellePerimetre}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cream-100 px-3 py-1 text-ink-600">
                <Layers size={13} /> {feuilles.length} feuilles
              </span>
            </div>

            <div className="flex flex-col gap-2 border-t border-ink-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="truncate font-mono text-xs text-ink-500" title={nomFichier}>{nomFichier}</span>
              <Button size="lg" onClick={telecharger} loading={enCours} className="w-full sm:w-auto">
                {!enCours && <Download size={16} />}
                {enCours ? 'Préparation du rapport…' : 'Télécharger le rapport Excel'}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <section aria-labelledby="contenu-classeur" className="space-y-3">
        <h2 id="contenu-classeur" className="text-sm font-semibold text-ink-800">Contenu du classeur</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {feuilles.map((feuille, i) => {
            const Icon = feuille.icon;
            return (
              <Card key={feuille.nom} className="flex items-start gap-3 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cream-100">
                  <Icon size={18} className="text-forest-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-800">
                    <span className="mr-1.5 text-xs tabular-nums text-ink-500">{i + 1}.</span>{feuille.nom}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{feuille.description}</p>
                </div>
              </Card>
            );
          })}
        </div>
        <p className="text-xs text-ink-500">
          Le stock est présenté à la date du jour, pour toute l'exploitation. Les autres feuilles suivent la période et le
          périmètre choisis.
        </p>
      </section>
    </div>
  );
}
