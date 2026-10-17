import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Wallet, Plus, HandCoins, CircleDollarSign, CheckCircle2, Hourglass, Eye, Printer, FileDown, Ban, RotateCcw } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import RowActions from '@/components/RowActions';
import BlocPicker from '@/components/BlocPicker';
import PaiementModal from '@/components/salaires/PaiementModal';
import NouveauPaiementModal from '@/components/salaires/NouveauPaiementModal';
import RemunerationModal from '@/components/salaires/RemunerationModal';
import SalaireDetail from '@/components/salaires/SalaireDetail';
import RecusModal from '@/components/salaires/RecusModal';
import ApercuRecuModal from '@/components/salaires/ApercuRecuModal';
import { imprimerRecu } from '@/components/salaires/RecuPaiement';
import { colonnesRemunerations, colonnesPaiements } from '@/pages/salaires/colonnes';
import { DataTable, Button, ErrorState, FiltrePeriode, KpiGrid, Select } from '@/components/ui';
import { PERIODE_VIDE, erreurPeriode, libellePlage, periodeActive, plagePeriode } from '@/components/ui/FiltrePeriode';
import { compterFiltres } from '@/components/ui/Filtres';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSuppression } from '@/hooks/useSuppression';
import { useListeServeur } from '@/hooks/useListeServeur';
import { salairesService, paiementsService, personnesService, campementsService, blocsService } from '@/services';
import { formatFCFA, formatNumber } from '@/utils/format';
import { showServerErrors } from '@/utils/errors';
import { ROLE, STATUT_SALAIRE_LABELS } from '@/constants';

const ONGLETS = [
  { id: 'remunerations', label: 'Rémunérations' },
  { id: 'paiements', label: 'Paiements effectués' },
];

export default function SalairesPage() {
  const { user } = useAuth();
  const isBoss = user?.role === ROLE.BIG_BOSS;
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [onglet, setOnglet] = useState(searchParams.get('onglet') === 'paiements' ? 'paiements' : 'remunerations');
  const [personnes, setPersonnes] = useState([]);
  const [campements, setCampements] = useState([]);
  const [blocs, setBlocs] = useState([]);
  const [error, setError] = useState(false);
  const [filtreStatut, setFiltreStatut] = useState('');
  const [periode, setPeriode] = useState(PERIODE_VIDE);
  const [filtreBloc, setFiltreBloc] = useState({ campement_id: '', bloc_id: '' });
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);       // rémunération complète affichée dans la fiche
  const [aPayer, setAPayer] = useState(null); // { salaire, paiement? }
  const [nouveauPaiement, setNouveauPaiement] = useState(false);
  const [remuneration, setRemuneration] = useState(false); // fenêtre « Nouvelle rémunération »
  const [recus, setRecus] = useState(null);
  const [apercu, setApercu] = useState(null);

  // Deux listes paginées par le serveur. La période filtre côté serveur : rémunérations sur leur date de début, paiements sur leur
  // date de paiement. Les indicateurs (dû, payé, reste…) portent sur TOUTES les lignes filtrées, pas seulement sur la page affichée.
  const plage = plagePeriode(periode);
  const periodeInvalide = Boolean(erreurPeriode(periode));
  const filtresLieu = { campement_id: filtreBloc.campement_id, bloc_id: filtreBloc.bloc_id, ...plage };
  const rem = useListeServeur({
    charger: (p) => salairesService.page(p),
    totaux: (p) => salairesService.totaux(p),
    // Sans filtre de statut, les rémunérations entièrement payées sont masquées : elles sont dans « Paiements effectués »
    filtres: { statut: filtreStatut, masquer_soldees: filtreStatut ? '' : 'true', ...filtresLieu },
    actif: !periodeInvalide,
  });
  const pai = useListeServeur({
    charger: (p) => paiementsService.page(p),
    totaux: (p) => paiementsService.totaux(p),
    filtres: filtresLieu,
    actif: !periodeInvalide && onglet === 'paiements',
  });
  useEffect(() => { if (rem.erreur || pai.erreur) setError(true); }, [rem.erreur, pai.erreur]);

  const [versionDetail, setVersionDetail] = useState(0);
  const { recharger: rechargerRem } = rem;
  const { recharger: rechargerPai } = pai;
  const recharger = useCallback(() => {
    rechargerRem();
    rechargerPai();
    setVersionDetail((v) => v + 1);
    return Promise.resolve();
  }, [rechargerRem, rechargerPai]);

  useEffect(() => {
    Promise.all([personnesService.getAll(), campementsService.getAll(), blocsService.getAll()])
      .then(([pers, camps, bl]) => {
        setPersonnes(pers);
        setCampements(camps);
        setBlocs(bl);
      })
      .catch(() => setError(true));
  }, []);

  // Fiche d'une rémunération : chargée à l'ouverture et rechargée après chaque paiement, annulation…
  useEffect(() => {
    if (!detailId) { setDetail(null); return undefined; }
    let actif = true;
    salairesService.getById(detailId).then((s) => { if (actif) setDetail(s); }).catch(() => { if (actif) setDetailId(null); });
    return () => { actif = false; };
  }, [detailId, versionDetail]);

  // Liens depuis un travail : /salaires?voir=<id de la rémunération> (fiche) ou ?payer=<id> (paiement direct)
  useEffect(() => {
    const voir = searchParams.get('voir');
    const payer = searchParams.get('payer');
    if (!voir && !payer) return;
    searchParams.delete('voir');
    searchParams.delete('payer');
    setSearchParams(searchParams, { replace: true });
    salairesService.getById(voir || payer).then((cible) => {
      if (payer && cible.reste > 0 && cible.statut !== 'ANNULEE') setAPayer({ salaire: cible });
      else setDetailId(cible.id);
    }).catch(() => toast.error('Rémunération introuvable.'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const kpi = rem.totaux || { du: 0, paye: 0, reste: 0, a_payer: 0 };

  const apresPaiement = async (enregistres, edition = false) => {
    setAPayer(null);
    setNouveauPaiement(false);
    await recharger();
    if (!edition) setRecus(Array.isArray(enregistres) ? enregistres : [enregistres]);
  };

  // Aperçu du reçu : le paiement complet (situation après paiement) est lu sur le serveur
  const ouvrirApercu = async (resume) => {
    try {
      setApercu(await paiementsService.getById(resume.id));
    } catch (err) {
      showServerErrors(err, { toast });
    }
  };

  const telechargerRecu = async (paiement) => {
    try {
      await paiementsService.telechargerRecu(paiement.id);
    } catch (err) {
      showServerErrors(err, { toast });
    }
  };

  const imprimer = async (resume) => {
    try {
      imprimerRecu(await paiementsService.getById(resume.id));
    } catch (err) {
      showServerErrors(err, { toast });
    }
  };

  // Paiement complet (référence, observation) et sa rémunération pour la correction
  const modifierPaiement = async (resume) => {
    try {
      const complet = await paiementsService.getById(resume.id);
      const salaire = detail && detail.id === complet.salaire_id ? detail : await salairesService.getById(complet.salaire_id);
      setAPayer({ salaire, paiement: complet });
    } catch (err) {
      showServerErrors(err, { toast });
    }
  };

  const { demander: supprimerPaiement, dialogue: dialoguePaiement } = useSuppression({
    supprimer: (p) => paiementsService.remove(p.id),
    apres: () => recharger(),
    message: (p) => `Supprimer le paiement ${p.numero} de ${formatFCFA(p.montant)} à ${p.beneficiaire_nom} ? `
      + 'Sa dépense est supprimée et le reste à payer augmente d\'autant.',
    succes: (p) => `Paiement ${p.numero} supprimé`,
  });

  const { demander: annulerPaiement, dialogue: dialogueAnnulationPaiement } = useSuppression({
    supprimer: (p) => paiementsService.annuler(p.id),
    apres: () => { setApercu(null); recharger(); },
    titre: 'Annuler le paiement',
    libelleBouton: 'Annuler le paiement',
    message: (p) => `Annuler le paiement ${p.numero} de ${formatFCFA(p.montant)} à ${p.beneficiaire_nom} ? `
      + "Il reste dans l'historique, marqué « annulé » (son reçu aussi). Sa dépense est supprimée "
      + `et le reste à payer de la rémunération augmente de ${formatFCFA(p.montant)}.`,
    succes: (p) => `Paiement ${p.numero} annulé`,
  });

  // Un paiement annulé reprend effet (payé, reste, dépense) : refusé si la rémunération est annulée ou si le reste ne suffit plus
  const reactiverPaiement = async (p) => {
    try {
      await paiementsService.reactiver(p.id);
      setApercu(null);
      await recharger();
      toast.success(`Paiement ${p.numero} réactivé`);
    } catch (err) {
      showServerErrors(err, { toast });
    }
  };

  const { demander: supprimerRemuneration, dialogue: dialogueRemuneration } = useSuppression({
    supprimer: (s) => salairesService.remove(s.id),
    apres: () => recharger(),
    message: (s) => `Supprimer la rémunération « ${s.libelle} » de ${s.personne_nom} ?`,
    succes: () => 'Rémunération supprimée',
  });

  const { demander: annulerRemuneration, dialogue: dialogueAnnulation } = useSuppression({
    supprimer: async (s) => { await salairesService.annuler(s.id); recharger(); },
    titre: 'Annuler la rémunération',
    libelleBouton: 'Annuler la rémunération',
    message: (s) => `Annuler « ${s.libelle} » (${formatFCFA(s.montant_du)}) ? Elle ne sera plus comptée dans le reste à payer.`,
    succes: () => 'Rémunération annulée',
  });

  const retablirRemuneration = async (s) => {
    try {
      await salairesService.retablir(s.id);
      recharger();
      toast.success('Rémunération rétablie');
    } catch (err) {
      showServerErrors(err, { toast });
    }
  };

  const ActionsRemuneration = ({ row }) => {
    const manuelle = row.origine === 'MANUELLE';
    return (
      <RowActions
        onView={() => setDetailId(row.id)}
        menu={[
          manuelle && row.statut === 'ANNULEE' && { label: 'Rétablir la rémunération', icon: RotateCcw, onClick: () => retablirRemuneration(row) },
          row.peut_annuler && { label: 'Annuler la rémunération', icon: Ban, onClick: () => annulerRemuneration(row) },
        ]}
        onDelete={isBoss && manuelle ? () => supprimerRemuneration(row) : undefined}
        deleteDisabled={row.paiements.length > 0}
        deleteTitle="Déjà payée : elle ne peut plus être supprimée"
      >
        {row.reste > 0 && row.statut !== 'ANNULEE' && (
          <Button size="sm" className="mr-1" onClick={() => setAPayer({ salaire: row })}><HandCoins size={14} /> Payer</Button>
        )}
      </RowActions>
    );
  };

  const ActionsPaiement = ({ row }) => (
    <RowActions
      onEdit={row.annule ? undefined : () => modifierPaiement(row)}
      menu={[
        { label: 'Imprimer le reçu', icon: Printer, onClick: () => imprimer(row) },
        { label: 'Reçu PDF', icon: FileDown, onClick: () => telechargerRecu(row) },
        !row.annule && { label: 'Annuler le paiement', icon: Ban, onClick: () => annulerPaiement(row) },
        row.annule && { label: 'Réactiver le paiement', icon: RotateCcw, onClick: () => reactiverPaiement(row) },
      ]}
      onDelete={isBoss ? () => supprimerPaiement(row) : undefined}
    >
      <button type="button" onClick={() => ouvrirApercu(row)} title="Aperçu du reçu" aria-label={`Aperçu du reçu ${row.numero}`}
        className="rounded-lg p-2.5 text-ink-500 transition-colors hover:bg-forest-50 hover:text-forest-700 md:p-1.5"><Eye size={15} /></button>
    </RowActions>
  );

  // Filtres communs aux deux onglets (période, campement, bloc) + statut pour les rémunérations
  const filtresCommuns = (
    <>
      <FiltrePeriode value={periode} onChange={setPeriode} />
      <BlocPicker mode="filter" campements={campements} blocs={blocs} value={filtreBloc} onChange={setFiltreBloc} />
    </>
  );
  const filtresRemunerations = (
    <>
      <Select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)} className="w-full sm:w-40"
        options={Object.entries(STATUT_SALAIRE_LABELS).map(([value, label]) => ({ value, label }))} placeholder="Statut" emptyLabel="Tous les statuts" />
      {filtresCommuns}
    </>
  );
  const nbFiltresCommuns = compterFiltres(filtreBloc.campement_id, filtreBloc.bloc_id) + (periodeActive(periode) ? 1 : 0);
  const reinitialiser = () => {
    setFiltreStatut('');
    setPeriode(PERIODE_VIDE);
    setFiltreBloc({ campement_id: '', bloc_id: '' });
  };

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  const totauxPaiements = pai.totaux || { valides: 0, annules: 0, montant: 0 };
  const nbAnnules = totauxPaiements.annules;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Salaires"
        subtitle="Rémunérations, paiements et reçus"
        icon={Wallet}
        actions={(
          <>
            <Button size="sm" variant="outline" onClick={() => setRemuneration(true)}><Plus size={16} /> Nouvelle rémunération</Button>
            <Button size="sm" onClick={() => setNouveauPaiement(true)}><HandCoins size={16} /> Nouveau paiement</Button>
          </>
        )}
      />

      <KpiGrid items={[
        { label: 'Total dû (net)', value: formatNumber(kpi.du), unit: 'FCFA', icon: CircleDollarSign, accent: 'forest',
          hint: libellePlage(periode) || undefined },
        { label: 'Total payé', value: formatNumber(kpi.paye), unit: 'FCFA', icon: CheckCircle2, accent: 'leaf' },
        { label: 'Reste à payer', value: formatNumber(kpi.reste), unit: 'FCFA', icon: Hourglass, accent: 'earth',
          hint: `${kpi.a_payer} rémunération(s) à régler` },
      ]} />

      <div className="flex w-full rounded-lg border border-ink-200 bg-white p-0.5 sm:inline-flex sm:w-auto" role="tablist">
        {ONGLETS.map((o) => (
          <button key={o.id} type="button" role="tab" aria-selected={onglet === o.id} onClick={() => setOnglet(o.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none ${onglet === o.id ? 'bg-forest-600 text-white' : 'text-ink-600 hover:bg-cream-100'}`}>
            {o.label}
          </button>
        ))}
      </div>

      {onglet === 'remunerations' ? (
        <>
        {!filtreStatut && (
          <p className="text-sm text-ink-500">
            Les rémunérations entièrement payées passent dans « Paiements effectués ». Elles reviennent ici si un paiement est annulé
            (choisissez le statut « Payé » pour les voir quand même).
          </p>
        )}
        <DataTable
          columns={colonnesRemunerations}
          data={rem.lignes}
          serveur={rem.serveur}
          loading={rem.chargement}
          searchPlaceholder="Rechercher un salaire..."
          onRowClick={(row) => setDetailId(row.id)}
          actions={ActionsRemuneration}
          filters={filtresRemunerations}
          filtersActive={compterFiltres(filtreStatut) + nbFiltresCommuns}
          onResetFilters={reinitialiser}
          emptyTitle="Aucune rémunération"
          emptyMessage="Les travaux génèrent leur rémunération ; « Nouvelle rémunération » pour une saisie manuelle."
          emptyAction={<Button size="sm" onClick={() => setRemuneration(true)}><Plus size={14} /> Nouvelle rémunération</Button>}
        />
        </>
      ) : (
        <>
          <p className="text-sm text-ink-500">
            {totauxPaiements.valides} paiement(s){nbAnnules > 0 ? ` (+ ${nbAnnules} annulé${nbAnnules > 1 ? 's' : ''})` : ''} · <span className="font-semibold tabular-nums text-ink-800">{formatFCFA(totauxPaiements.montant)}</span>
            <span className="hidden sm:inline"> — chaque paiement figure aussi dans les dépenses</span>
          </p>
          <DataTable
            columns={colonnesPaiements}
            data={pai.lignes}
            serveur={pai.serveur}
            loading={pai.chargement}
            searchPlaceholder="Rechercher un paiement..."
            onRowClick={ouvrirApercu}
            actions={ActionsPaiement}
            filters={filtresCommuns}
            filtersActive={nbFiltresCommuns}
            onResetFilters={reinitialiser}
            emptyTitle="Aucun paiement"
            emptyAction={<Button size="sm" onClick={() => setNouveauPaiement(true)}><HandCoins size={14} /> Nouveau paiement</Button>}
          />
        </>
      )}

      <SalaireDetail
        salaire={detail}
        isBoss={isBoss}
        onClose={() => setDetailId(null)}
        onPayer={(s) => setAPayer({ salaire: s })}
        onApercu={ouvrirApercu}
        onModifierPaiement={modifierPaiement}
        onSupprimerPaiement={supprimerPaiement}
        onAnnulerPaiement={annulerPaiement}
        onReactiverPaiement={reactiverPaiement}
      />
      {aPayer && (
        <PaiementModal salaire={aPayer.salaire} paiement={aPayer.paiement} onClose={() => setAPayer(null)} onSaved={apresPaiement} />
      )}
      <NouveauPaiementModal
        open={nouveauPaiement}
        onClose={() => setNouveauPaiement(false)}
        onPayer={(s) => { setNouveauPaiement(false); setAPayer({ salaire: s }); }}
      />
      <RemunerationModal
        open={remuneration}
        personnes={personnes}
        onClose={() => setRemuneration(false)}
        onSaved={() => { setRemuneration(false); recharger(); }}
      />
      <RecusModal paiements={recus} onClose={() => setRecus(null)} />
      <ApercuRecuModal paiement={apercu} onClose={() => setApercu(null)}
        onModifier={(p) => { setApercu(null); modifierPaiement(p); }} onAnnuler={annulerPaiement} onReactiver={reactiverPaiement} />
      {dialoguePaiement}
      {dialogueAnnulationPaiement}
      {dialogueRemuneration}
      {dialogueAnnulation}
    </div>
  );
}
