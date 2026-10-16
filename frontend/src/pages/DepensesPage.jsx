import { useState, useEffect } from 'react';
import { Wallet, Plus, CheckCircle2, Hourglass, ArrowUpRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';
import RowActions from '@/components/RowActions';
import BlocPicker from '@/components/BlocPicker';
import { DataTable, Button, ErrorState, FiltrePeriode, Select, KpiGrid } from '@/components/ui';
import { PERIODE_VIDE, libellePlage, periodeActive, plagePeriode, erreurPeriode } from '@/components/ui/FiltrePeriode';
import { compterFiltres } from '@/components/ui/Filtres';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import DepenseFormulaire from '@/pages/depenses/DepenseFormulaire';
import { colonnesDepenses, pageSource } from '@/pages/depenses/colonnes';
import { useSuppression } from '@/hooks/useSuppression';
import { useListeServeur } from '@/hooks/useListeServeur';
import { depensesService, campementsService, blocsService, categoriesDepensesService, paiementsService, achatsParticuliersService } from '@/services';
import { formatFCFA, formatNumber } from '@/utils/format';
import { showServerErrors, today } from '@/utils/errors';
import { ROLE, STATUT_DEPENSE_LABELS } from '@/constants';

const emptyForm = () => ({
  designation: '', categorie_id: '', montant_total: '', campement_id: '', bloc_id: '', date: today(),
  numero_justificatif: '', observation: '',
});


export default function DepensesPage() {
  const { user } = useAuth();
  const isBoss = user?.role === ROLE.BIG_BOSS;
  const navigate = useNavigate();
  const [campements, setCampements] = useState([]);
  const [blocs, setBlocs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(false);
  const [filterCategorie, setFilterCategorie] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [periode, setPeriode] = useState(PERIODE_VIDE);
  const [filtreBloc, setFiltreBloc] = useState({ campement_id: '', bloc_id: '' });
  const [edition, setEdition] = useState(null); // null fermé · 'nouvelle' · dépense modifiée
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const enModification = edition && edition !== 'nouvelle';

  useEffect(() => {
    Promise.all([campementsService.getAll(), blocsService.getAll(), categoriesDepensesService.getAll()])
      .then(([c, b, cat]) => {
        setCampements(c);
        setBlocs(b);
        setCategories(cat);
      })
      .catch(() => setError(true));
  }, []);

  // Liste paginée par le serveur : page, recherche, tri, filtres (catégorie, statut, bloc, période) et indicateurs de TOUTES les lignes filtrées
  const periodeInvalide = Boolean(erreurPeriode(periode));
  const { lignes, totaux, serveur, chargement: loading, erreur, recharger } = useListeServeur({
    charger: (p) => depensesService.page(p),
    totaux: (p) => depensesService.totaux(p),
    filtres: {
      categorie_id: filterCategorie, statut: filterStatut, campement_id: filtreBloc.campement_id, bloc_id: filtreBloc.bloc_id, ...plagePeriode(periode),
    },
    actif: !periodeInvalide,
  });
  useEffect(() => { if (erreur) setError(true); }, [erreur]);

  const { demander, dialogue } = useSuppression({
    supprimer: (row) => depensesService.remove(row.id),
    apres: () => recharger(),
    message: (row) => `Supprimer la dépense « ${row.designation} » (${formatFCFA(row.montant_total)}) ? Cette action est irréversible.`,
    succes: () => 'Dépense supprimée',
  });

  // Supprimer une dépense automatique agit sur sa source : un paiement de salaire est annulé (il reste dans l'historique),
  // un achat est supprimé avec ses règlements. Toujours après confirmation, et réservé au Super admin.
  const { demander: demanderSuppressionSource, dialogue: dialogueSource } = useSuppression({
    supprimer: (row) => (row.origine?.type === 'SALAIRE'
      ? paiementsService.annuler(row.origine.id, 'Dépense supprimée')
      : achatsParticuliersService.remove(row.origine.id)),
    apres: () => recharger(),
    titre: 'Supprimer la dépense',
    libelleBouton: 'Supprimer la dépense',
    message: (row) => (row.origine?.type === 'SALAIRE'
      ? `Cette dépense est le paiement ${row.origine.reference} de ${row.origine.beneficiaire_nom || 'la personne'} (${formatFCFA(row.montant_total)}). `
        + "La supprimer annule ce paiement : il reste dans l'historique, marqué « annulé », et le reste à payer de la rémunération augmente d'autant."
      : `Cette dépense est l'achat ${row.origine?.reference} (${formatFCFA(row.montant_total)}). `
        + 'La supprimer supprime aussi cet achat et ses règlements. Cette action est irréversible.'),
    succes: () => 'Dépense supprimée',
  });

  // Les achats aux particuliers et les salaires s'enregistrent depuis leurs pages (dépense créée automatiquement)
  const categoriesSaisie = categories
    .filter((c) => (c.actif && !c.systeme) || c.id === form.categorie_id)
    .map((c) => ({ value: c.id, label: c.libelle }));

  const totalDepenses = totaux?.total ?? 0;
  const depensesPayees = totaux?.payees ?? 0;
  const avances = totaux?.avances ?? 0;

  const ouvrir = (depense = null) => {
    setForm(depense
      ? {
        designation: depense.designation, categorie_id: depense.categorie_id, montant_total: String(depense.montant_total),
        campement_id: depense.campement_id, bloc_id: depense.bloc_id, date: depense.date,
        numero_justificatif: depense.numero_justificatif || '', observation: depense.observation || '',
      }
      : emptyForm());
    setFormErrors({});
    setEdition(depense || 'nouvelle');
  };

  const validate = () => {
    const errs = {};
    if (!form.designation.trim()) errs.designation = 'La désignation est obligatoire';
    if (!form.categorie_id) errs.categorie_id = 'La catégorie est obligatoire';
    if (!(Number(form.montant_total) > 0)) errs.montant_total = 'Le montant doit être supérieur à 0';
    if (!form.date) errs.date = 'La date est obligatoire';
    else if (form.date > today()) errs.date = 'La date ne peut pas être dans le futur';
    if (!form.bloc_id) errs.bloc_id = 'Le bloc est obligatoire';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      designation: form.designation.trim(),
      categorie_id: form.categorie_id,
      montant_total: Number(form.montant_total),
      bloc_id: form.bloc_id,
      date: form.date,
      numero_justificatif: form.numero_justificatif.trim(),
      observation: form.observation.trim(),
    };
    try {
      enModification ? await depensesService.update(edition.id, payload) : await depensesService.create(payload);
      recharger();
      setEdition(null);
      toast.success(enModification ? 'Dépense modifiée' : 'Dépense enregistrée');
    } catch (err) {
      showServerErrors(err, { setFormErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  const columns = colonnesDepenses;

  // Une dépense issue d'un achat ou d'un paiement de salaire se modifie depuis sa source
  const ActionsCell = ({ row }) => {
    if (!row.modifiable) {
      const salaire = row.origine?.type === 'SALAIRE';
      return (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Link to={pageSource(row)}
            title={salaire ? 'Se modifie depuis Salaires' : 'Se modifie depuis Achats particuliers'}
            className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-medium text-forest-700 hover:bg-forest-50">
            {salaire ? 'Paiement' : 'Achat'} <ArrowUpRight size={13} />
          </Link>
          {isBoss && <RowActions onDelete={() => demanderSuppressionSource(row)} />}
        </div>
      );
    }
    return <RowActions onEdit={() => ouvrir(row)} onDelete={isBoss ? () => demander(row) : undefined} />;
  };

  // Clic sur une ligne : formulaire de modification, sinon la page d'origine (salaire, achat)
  const ouvrirLigne = (row) => (row.modifiable ? ouvrir(row) : navigate(pageSource(row)));

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Dépenses"
        subtitle="Charges par bloc, achats et salaires compris"
        icon={Wallet}
        actions={<Button size="sm" onClick={() => ouvrir()}><Plus size={16} /> Nouvelle dépense</Button>}
      />

      <KpiGrid items={[
        { label: 'Total dépenses', value: formatNumber(totalDepenses), unit: 'FCFA', icon: Wallet, accent: 'forest',
          hint: libellePlage(periode) || undefined },
        { label: 'Payées', value: formatNumber(depensesPayees), unit: 'FCFA', icon: CheckCircle2, accent: 'leaf' },
        { label: 'Avances à solder', value: formatNumber(avances), unit: 'FCFA', icon: Hourglass, accent: 'earth',
          hint: 'Avances versées dont la rémunération n\'est pas soldée' },
      ]} />

      <DataTable
        columns={columns}
        data={lignes}
        serveur={serveur}
        loading={loading}
        searchPlaceholder="Rechercher une dépense..."
        onRowClick={ouvrirLigne}
        actions={ActionsCell}
        filters={(
          <>
            <Select
              value={filterCategorie}
              onChange={(e) => setFilterCategorie(e.target.value)}
              options={categories.map((c) => ({ value: c.id, label: c.libelle }))}
              placeholder="Catégorie" emptyLabel="Toutes les catégories"
              className="w-full sm:w-40"
            />
            <FiltrePeriode value={periode} onChange={setPeriode} />
            <Select
              value={filterStatut}
              onChange={(e) => setFilterStatut(e.target.value)}
              options={Object.entries(STATUT_DEPENSE_LABELS).map(([value, label]) => ({ value, label }))}
              placeholder="Statut" emptyLabel="Tous les statuts"
              className="w-full sm:w-40"
            />
            <BlocPicker mode="filter" campements={campements} blocs={blocs} value={filtreBloc} onChange={setFiltreBloc} />
          </>
        )}
        filtersActive={compterFiltres(filterCategorie, filterStatut, filtreBloc.campement_id, filtreBloc.bloc_id) + (periodeActive(periode) ? 1 : 0)}
        onResetFilters={() => {
          setFilterCategorie(''); setFilterStatut(''); setFiltreBloc({ campement_id: '', bloc_id: '' }); setPeriode(PERIODE_VIDE);
        }}
        emptyTitle={periodeActive(periode) ? 'Aucune dépense sur cette période' : 'Aucune dépense'}
        emptyAction={<Button size="sm" onClick={() => ouvrir()}><Plus size={14} /> Nouvelle dépense</Button>}
      />
      {dialogue}
      {dialogueSource}

      <DepenseFormulaire
        edition={edition} enModification={enModification} form={form} setForm={setForm} formErrors={formErrors} saving={saving}
        onClose={() => setEdition(null)} onSubmit={handleSubmit} categoriesSaisie={categoriesSaisie} campements={campements} blocs={blocs}
      />
    </div>
  );
}
