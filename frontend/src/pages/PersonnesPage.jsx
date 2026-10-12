import { useState, useEffect } from 'react';
import { Users, Plus, Phone } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import AutoCodeInput from '@/components/AutoCodeInput';
import BlocPicker from '@/components/BlocPicker';
import PersonneDetail from '@/components/PersonneDetail';
import RowActions from '@/components/RowActions';
import { DataTable, Badge, Button, ErrorState, Select, Modal, Input, Autocomplete, PlusDOptions } from '@/components/ui';
import { compterFiltres } from '@/components/ui/Filtres';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSuppression } from '@/hooks/useSuppression';
import { useListeServeur } from '@/hooks/useListeServeur';
import { personnesService, fonctionsService, campementsService, blocsService } from '@/services';
import { formatDate } from '@/utils/format';
import { showServerErrors, today } from '@/utils/errors';
import { ROLE } from '@/constants';

// La date d'embauche est pré-remplie avec la date du jour
const emptyForm = () => ({
  nom: '', prenom: '', telephone: '', fonction: '', campement_id: '', bloc_id: '', date_embauche: today(),
  adresse: '', actif: true,
});

export default function PersonnesPage() {
  const { user } = useAuth();
  const isBoss = user?.role === ROLE.BIG_BOSS;
  const [fonctions, setFonctions] = useState([]);
  const [campements, setCampements] = useState([]);
  const [blocs, setBlocs] = useState([]);
  const [error, setError] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFonction, setFilterFonction] = useState('');
  const [filtreBloc, setFiltreBloc] = useState({ campement_id: '', bloc_id: '' });
  const [edition, setEdition] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const enModification = edition && edition !== 'nouveau';

  // Liste paginée par le serveur : page, recherche (nom, matricule, téléphone, fonction, bloc), tri et filtres (statut, fonction, campement / bloc)
  const { lignes, serveur, chargement: loading, erreur, recharger } = useListeServeur({
    charger: (p) => personnesService.page(p),
    filtres: { actif: filterStatus, fonction_id: filterFonction, campement_id: filtreBloc.campement_id, bloc_id: filtreBloc.bloc_id },
  });
  useEffect(() => { if (erreur) setError(true); }, [erreur]);

  useEffect(() => {
    Promise.all([fonctionsService.getAll(), campementsService.getAll(), blocsService.getAll()])
      .then(([fons, camps, bl]) => { setFonctions(fons); setCampements(camps); setBlocs(bl); })
      .catch(() => setError(true));
  }, []);

  const remplacer = (personne) => {
    setDetail((courant) => (courant && courant.id === personne.id ? personne : courant));
    recharger();
  };

  const { demander, dialogue } = useSuppression({
    supprimer: (row) => personnesService.remove(row.id),
    apres: () => recharger(),
    message: (row) => `Supprimer ${row.prenom} ${row.nom} (${row.matricule}) ? Une personne qui a déjà travaillé ou été payée ne peut pas être supprimée : passez-la plutôt en inactive.`,
    succes: (row) => `${row.prenom} ${row.nom} supprimé(e)`,
  });

  const ouvrir = (personne = null) => {
    setForm(personne
      ? {
        nom: personne.nom, prenom: personne.prenom, telephone: personne.telephone || '', fonction: personne.fonction_libelle || '',
        campement_id: personne.campement_id || '', bloc_id: personne.bloc_id || '',
        date_embauche: personne.date_embauche || today(), adresse: personne.adresse || '', actif: personne.actif,
      }
      : emptyForm());
    setFormErrors({});
    setEdition(personne || 'nouveau');
  };

  const validate = () => {
    const errs = {};
    if (!form.nom.trim()) errs.nom = 'Le nom est obligatoire';
    if (!form.prenom.trim()) errs.prenom = 'Le prénom est obligatoire';
    if (!form.fonction.trim()) errs.fonction_id = 'La fonction est obligatoire';
    if (!form.bloc_id) errs.bloc_id = "Le bloc d'affectation est obligatoire";
    if (form.telephone && !/^\+?[0-9][0-9\s().-]{7,19}$/.test(form.telephone.trim())) errs.telephone = 'Numéro de téléphone invalide';
    if (!form.date_embauche) errs.date_embauche = "La date d'embauche est obligatoire";
    else if (form.date_embauche > today()) errs.date_embauche = 'La date ne peut pas être dans le futur';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    // Fonction choisie ou saisie librement : le serveur réutilise l'existante (majuscules et espaces ignorés)
    const payload = {
      nom: form.nom.trim(), prenom: form.prenom.trim(), telephone: form.telephone.trim(), adresse: form.adresse.trim(),
      fonction_libelle: form.fonction.trim(), bloc_id: form.bloc_id, date_embauche: form.date_embauche,
      ...(enModification ? { actif: form.actif } : {}),
    };
    try {
      const item = enModification ? await personnesService.update(edition.id, payload) : await personnesService.create(payload);
      if (enModification) remplacer(item); else recharger();
      if (!fonctions.some((f) => f.id === item.fonction_id)) {
        setFonctions((liste) => [...liste, { id: item.fonction_id, libelle: item.fonction_libelle }]);
      }
      setEdition(null);
      toast.success(enModification
        ? `${item.prenom} ${item.nom} modifié(e)`
        : `${item.prenom} ${item.nom} enregistré(e) — matricule ${item.matricule}`);
    } catch (err) {
      const erreurs = err.fields || {};
      showServerErrors(err, { setFormErrors: () => setFormErrors({ ...erreurs, fonction_id: erreurs.fonction_id || erreurs.fonction_libelle }), toast });
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'nom', header: 'Personne', sortable: true, render: (row) => (
      <div className="flex items-center gap-2.5">
        <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-50 text-xs font-semibold text-forest-700 md:flex">
          {row.prenom?.[0]}{row.nom?.[0]}
        </div>
        <span className="min-w-0">
          <span className="font-medium text-ink-800">{row.prenom} {row.nom}</span>
          <span className="block text-2xs tabular-nums text-forest-700">{row.matricule}</span>
        </span>
      </div>
    ) },
    { key: 'fonction_libelle', header: 'Fonction', sortable: true, render: (row) => row.fonction_libelle || '—' },
    { key: 'bloc_code', header: 'Bloc', sortable: true, render: (row) => (row.bloc_code ? (
      <span>
        <span className="tabular-nums">{row.bloc_code}</span>
        <span className="block text-xs text-ink-500">{row.campement_nom}</span>
      </span>
    ) : <Badge status="unpaid">À affecter</Badge>) },
    { key: 'telephone', header: 'Téléphone', mobile: false, render: (row) => (row.telephone
      ? <span className="flex items-center gap-1.5 tabular-nums text-ink-600"><Phone size={13} />{row.telephone}</span> : '—') },
    { key: 'actif', header: 'Statut', mobile: false, render: (row) => <Badge status={row.actif ? 'active' : 'inactive'}>{row.actif ? 'Active' : 'Inactive'}</Badge> },
    { key: 'date_embauche', header: 'Embauche', sortable: true, mobile: false, render: (row) => <span className="tabular-nums">{formatDate(row.date_embauche)}</span> },
  ];

  const ActionsCell = ({ row }) => (
    <RowActions onView={() => setDetail(row)} onEdit={() => ouvrir(row)} onDelete={isBoss ? () => demander(row) : undefined} />
  );

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Personnes"
        subtitle="Personnel affecté aux blocs"
        icon={Users}
        actions={<Button size="sm" onClick={() => ouvrir()}><Plus size={16} /> Nouvelle personne</Button>}
      />
      <DataTable
        columns={columns}
        data={lignes}
        serveur={serveur}
        loading={loading}
        searchPlaceholder="Rechercher une personne..."
        onRowClick={(row) => setDetail(row)}
        actions={ActionsCell}
        filters={(
          <>
            <Select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              options={[{ value: 'true', label: 'Actives' }, { value: 'false', label: 'Inactives' }]}
              placeholder="Statut" emptyLabel="Tous les statuts"
              className="w-full sm:w-40"
            />
            <Select
              value={filterFonction}
              onChange={(e) => setFilterFonction(e.target.value)}
              options={fonctions.map((f) => ({ value: f.id, label: f.libelle }))}
              placeholder="Fonction" emptyLabel="Toutes les fonctions"
              className="w-full sm:w-40"
            />
            <BlocPicker mode="filter" campements={campements} blocs={blocs} value={filtreBloc} onChange={setFiltreBloc} />
          </>
        )}
        filtersActive={compterFiltres(filterStatus, filterFonction, filtreBloc.campement_id, filtreBloc.bloc_id)}
        onResetFilters={() => { setFilterStatus(''); setFilterFonction(''); setFiltreBloc({ campement_id: '', bloc_id: '' }); }}
        emptyTitle="Aucune personne"
        emptyAction={<Button size="sm" onClick={() => ouvrir()}><Plus size={14} /> Nouvelle personne</Button>}
      />
      {dialogue}
      {/* « Modifier » dans la fiche : on ferme la fiche puis on ouvre le formulaire de la personne */}
      <PersonneDetail
        personne={detail}
        onClose={() => setDetail(null)}
        onChange={remplacer}
        onModifier={(personne) => { setDetail(null); ouvrir(personne); }}
      />

      <Modal
        open={!!edition}
        onClose={() => setEdition(null)}
        title={enModification ? `Modifier ${edition.prenom} ${edition.nom}` : 'Nouvelle personne'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEdition(null)}>Annuler</Button>
            <Button onClick={handleSubmit} loading={saving}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-4">
          {enModification
            ? <Input label="Matricule" value={edition.matricule} disabled readOnly />
            : <AutoCodeInput service={personnesService} label="Matricule" />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Prénom" required placeholder="Ex: Jean" value={form.prenom}
              onChange={(e) => setForm({ ...form, prenom: e.target.value })} error={formErrors.prenom} />
            <Input label="Nom" required placeholder="Ex: Kouassi" value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })} error={formErrors.nom} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Téléphone" placeholder="Ex: 07 01 23 45 67" value={form.telephone}
              onChange={(e) => setForm({ ...form, telephone: e.target.value })} error={formErrors.telephone} />
            <Autocomplete
              label="Fonction"
              required
              placeholder="Saisir ou choisir une fonction"
              value={form.fonction}
              onChange={(valeur) => setForm((f) => ({ ...f, fonction: valeur }))}
              suggestions={fonctions.map((f) => f.libelle)}
              libelleNouveau="Nouvelle fonction"
              error={formErrors.fonction_id}
              hint="Les fonctions existantes sont proposées pendant la saisie"
            />
          </div>
          <BlocPicker
            campements={campements}
            blocs={blocs}
            value={{ campement_id: form.campement_id, bloc_id: form.bloc_id }}
            onChange={(v) => setForm((f) => ({ ...f, ...v }))}
            required
            errors={formErrors}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Date d'embauche" required type="date" max={today()} value={form.date_embauche}
              onChange={(e) => setForm({ ...form, date_embauche: e.target.value })} error={formErrors.date_embauche} />
          </div>
          {enModification && (
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={form.actif} onChange={(e) => setForm({ ...form, actif: e.target.checked })}
                className="h-4 w-4 rounded-sm border-ink-300 text-forest-600" />
              Personne active
            </label>
          )}
          {/* Champ facultatif replié ; ouvert d'emblée quand l'adresse est déjà renseignée (modification) */}
          <PlusDOptions resume="Adresse" ouvertParDefaut={!!form.adresse}>
            <Input label="Adresse" placeholder="Village, quartier..." value={form.adresse}
              onChange={(e) => setForm({ ...form, adresse: e.target.value })} error={formErrors.adresse} />
          </PlusDOptions>
        </div>
      </Modal>
    </div>
  );
}
