import { useState, useEffect } from 'react';
import { ShoppingBag, Plus, Scale, Users, HandCoins, FileDown } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import RowActions from '@/components/RowActions';
import BlocPicker from '@/components/BlocPicker';
import AchatFormulaire, { UNITE_ACHAT } from '@/pages/particuliers/AchatFormulaire';
import { AchatEnregistre, ReglementAchat } from '@/pages/particuliers/FenetresAchat';
import { colonnesAchats } from '@/pages/particuliers/colonnes';
import { DataTable, Button, ErrorState, KpiGrid, Select } from '@/components/ui';
import { compterFiltres } from '@/components/ui/Filtres';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSuppression } from '@/hooks/useSuppression';
import { useListeServeur } from '@/hooks/useListeServeur';
import { achatsParticuliersService, particuliersService, campementsService, blocsService, unitesService } from '@/services';
import { formatFCFA, formatNumber } from '@/utils/format';
import { showServerErrors, today } from '@/utils/errors';
import { ROLE, STATUT_ACHAT_LABELS } from '@/constants';

const emptyForm = () => ({
  particulier_id: '', particulier_nom: '', particulier_telephone: '', designation: '', poids: '', unite_poids: 'kg',
  prix_unitaire: '', date_achat: today(), campement_id: '', bloc_id: '', montant_verse: '', type_paiement: 'ESPECES',
});

export default function ParticuliersPage() {
  const { user } = useAuth();
  const isBoss = user?.role === ROLE.BIG_BOSS;
  const [particuliers, setParticuliers] = useState([]);
  const [campements, setCampements] = useState([]);
  const [blocs, setBlocs] = useState([]);
  const [error, setError] = useState(false);
  const [filtreBloc, setFiltreBloc] = useState({ campement_id: '', bloc_id: '' });
  const [filterStatut, setFilterStatut] = useState('');
  const [unites, setUnites] = useState([]);
  const [edition, setEdition] = useState(null); // null fermé · 'nouveau' · achat modifié
  const [enregistre, setEnregistre] = useState(null); // achat qui vient d'être enregistré (reçu)
  const [telechargement, setTelechargement] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [aRegler, setARegler] = useState(null);
  const [reglement, setReglement] = useState({ montant: '', date: today(), type_paiement: 'ESPECES' });
  const [reglementErrors, setReglementErrors] = useState({});
  const toast = useToast();
  const enModification = edition && edition !== 'nouveau';

  // Liste paginée par le serveur : page, recherche, tri, filtres (paiement, campement / bloc) et indicateurs de toutes les lignes filtrées
  const { lignes, totaux, serveur, chargement: loading, erreur, recharger } = useListeServeur({
    charger: (p) => achatsParticuliersService.page(p),
    totaux: (p) => achatsParticuliersService.totaux(p),
    filtres: { statut: filterStatut, campement_id: filtreBloc.campement_id, bloc_id: filtreBloc.bloc_id },
  });
  useEffect(() => { if (erreur) setError(true); }, [erreur]);

  const load = () => Promise.all([particuliersService.getAll(), campementsService.getAll(), blocsService.getAll(), unitesService.getAll()])
    .then(([p, c, b, u]) => { setParticuliers(p); setCampements(c); setBlocs(b); setUnites(u.unites); })
    .catch(() => setError(true));

  const { demander, dialogue } = useSuppression({
    supprimer: (row) => achatsParticuliersService.remove(row.id),
    apres: () => recharger(),
    message: (row) => `Supprimer l'achat ${row.reference} (${formatFCFA(row.montant_total)}) ? Ses paiements et la dépense associée seront aussi supprimés.`,
    succes: (row) => `Achat ${row.reference} supprimé (ainsi que sa dépense)`,
  });

  const telechargerRecu = async (achat) => {
    setTelechargement(achat.id);
    try {
      await achatsParticuliersService.telechargerRecu(achat.id);
    } catch (err) {
      showServerErrors(err, { toast });
    } finally {
      setTelechargement(null);
    }
  };

  useEffect(() => { load(); }, []);

  // Montant calculé automatiquement : quantité × prix unitaire (recalculé par le serveur)
  const montant = Math.round((Number(form.poids) || 0) * (Number(form.prix_unitaire) || 0) * 100) / 100;

  const totalAchats = totaux?.total ?? 0;
  const totalReste = totaux?.reste ?? 0;
  const totalKg = totaux?.kg ?? 0;
  const nbVendeurs = totaux?.vendeurs ?? 0;

  const ouvrir = (achat = null) => {
    setForm(achat
      ? {
        ...emptyForm(), particulier_id: achat.particulier_id, particulier_telephone: achat.particulier_telephone || '',
        designation: achat.designation, poids: String(achat.poids), unite_poids: achat.unite_poids || UNITE_ACHAT,
        prix_unitaire: String(achat.prix_unitaire), date_achat: achat.date_achat, campement_id: achat.campement_id,
        bloc_id: achat.bloc_id,
      }
      : emptyForm());
    setFormErrors({});
    setEdition(achat || 'nouveau');
  };

  // Choisir un vendeur existant remplit son téléphone ; taper un nouveau nom le crée à l'enregistrement
  const choisirVendeur = (id) => {
    const p = particuliers.find((x) => x.id === id);
    setForm((f) => ({ ...f, particulier_id: id, particulier_nom: '', particulier_telephone: p?.telephone || '' }));
  };
  const nouveauVendeur = (nom) => setForm((f) => ({ ...f, particulier_id: '', particulier_nom: nom, particulier_telephone: '' }));

  const validate = () => {
    const errs = {};
    if (!form.particulier_id && !form.particulier_nom.trim()) errs.particulier_nom = 'Le nom du vendeur est obligatoire';
    if (form.particulier_telephone && !/^\+?[0-9][0-9\s()-]{7,19}$/.test(form.particulier_telephone.trim())) errs.particulier_telephone = 'Numéro de téléphone invalide';
    if (!form.designation.trim()) errs.designation = 'Le produit est obligatoire';
    if (!(Number(form.poids) > 0)) errs.poids = 'Le poids / la quantité doit être supérieur à 0';
    if (!(Number(form.prix_unitaire) > 0)) errs.prix_unitaire = 'Le prix unitaire doit être supérieur à 0';
    if (!form.date_achat) errs.date_achat = 'La date est obligatoire';
    else if (form.date_achat > today()) errs.date_achat = 'La date ne peut pas être dans le futur';
    if (!form.bloc_id) errs.bloc_id = 'Le bloc est obligatoire';
    if (!enModification && form.montant_verse !== '' && (Number(form.montant_verse) < 0 || Number(form.montant_verse) > montant)) errs.montant_verse = `Entre 0 et ${formatFCFA(montant)}`;
    if (enModification && montant < edition.montant_paye) errs.poids = `Le montant serait inférieur au déjà payé (${formatFCFA(edition.montant_paye)})`;
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    const commun = {
      ...(form.particulier_id ? { particulier_id: form.particulier_id } : { particulier_nom: form.particulier_nom.trim() }),
      particulier_telephone: form.particulier_telephone.trim(),
      designation: form.designation.trim(),
      poids: Number(form.poids),
      unite_poids: form.unite_poids,
      prix_unitaire: Number(form.prix_unitaire),
      date_achat: form.date_achat,
      bloc_id: form.bloc_id,
    };
    try {
      if (enModification) {
        const achat = await achatsParticuliersService.update(edition.id, commun);
        await load();
        recharger();
        setEdition(null);
        toast.success(`Achat ${achat.reference} modifié — dépense mise à jour`);
      } else {
        const achat = await achatsParticuliersService.create({
          ...commun,
          montant_verse: form.montant_verse === '' ? montant : Number(form.montant_verse),
          type_paiement: form.type_paiement,
        });
        await load();
        recharger();
        setEdition(null);
        setEnregistre(achat);
      }
    } catch (err) {
      showServerErrors(err, { setFormErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  const openReglement = (achat) => {
    setReglement({ montant: String(achat.reste), date: today(), type_paiement: 'ESPECES' });
    setReglementErrors({});
    setARegler(achat);
  };

  const handleReglement = async () => {
    setSaving(true);
    try {
      const maj = await achatsParticuliersService.payer(aRegler.id, { ...reglement, montant: Number(reglement.montant) });
      recharger();
      toast.success(`Paiement enregistré — ${maj.reference} : ${STATUT_ACHAT_LABELS[maj.statut].toLowerCase()}`);
      setARegler(null);
    } catch (err) {
      showServerErrors(err, { setFormErrors: setReglementErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  const columns = colonnesAchats;

  // « Régler » quand il reste à payer, reçu et modification visibles ; suppression dans le menu « ⋯ »
  // (bouton du reçu au même format que « Modifier » et « ⋯ » : même couleur, même zone tactile)
  const ActionsCell = ({ row }) => (
    <RowActions onEdit={() => ouvrir(row)} onDelete={isBoss ? () => demander(row) : undefined}>
      {row.reste > 0 && (
        <Button variant="outline" size="sm" className="mr-1" onClick={() => openReglement(row)}><HandCoins size={14} /> Régler</Button>
      )}
      <button type="button" onClick={() => telechargerRecu(row)} disabled={telechargement === row.id} title="Reçu PDF"
        aria-label={`Reçu de l'achat ${row.reference}`}
        className="rounded-lg p-2.5 text-ink-500 transition-colors hover:bg-forest-50 hover:text-forest-700 disabled:cursor-not-allowed disabled:opacity-35 md:p-1.5">
        <FileDown size={15} />
      </button>
    </RowActions>
  );

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Achats particuliers"
        subtitle="Produits achetés aux particuliers, comptés en dépenses"
        icon={ShoppingBag}
        actions={<Button size="sm" onClick={() => ouvrir()}><Plus size={16} /> Nouvel achat</Button>}
      />

      <KpiGrid items={[
        { label: 'Total des achats', value: formatNumber(totalAchats), unit: 'FCFA', icon: ShoppingBag, accent: 'forest' },
        { label: 'Reste à payer', value: formatNumber(totalReste), unit: 'FCFA', icon: HandCoins, accent: 'earth' },
        { label: 'Poids acheté', value: formatNumber(totalKg), unit: 'kg', icon: Scale, accent: 'olive' },
        { label: 'Vendeurs', value: nbVendeurs, icon: Users, accent: 'leaf' },
      ]} />

      <DataTable
        columns={columns}
        data={lignes}
        serveur={serveur}
        loading={loading}
        searchPlaceholder="Rechercher un achat..."
        emptyTitle="Aucun achat enregistré"
        emptyAction={<Button size="sm" onClick={() => ouvrir()}><Plus size={14} /> Nouvel achat</Button>}
        onRowClick={(row) => ouvrir(row)}
        actions={ActionsCell}
        filters={(
          <>
            <Select
              value={filterStatut}
              onChange={(e) => setFilterStatut(e.target.value)}
              options={Object.entries(STATUT_ACHAT_LABELS).map(([value, label]) => ({ value, label }))}
              placeholder="Paiement" emptyLabel="Tous les paiements"
              className="w-full sm:w-40"
            />
            <BlocPicker mode="filter" campements={campements} blocs={blocs} value={filtreBloc} onChange={setFiltreBloc} />
          </>
        )}
        filtersActive={compterFiltres(filterStatut, filtreBloc.campement_id, filtreBloc.bloc_id)}
        onResetFilters={() => { setFilterStatut(''); setFiltreBloc({ campement_id: '', bloc_id: '' }); }}
      />

      {dialogue}

      <AchatFormulaire
        edition={edition} enModification={enModification} form={form} setForm={setForm} formErrors={formErrors} saving={saving}
        onClose={() => setEdition(null)} onSubmit={handleSubmit} particuliers={particuliers} unites={unites} campements={campements}
        blocs={blocs} montant={montant} nouveauVendeur={nouveauVendeur} choisirVendeur={choisirVendeur}
      />

      <ReglementAchat
        achat={aRegler} reglement={reglement} setReglement={setReglement} erreurs={reglementErrors} saving={saving}
        onClose={() => setARegler(null)} onSubmit={handleReglement}
      />

      <AchatEnregistre achat={enregistre} telechargement={telechargement} onClose={() => setEnregistre(null)} onRecu={telechargerRecu} />
    </div>
  );
}
