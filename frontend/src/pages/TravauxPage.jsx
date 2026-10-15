import { useState, useEffect, useMemo } from 'react';
import { HardHat, Plus, Ban, RotateCcw } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import RowActions from '@/components/RowActions';
import TravailDetail from '@/components/TravailDetail';
import BlocPicker from '@/components/BlocPicker';
import TravailFormulaire from '@/pages/travaux/TravailFormulaire';
import { colonnesTravaux } from '@/pages/travaux/colonnes';
import { DataTable, Button, ErrorState, Select } from '@/components/ui';
import { compterFiltres } from '@/components/ui/Filtres';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSuppression } from '@/hooks/useSuppression';
import { useListeServeur } from '@/hooks/useListeServeur';
import { travauxService, blocsService, campementsService, activitesService, personnesService, unitesService } from '@/services';
import { formatFCFA } from '@/utils/format';
import { showServerErrors, today } from '@/utils/errors';
import { ROLE, STATUT_TRAVAIL_LABELS } from '@/constants';

const UNITE_PAR_DEFAUT = 'ha';

const formulaireVide = (unite = UNITE_PAR_DEFAUT) => ({
  type_travail_id: '', activite_autre: '', campement_id: '', bloc_id: '', date_travail: today(), date_fin: today(),
  unite, quantite: '', prix_unitaire: '', nombre_jours: '', observation: '',
  personnes_ids: [], chef_id: '', equipe_nom: '',
  avance_oui: false, avance_montant: '', avance_beneficiaire_id: '', avance_type: 'ESPECES', avance_date: today(),
});

// Même règle que le serveur : À venir → En cours → Terminé selon les dates
function statutSelonDates(debut, fin) {
  const jour = today();
  if (debut && debut > jour) return 'PLANIFIE';
  if (fin && fin < jour) return 'TERMINE';
  return 'EN_COURS';
}

const nombre = (valeur) => (valeur === '' || valeur == null ? '' : String(Number(valeur)));

export default function TravauxPage() {
  const { user } = useAuth();
  const isBoss = user?.role === ROLE.BIG_BOSS;
  const toast = useToast();
  const [blocs, setBlocs] = useState([]);
  const [campements, setCampements] = useState([]);
  const [activites, setActivites] = useState([]);
  const [personnes, setPersonnes] = useState([]);
  const [unites, setUnites] = useState({ defaut: UNITE_PAR_DEFAUT, unites: [] });
  const [error, setError] = useState(false);
  const [filtreActivite, setFiltreActivite] = useState('');
  const [filtreStatut, setFiltreStatut] = useState('');
  const [filtreBloc, setFiltreBloc] = useState({ campement_id: '', bloc_id: '' });
  const [edition, setEdition] = useState(null); // null fermé · 'nouveau' · travail modifié
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(formulaireVide);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const enModification = edition && edition !== 'nouveau';

  // Liste paginée par le serveur : page, recherche, tri et filtres (activité, statut, campement / bloc)
  const { lignes, serveur, chargement: loading, erreur, recharger } = useListeServeur({
    charger: (p) => travauxService.page(p),
    filtres: { type_travail_id: filtreActivite, statut: filtreStatut, campement_id: filtreBloc.campement_id, bloc_id: filtreBloc.bloc_id },
  });
  useEffect(() => { if (erreur) setError(true); }, [erreur]);

  useEffect(() => {
    Promise.all([
      blocsService.getAll(), campementsService.getAll(), activitesService.getAll(),
      personnesService.getAll(), unitesService.getAll(),
    ])
      .then(([b, c, a, p, u]) => {
        setBlocs(b);
        setCampements(c);
        setActivites(a);
        setPersonnes(p);
        setUnites(u);
      })
      .catch(() => setError(true));
  }, []);

  const remplacer = (travail) => {
    setDetail((courant) => (courant && courant.id === travail.id ? travail : courant));
    recharger();
  };

  const { demander: demanderSuppression, dialogue: dialogueSuppression } = useSuppression({
    supprimer: (row) => travauxService.remove(row.id),
    apres: () => { recharger(); setDetail(null); },
    titre: 'Supprimer le travail',
    message: (row) => `Supprimer le travail « ${row.activite} » du bloc ${row.bloc_code} ? Sa rémunération (aucun paiement à ce jour) `
      + 'et son équipe sont supprimées avec lui. Cette action est irréversible ; pour garder une trace, annulez-le plutôt.',
    succes: (row) => `Travail « ${row.activite} » supprimé`,
  });

  const { demander: demanderAnnulation, dialogue: dialogueAnnulation } = useSuppression({
    supprimer: async (row) => remplacer(await travauxService.annuler(row.id)),
    titre: "Annuler le travail",
    libelleBouton: 'Annuler le travail',
    message: (row) => `Annuler « ${row.activite} » (${row.bloc_code}), quel que soit son statut ? Le travail et sa rémunération `
      + "ne sont plus comptés (totaux, tableau de bord, Excel) et ne sont plus payables."
      + (row.nb_paiements > 0
        ? ` Ses ${row.nb_paiements} paiement(s) (${formatFCFA(row.montant_paiements)}) sont annulés avec lui et leurs dépenses disparaissent.`
        : '')
      + ' Tout reste consultable dans l\'historique, et « Rétablir » remet tout en vigueur.',
    succes: (row) => `Travail « ${row.activite} » annulé`,
  });

  const retablir = async (row) => {
    try {
      remplacer(await travauxService.retablir(row.id));
      toast.success(`Travail « ${row.activite} » rétabli`);
    } catch (err) {
      showServerErrors(err, { toast });
    }
  };

  const activiteChoisie = activites.find((a) => a.id === form.type_travail_id);
  const blocChoisi = blocs.find((b) => b.id === form.bloc_id);
  const montant = (Number(form.quantite) || 0) * (Number(form.prix_unitaire) || 0);
  const enEquipe = form.personnes_ids.length >= 2;
  const personneDe = (id) => personnes.find((p) => p.id === id);
  const nomDe = (id) => {
    const p = personneDe(id);
    return p ? `${p.prenom} ${p.nom}` : '';
  };
  const titulaire = enEquipe ? form.chef_id : form.personnes_ids[0] || '';
  const statutPrevu = statutSelonDates(form.date_travail, form.date_fin);
  const avanceExistante = enModification ? edition.avance : null;
  const nomEquipeParDefaut = activiteChoisie && blocChoisi
    ? `Équipe ${(activiteChoisie.precision_requise ? form.activite_autre || 'Autre' : activiteChoisie.libelle).toLowerCase()
      .replace(/(^|[^a-zà-ÿ])([a-zà-ÿ])/g, (m, avant, lettre) => avant + lettre.toUpperCase())} ${blocChoisi.code}`
    : 'Équipe …';
  // « Plus d'options » (nombre de jours, observation) : ouvert d'emblée s'ils sont déjà renseignés (modification) ou en erreur
  const optionsRenseignees = form.nombre_jours !== '' || form.observation.trim() !== '';
  const erreurOptions = !!(formErrors.nombre_jours || formErrors.observation);

  // Personnes proposées : actives (et celles déjà sur le travail), celles du campement du bloc choisi en premier
  // (une personne est enregistrée au niveau du campement et travaille sur tous ses blocs)
  const optionsPersonnes = useMemo(() => {
    const dejaLa = new Set(enModification ? edition.personnes_ids : []);
    const campementDuBloc = blocs.find((b) => b.id === form.bloc_id)?.campement_id;
    return personnes
      .filter((p) => p.actif || dejaLa.has(p.id))
      .sort((a, b) => ((b.campement_id === campementDuBloc) - (a.campement_id === campementDuBloc))
        || `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`, 'fr'))
      .map((p) => ({
        value: p.id,
        label: `${p.prenom} ${p.nom}`,
        hint: [p.matricule, p.campement_nom || 'sans campement', p.fonction_libelle].filter(Boolean).join(' · '),
      }));
  }, [personnes, blocs, form.bloc_id, edition, enModification]);

  const ouvrir = (travail = null) => {
    if (travail) {
      setForm({
        type_travail_id: travail.type_travail_id,
        activite_autre: travail.activite_autre || '',
        campement_id: travail.campement_id,
        bloc_id: travail.bloc_id,
        date_travail: travail.date_travail,
        date_fin: travail.date_fin || travail.date_travail,
        unite: travail.unite || unites.defaut,
        quantite: nombre(travail.quantite),
        prix_unitaire: nombre(travail.prix_unitaire),
        nombre_jours: Number(travail.nombre_jours) ? nombre(travail.nombre_jours) : '',
        observation: travail.observation || '',
        personnes_ids: travail.personnes_ids || [],
        chef_id: travail.chef_id || '',
        equipe_nom: travail.equipe_nom || '',
        avance_oui: !!travail.avance,
        avance_montant: travail.avance ? nombre(travail.avance.montant) : '',
        avance_beneficiaire_id: travail.avance?.beneficiaire_id || '',
        avance_type: travail.avance?.type_paiement || 'ESPECES',
        avance_date: travail.avance?.date || today(),
      });
    } else {
      setForm(formulaireVide(unites.defaut));
    }
    setFormErrors({});
    setDetail(null);
    setEdition(travail || 'nouveau');
  };

  const maj = (patch) => setForm((f) => ({ ...f, ...patch }));

  const choisirActivite = (id) => {
    const activite = activites.find((a) => a.id === id);
    maj({ type_travail_id: id, unite: activite?.unite_par_defaut || form.unite });
  };

  const choisirPersonnes = (ids) => setForm((f) => ({
    ...f,
    personnes_ids: ids,
    chef_id: ids.length >= 2 && ids.includes(f.chef_id) ? f.chef_id : '',
    avance_beneficiaire_id: ids.includes(f.avance_beneficiaire_id) ? f.avance_beneficiaire_id : '',
  }));

  const validate = () => {
    const errs = {};
    if (!form.type_travail_id) errs.type_travail_id = "L'activité est obligatoire";
    if (activiteChoisie?.precision_requise && !form.activite_autre.trim()) errs.activite_autre = "Précisez le nom de l'activité";
    if (!form.bloc_id) errs.bloc_id = 'Le bloc est obligatoire';
    if (!form.date_travail) errs.date_travail = 'La date de début est obligatoire';
    if (!form.date_fin) errs.date_fin = 'La date de fin est obligatoire';
    else if (form.date_travail && form.date_fin < form.date_travail) errs.date_fin = 'La date de fin doit suivre la date de début';
    if (!form.unite) errs.unite = "L'unité est obligatoire";
    if (!(Number(form.quantite) > 0)) errs.quantite = 'La quantité doit être supérieure à 0';
    if (form.prix_unitaire === '' || !(Number(form.prix_unitaire) >= 0)) errs.prix_unitaire = 'Le prix unitaire est obligatoire';
    if (form.nombre_jours !== '' && !(Number(form.nombre_jours) >= 0)) errs.nombre_jours = 'Nombre de jours invalide';
    if (form.personnes_ids.length === 0) errs.personnes_ids = 'Sélectionnez au moins une personne';
    if (enEquipe && !form.chef_id) errs.chef_id = "Choisissez le chef d'équipe";
    if (form.avance_oui) {
      if (!(Number(form.avance_montant) > 0)) errs.avance_montant = "Le montant de l'avance doit être supérieur à 0";
      else if (Number(form.avance_montant) > montant) errs.avance_montant = `L'avance ne peut pas dépasser ${formatFCFA(montant)}`;
      if (!form.avance_date) errs.avance_date = "La date de l'avance est obligatoire";
      else if (form.avance_date > today()) errs.avance_date = 'La date ne peut pas être dans le futur';
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      type_travail_id: form.type_travail_id,
      activite_autre: activiteChoisie?.precision_requise ? form.activite_autre.trim() : '',
      bloc_id: form.bloc_id,
      date_travail: form.date_travail,
      date_fin: form.date_fin,
      unite: form.unite,
      quantite: Number(form.quantite),
      prix_unitaire: Number(form.prix_unitaire),
      nombre_jours: Number(form.nombre_jours) || 0,
      observation: form.observation.trim(),
      personnes_ids: form.personnes_ids,
      chef_id: enEquipe ? form.chef_id : null,
      equipe_nom: enEquipe ? form.equipe_nom.trim() : '',
    };
    if (form.avance_oui) {
      payload.avance = {
        montant: Number(form.avance_montant),
        beneficiaire_id: form.avance_beneficiaire_id || titulaire || null,
        type_paiement: form.avance_type,
        date: form.avance_date,
      };
    } else if (avanceExistante) {
      payload.avance = null; // suppression de l'avance (Big Boss)
    }
    try {
      const item = enModification ? await travauxService.update(edition.id, payload) : await travauxService.create(payload);
      recharger();
      setEdition(null);
      const avance = item.avance ? ` · avance ${formatFCFA(item.avance.montant)} (${item.avance.numero})` : '';
      toast.success(`${enModification ? 'Travail modifié' : 'Travail enregistré'} — ${formatFCFA(item.montant_total)}${avance}`);
    } catch (err) {
      const champs = err?.fields || {};
      // L'erreur de l'avance arrive groupée : on la place sous le champ concerné
      if (typeof champs.avance === 'string') {
        const cle = /bénéficiaire/i.test(champs.avance) ? 'avance_beneficiaire_id' : 'avance_montant';
        err.fields = { ...champs, [cle]: champs.avance };
      }
      showServerErrors(err, { setFormErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  const columns = colonnesTravaux;

  // « Modifier » visible ; voir, annuler / rétablir et supprimer dans le menu « ⋯ »
  const ActionsCell = ({ row }) => (
    <RowActions
      onView={() => setDetail(row)}
      onEdit={() => ouvrir(row)}
      menu={[
        row.statut === 'ANNULE' && { label: 'Rétablir le travail', icon: RotateCcw, onClick: () => retablir(row) },
        row.statut !== 'ANNULE' && { label: 'Annuler le travail', icon: Ban, onClick: () => demanderAnnulation(row) },
      ]}
      onDelete={isBoss ? () => demanderSuppression(row) : undefined}
      deleteDisabled={!row.peut_supprimer}
      deleteTitle="Des paiements (même annulés) sont rattachés : l'historique est conservé, annulez le travail plutôt"
    />
  );

  const filtres = (
    <>
      <Select
        value={filtreActivite}
        onChange={(e) => setFiltreActivite(e.target.value)}
        options={activites.map((a) => ({ value: a.id, label: a.libelle }))}
        placeholder="Activité" emptyLabel="Toutes les activités"
        className="w-full sm:w-40"
      />
      <Select
        value={filtreStatut}
        onChange={(e) => setFiltreStatut(e.target.value)}
        options={Object.entries(STATUT_TRAVAIL_LABELS).map(([value, label]) => ({ value, label }))}
        placeholder="Statut" emptyLabel="Tous les statuts"
        className="w-full sm:w-40"
      />
      <BlocPicker mode="filter" campements={campements} blocs={blocs} value={filtreBloc} onChange={setFiltreBloc} />
    </>
  );

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Travaux"
        subtitle="Travaux des blocs et de leurs équipes"
        icon={HardHat}
        actions={<Button size="sm" onClick={() => ouvrir()}><Plus size={16} /> Nouveau travail</Button>}
      />
      <DataTable
        columns={columns}
        data={lignes}
        serveur={serveur}
        loading={loading}
        searchPlaceholder="Rechercher un travail..."
        onRowClick={setDetail}
        actions={ActionsCell}
        filters={filtres}
        filtersActive={compterFiltres(filtreActivite, filtreStatut, filtreBloc.campement_id, filtreBloc.bloc_id)}
        onResetFilters={() => { setFiltreActivite(''); setFiltreStatut(''); setFiltreBloc({ campement_id: '', bloc_id: '' }); }}
        emptyTitle="Aucun travail"
        emptyMessage="Enregistrez un travail : son équipe et sa rémunération sont créées avec lui."
        emptyAction={<Button size="sm" onClick={() => ouvrir()}><Plus size={14} /> Nouveau travail</Button>}
      />

      <TravailDetail travail={detail} onClose={() => setDetail(null)} onChange={remplacer}
        onAnnuler={(t) => demanderAnnulation(t)} onModifier={(t) => ouvrir(t)}
        onSupprimer={isBoss ? (t) => demanderSuppression(t) : undefined} />

      <TravailFormulaire
        edition={edition} enModification={enModification} form={form} formErrors={formErrors} maj={maj} saving={saving}
        onClose={() => setEdition(null)} onSubmit={handleSubmit}
        activites={activites} campements={campements} blocs={blocs} unites={unites} optionsPersonnes={optionsPersonnes}
        choisirActivite={choisirActivite} choisirPersonnes={choisirPersonnes} activiteChoisie={activiteChoisie} blocChoisi={blocChoisi}
        montant={montant} enEquipe={enEquipe} nomDe={nomDe} titulaire={titulaire} statutPrevu={statutPrevu}
        avanceExistante={avanceExistante} nomEquipeParDefaut={nomEquipeParDefaut} erreurOptions={erreurOptions}
        optionsRenseignees={optionsRenseignees} isBoss={isBoss}
      />
      {dialogueSuppression}
      {dialogueAnnulation}
    </div>
  );
}
