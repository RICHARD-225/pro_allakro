import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Sprout, TreePine, MapPin, Plus, Pencil, UserCircle } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import PlantationModal from '@/components/exploitation/PlantationModal';
import CampementModal from '@/components/exploitation/CampementModal';
import { Card, Badge, Button, KpiGrid, ErrorState, Skeleton } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { plantationsService, campementsService } from '@/services';
import { formatNumber, formatDate } from '@/utils/format';
import { ROLE } from '@/constants';

const TH = 'px-4 py-2.5 text-left text-xs font-medium text-ink-500';
const TD = 'px-4 py-3 text-sm text-ink-700';

/** Fiche d'une plantation : ses informations et ses campements avec leurs responsables. */
export default function PlantationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isBoss = user?.role === ROLE.BIG_BOSS;
  const [plantation, setPlantation] = useState(null);
  const [campements, setCampements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fenetre, setFenetre] = useState(null); // 'plantation' | 'campement' | { campement }

  const charger = () => Promise.all([plantationsService.getById(id), campementsService.getAll({ plantation_id: id })])
    .then(([p, c]) => { setPlantation(p); setCampements(c); })
    .catch(() => setPlantation(null))
    .finally(() => setLoading(false));

  useEffect(() => { charger(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-32 w-full" /></div>;
  if (!plantation) return <ErrorState message="Plantation introuvable" onRetry={() => navigate('/exploitation?onglet=plantations')} />;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/exploitation?onglet=plantations" className="rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-50" aria-label="Retour">
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <PageHeader
            title={`${plantation.code} — ${plantation.nom}`}
            subtitle={plantation.localisation || undefined}
            icon={Sprout}
            actions={isBoss ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setFenetre('campement')}><Plus size={16} /> Nouveau campement</Button>
                <Button size="sm" variant="outline" onClick={() => setFenetre('plantation')}><Pencil size={15} /> Modifier</Button>
              </>
            ) : undefined}
          />
        </div>
      </div>

      <KpiGrid items={[
        { label: 'Superficie', value: formatNumber(plantation.superficie), unit: 'ha', icon: MapPin, accent: 'forest' },
        { label: 'Campements', value: campements.length, icon: TreePine, accent: 'sage' },
        { label: 'Statut', value: plantation.actif ? 'Active' : 'Inactive', icon: Sprout, accent: 'leaf' },
        { label: 'Créée le', value: formatDate(plantation.created_at), icon: UserCircle, accent: 'olive' },
      ]} />

      <Card className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-ink-100 bg-cream-50/50">
            <tr><th className={TH}>Campement</th><th className={TH}>Responsable</th><th className={TH}>Superficie</th><th className={TH}>Blocs</th><th className={TH}>Statut</th></tr>
          </thead>
          <tbody className="divide-y divide-ink-100/60">
            {campements.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-ink-500">Aucun campement dans cette plantation.</td></tr>
            ) : campements.map((c) => (
              <tr key={c.id} className="table-row-hover cursor-pointer" onClick={() => navigate(`/campements/${c.id}`)}>
                <td className={TD}><span className="font-medium text-ink-800">{c.nom}</span><span className="block text-xs tabular-nums text-forest-700">{c.code}</span></td>
                <td className={TD}>{c.responsable_nom || '—'}</td>
                <td className={`${TD} tabular-nums`}>{formatNumber(c.superficie)} ha</td>
                <td className={`${TD} tabular-nums`}>{c.nb_blocs}</td>
                <td className={TD}><Badge status={c.actif ? 'active' : 'inactive'}>{c.actif ? 'Actif' : 'Inactif'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {isBoss && (
        <>
          <PlantationModal open={fenetre === 'plantation'} onClose={() => setFenetre(null)} plantation={plantation} onEnregistre={() => charger()} />
          <CampementModal open={fenetre === 'campement'} onClose={() => setFenetre(null)} campement={null} plantations={[plantation]}
            plantationIdDefaut={plantation.id} onEnregistre={() => charger()} />
        </>
      )}
    </div>
  );
}
