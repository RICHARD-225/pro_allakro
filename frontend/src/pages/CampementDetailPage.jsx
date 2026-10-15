import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, TreePine, Leaf, Users, Info as InfoIcon, MapPin, Plus, Pencil, UserCircle } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import BlocModal from '@/components/exploitation/BlocModal';
import CampementModal from '@/components/exploitation/CampementModal';
import { Card, Badge, Button, KpiGrid, ErrorState, Skeleton } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { campementsService, blocsService, personnesService, plantationsService } from '@/services';
import { formatNumber, formatDate } from '@/utils/format';
import { ROLE } from '@/constants';

const TABS = [
  { key: 'blocs', label: 'Blocs', icon: Leaf },
  { key: 'personnes', label: 'Personnes', icon: Users },
  { key: 'info', label: 'Informations', icon: InfoIcon },
];
const TH = 'px-4 py-2.5 text-left text-xs font-medium text-ink-500';
const TD = 'px-4 py-3 text-sm text-ink-700';

function Info({ label, children }) {
  return (
    <div>
      <p className="text-xs text-ink-500">{label}</p>
      <div className="mt-0.5 text-sm font-medium text-ink-800">{children}</div>
    </div>
  );
}

/** Fiche d'un campement : son responsable, ses blocs et les personnes enregistrées à ce niveau. */
export default function CampementDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isBoss = user?.role === ROLE.BIG_BOSS;
  const [campement, setCampement] = useState(null);
  const [blocs, setBlocs] = useState([]);
  const [personnes, setPersonnes] = useState([]);
  const [plantations, setPlantations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [onglet, setOnglet] = useState('blocs');
  const [fenetre, setFenetre] = useState(null); // 'campement' | 'bloc' | { bloc }

  const charger = () => Promise.all([
    campementsService.getById(id), blocsService.getAll({ campement_id: id }), personnesService.getAll({ campement_id: id }),
  ]).then(([c, b, p]) => { setCampement(c); setBlocs(b); setPersonnes(p); })
    .catch(() => setCampement(null))
    .finally(() => setLoading(false));

  useEffect(() => {
    charger();
    plantationsService.getAll().then(setPlantations).catch(() => setPlantations([]));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-32 w-full" /></div>;
  if (!campement) return <ErrorState message="Campement introuvable" onRetry={() => navigate('/exploitation?onglet=campements')} />;

  const actives = personnes.filter((p) => p.actif).length;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/exploitation?onglet=campements" className="rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-50" aria-label="Retour">
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <PageHeader
            title={`${campement.code} — ${campement.nom}`}
            subtitle={`${campement.plantation_nom} · Responsable : ${campement.responsable_nom || 'non renseigné'}`}
            icon={TreePine}
            actions={(
              <>
                <Button size="sm" variant="outline" onClick={() => setFenetre('bloc')}><Plus size={16} /> Nouveau bloc</Button>
                {isBoss && <Button size="sm" variant="outline" onClick={() => setFenetre('campement')}><Pencil size={15} /> Modifier</Button>}
              </>
            )}
          />
        </div>
      </div>

      <KpiGrid items={[
        { label: 'Superficie', value: formatNumber(campement.superficie), unit: 'ha', icon: MapPin, accent: 'forest' },
        { label: 'Blocs', value: blocs.length, icon: Leaf, accent: 'leaf' },
        { label: 'Personnes', value: actives, icon: Users, accent: 'sage' },
        { label: 'Responsable', value: campement.responsable_nom || '—', icon: UserCircle, accent: 'olive' },
      ]} />

      <div className="flex gap-1 overflow-x-auto border-b border-ink-100 scrollbar-none" role="tablist">
        {TABS.map(({ key, label, icon: Icone }) => (
          <button key={key} type="button" role="tab" aria-selected={onglet === key} onClick={() => setOnglet(key)}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              onglet === key ? 'border-forest-600 text-forest-700' : 'border-transparent text-ink-500 hover:text-ink-800'}`}>
            <Icone size={16} />{label}
          </button>
        ))}
      </div>

      {onglet === 'blocs' && (
        <Card className="animate-fade-in overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-ink-100 bg-cream-50/50">
              <tr><th className={TH}>Bloc</th><th className={TH}>Plantes</th><th className={TH}>Superficie</th><th className={TH}>Statut</th><th className={TH} /></tr>
            </thead>
            <tbody className="divide-y divide-ink-100/60">
              {blocs.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-ink-500">Aucun bloc dans ce campement : créez-en un avec « Nouveau bloc ».</td></tr>
              ) : blocs.map((b) => (
                <tr key={b.id} className="table-row-hover cursor-pointer" onClick={() => navigate(`/blocs/${b.id}`)}>
                  <td className={TD}><span className="font-medium text-ink-800">{b.nom}</span><span className="block text-xs tabular-nums text-forest-700">{b.code}</span></td>
                  <td className={`${TD} tabular-nums`}>{formatNumber(b.nombre_plantes)}</td>
                  <td className={`${TD} tabular-nums`}>{formatNumber(b.superficie)} ha</td>
                  <td className={TD}><Badge status={b.actif ? 'active' : 'inactive'}>{b.actif ? 'Actif' : 'Inactif'}</Badge></td>
                  <td className={`${TD} text-right`}>
                    <button type="button" aria-label={`Modifier ${b.nom}`} onClick={(e) => { e.stopPropagation(); setFenetre({ bloc: b }); }}
                      className="rounded-lg p-2 text-ink-500 hover:bg-ink-50"><Pencil size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {onglet === 'personnes' && (
        <Card className="animate-fade-in overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-ink-100 bg-cream-50/50">
              <tr><th className={TH}>Matricule</th><th className={TH}>Nom</th><th className={TH}>Fonction</th><th className={TH}>Téléphone</th><th className={TH}>Statut</th></tr>
            </thead>
            <tbody className="divide-y divide-ink-100/60">
              {personnes.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-ink-500">Aucune personne enregistrée dans ce campement</td></tr>
              ) : personnes.map((p) => (
                <tr key={p.id}>
                  <td className={TD}><span className="text-xs tabular-nums text-forest-700">{p.matricule}</span></td>
                  <td className={TD}><span className="font-medium text-ink-800">{p.prenom} {p.nom}</span></td>
                  <td className={TD}>{p.fonction_libelle || '—'}</td>
                  <td className={`${TD} tabular-nums`}>{p.telephone || '—'}</td>
                  <td className={TD}><Badge status={p.actif ? 'active' : 'inactive'}>{p.actif ? 'Active' : 'Inactive'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {onglet === 'info' && (
        <Card className="animate-fade-in p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Code"><span className="tabular-nums">{campement.code}</span></Info>
            <Info label="Nom">{campement.nom}</Info>
            <Info label="Plantation"><Link to={`/plantations/${campement.plantation_id}`} className="text-forest-700 hover:underline">{campement.plantation_nom}</Link></Info>
            <Info label="Responsable">{campement.responsable_nom || '—'}</Info>
            <Info label="Superficie"><span className="tabular-nums">{formatNumber(campement.superficie)} ha</span></Info>
            <Info label="Statut"><Badge status={campement.actif ? 'active' : 'inactive'}>{campement.actif ? 'Actif' : 'Inactif'}</Badge></Info>
            <Info label="Créé le"><span className="tabular-nums">{formatDate(campement.created_at)}</span></Info>
          </div>
          {campement.description && <p className="mt-4 whitespace-pre-line text-sm text-ink-600">{campement.description}</p>}
        </Card>
      )}

      <BlocModal open={fenetre === 'bloc' || !!fenetre?.bloc} onClose={() => setFenetre(null)} bloc={fenetre?.bloc || null}
        campements={[campement]} campementIdDefaut={campement.id} onEnregistre={() => charger()} />
      {isBoss && (
        <CampementModal open={fenetre === 'campement'} onClose={() => setFenetre(null)} campement={campement} plantations={plantations}
          onEnregistre={() => charger()} />
      )}
    </div>
  );
}
