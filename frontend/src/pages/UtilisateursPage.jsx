import { useState, useEffect } from 'react';
import { UserCircle, Plus, User, Power, PowerOff, Eye, LockOpen } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import RowActions from '@/components/RowActions';
import SuiviUtilisateur from '@/components/SuiviUtilisateur';
import { DataTable, Badge, Button, ErrorState, Modal, Input, Select, MultiSelect } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { utilisateursService, personnesService, campementsService } from '@/services';
import { formatDateTime } from '@/utils/format';
import { showServerErrors } from '@/utils/errors';
import { ROLE_LABELS, ROLE } from '@/constants';

// Création : le Big Boss saisit la personne (prénom, nom) et son compte d'un seul coup ; un superviseur est responsable de campements ; « existante » rattache le compte à
// une personne déjà enregistrée
const EMPTY_FORM = {
  prenom: '', nom_personne: '', telephone: '', campements_ids: [],
  personne_id: '', email: '', role: ROLE.SUPERVISOR, password: '',
};

export default function UtilisateursPage() {
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [personnes, setPersonnes] = useState([]);
  const [campements, setCampements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [edition, setEdition] = useState(null); // null fermé · 'nouveau' · compte modifié
  const [existante, setExistante] = useState(false); // création : rattacher à une personne déjà enregistrée
  const [suivi, setSuivi] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    Promise.all([utilisateursService.getAll(), personnesService.getAll(), campementsService.getAll()])
      .then(([u, p, c]) => { setData(u); setPersonnes(p); setCampements(c); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const enModification = edition && edition !== 'nouveau';

  const ouvrir = (compte = null) => {
    setSuivi(null);
    setForm(compte ? { ...EMPTY_FORM, personne_id: compte.personne_id, email: compte.email, role: compte.role } : EMPTY_FORM);
    setFormErrors({});
    setExistante(false);
    setEdition(compte || 'nouveau');
  };

  // Un compte par personne : on ne propose que les personnes actives sans compte
  const avecCompte = new Set(data.map((u) => u.personne_id));
  const personnesDisponibles = personnes.filter((p) => p.actif && !avecCompte.has(p.id));

  const validate = () => {
    const errs = {};
    if (!enModification) {
      if (existante) {
        if (!form.personne_id) errs.personne_id = 'La personne est obligatoire';
      } else {
        if (!form.prenom.trim()) errs.prenom = 'Le prénom est obligatoire';
        if (!form.nom_personne.trim()) errs.nom_personne = 'Le nom est obligatoire';
      }
    }
    if (!form.email.trim()) errs.email = "L'email est obligatoire";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Email invalide';
    if (!form.role) errs.role = 'Le rôle est obligatoire';
    if ((!enModification || form.password) && form.password.length < 10) errs.password = 'Le mot de passe doit contenir au moins 10 caractères (majuscule, minuscule et chiffre)';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const email = form.email.trim().toLowerCase();
      if (enModification) {
        const payload = { email, role: form.role, ...(form.password ? { password: form.password } : {}),
          ...(form.campements_ids.length ? { campements_ids: form.campements_ids } : {}) };
        const item = await utilisateursService.update(edition.id, payload);
        setData((d) => d.map((x) => (x.id === item.id ? item : x)));
        toast.success(form.password ? `Compte de ${item.nom} modifié (nouveau mot de passe)` : `Compte de ${item.nom} modifié`);
      } else {
        const payload = existante
          ? { personne_id: form.personne_id, email, role: form.role, password: form.password, campements_ids: form.campements_ids }
          : {
            prenom: form.prenom.trim(), nom_personne: form.nom_personne.trim(), telephone: form.telephone.trim(),
            campements_ids: form.campements_ids, email, role: form.role, password: form.password,
          };
        const item = await utilisateursService.create(payload);
        setData((d) => [item, ...d]);
        if (!existante) personnesService.getAll().then(setPersonnes).catch(() => {}); // la personne créée rejoint le personnel
        toast.success(`Compte créé pour ${item.nom}`);
      }
      setEdition(null);
      setForm(EMPTY_FORM);
      setFormErrors({});
    } catch (err) {
      showServerErrors(err, { setFormErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  const toggleActif = async (row) => {
    try {
      const updated = await utilisateursService.update(row.id, { actif: !row.actif });
      setData((d) => d.map((x) => (x.id === row.id ? updated : x)));
      setSuivi((s) => (s && s.id === row.id ? updated : s));
      toast.success(updated.actif ? 'Compte réactivé' : 'Compte désactivé');
    } catch (err) {
      showServerErrors(err, { toast });
    }
  };

  const debloquer = async (row) => {
    try {
      const r = await utilisateursService.debloquer(row.id);
      toast.success(r.echecs_effaces ? `Connexion de ${row.nom} débloquée` : `${row.nom} n'était pas bloqué(e)`);
    } catch (err) {
      showServerErrors(err, { toast });
    }
  };

  const columns = [
    { key: 'nom', header: 'Utilisateur', sortable: true, render: (row) => (
      <div className="flex items-center gap-2.5">
        <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-50 md:flex">
          <User size={16} className="text-forest-600" />
        </div>
        <span className="min-w-0">
          <span className="font-medium text-ink-800">{row.nom}</span>
          <span className="block text-xs text-ink-500">{row.email}</span>
        </span>
      </div>
    ) },
    { key: 'role', header: 'Rôle', render: (row) => (
      <Badge status={row.role === ROLE.BIG_BOSS ? 'done' : 'planned'}>
        {ROLE_LABELS[row.role] || row.role}
      </Badge>
    ) },
    { key: 'campements', header: 'Campements gérés', mobile: false, render: (row) => (row.campements?.length
      ? <span className="text-ink-700">{row.campements.map((c) => c.nom).join(', ')}</span>
      : <span className="text-ink-400">{row.role === ROLE.SUPERVISOR ? 'Aucun pour le moment' : '—'}</span>) },
    { key: 'actif', header: 'Statut', render: (row) => <Badge status={row.actif ? 'active' : 'inactive'}>{row.actif ? 'Actif' : 'Inactif'}</Badge> },
    { key: 'derniere_connexion', header: 'Dernière connexion', sortable: true, render: (row) => <span className="tabular-nums">{formatDateTime(row.derniere_connexion)}</span> },
  ];

  const moi = (row) => row.id === String(user?.id);

  // Un compte ne se supprime pas (traçabilité du journal) : il se désactive
  const ActionsCell = ({ row }) => (
    <RowActions
      onEdit={() => ouvrir(row)}
      menu={[
        { label: 'Suivre l\'activité', icon: Eye, onClick: () => setSuivi(row) },
        { label: 'Débloquer la connexion', icon: LockOpen, onClick: () => debloquer(row) },
        !moi(row) && { label: row.actif ? 'Désactiver le compte' : 'Réactiver le compte', icon: row.actif ? PowerOff : Power, onClick: () => toggleActif(row) },
      ]}
    >
      {moi(row) && <span className="mr-1 text-xs text-ink-500">Vous</span>}
    </RowActions>
  );

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Utilisateurs"
        subtitle="Comptes d'accès, superviseurs et suivi de leur activité"
        icon={UserCircle}
        actions={<Button size="sm" onClick={() => ouvrir()}><Plus size={16} /> Nouvel utilisateur</Button>}
      />
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchPlaceholder="Rechercher un utilisateur..."
        searchKeys={['nom', 'email']}
        onRowClick={(row) => setSuivi(row)}
        actions={ActionsCell}
        emptyAction={<Button size="sm" onClick={() => ouvrir()}><Plus size={14} /> Nouvel utilisateur</Button>}
      />

      <SuiviUtilisateur
        compte={suivi}
        onClose={() => setSuivi(null)}
        onModifier={(c) => ouvrir(c)}
        onToggle={toggleActif}
        estMoi={suivi ? moi(suivi) : false}
      />

      <Modal
        open={!!edition}
        onClose={() => setEdition(null)}
        title={enModification ? `Modifier le compte de ${edition.nom}` : 'Nouvel utilisateur'}
        footer={
          <>
            <Button variant="outline" onClick={() => setEdition(null)}>Annuler</Button>
            <Button onClick={handleSubmit} loading={saving}>{enModification ? 'Enregistrer' : 'Créer le compte'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {enModification && <Input label="Personne" value={edition.nom} disabled readOnly />}
          {!enModification && !existante && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input label="Prénom" required value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} error={formErrors.prenom} />
                <Input label="Nom" required value={form.nom_personne} onChange={(e) => setForm({ ...form, nom_personne: e.target.value })} error={formErrors.nom_personne} />
              </div>
              <Input
                label="Téléphone"
                type="tel"
                placeholder="Ex: 07 00 00 00 00"
                value={form.telephone}
                onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                error={formErrors.telephone}
                hint="Facultatif. La personne est aussi ajoutée au personnel."
              />
            </>
          )}
          {!enModification && existante && (
            <Select
              label="Personne"
              required
              options={personnesDisponibles.map((p) => ({ value: p.id, label: `${p.prenom} ${p.nom} — ${p.matricule}` }))}
              placeholder="Rechercher une personne"
              value={form.personne_id}
              onChange={(e) => setForm({ ...form, personne_id: e.target.value })}
              error={formErrors.personne_id}
              hint="Le compte est rattaché à une personne du personnel."
            />
          )}
          {!enModification && (
            <button type="button" onClick={() => { setExistante((v) => !v); setFormErrors({}); }}
              className="text-xs font-medium text-forest-700 hover:underline">
              {existante ? 'Créer une nouvelle personne à la place' : 'Rattacher à une personne déjà enregistrée'}
            </button>
          )}
          <Input
            label="Email (identifiant de connexion)"
            required
            type="email"
            placeholder="Ex: t.moussa@allakro.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            error={formErrors.email}
          />
          <Select
            label="Rôle"
            required
            options={[
              { value: ROLE.SUPERVISOR, label: ROLE_LABELS[ROLE.SUPERVISOR] },
              { value: ROLE.BIG_BOSS, label: ROLE_LABELS[ROLE.BIG_BOSS] },
            ]}
            placeholder="Choisir un rôle"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            error={formErrors.role}
          />
          {form.role === ROLE.SUPERVISOR && (
            <MultiSelect
              label={enModification ? 'Confier des campements supplémentaires' : 'Campements à gérer (facultatif)'}
              options={campements.filter((c) => c.actif && !(enModification && edition.campements?.some((x) => x.id === c.id)))
                .map((c) => ({ value: c.id, label: c.nom, hint: c.responsable_nom ? `actuellement : ${c.responsable_nom}` : '' }))}
              value={form.campements_ids}
              onChange={(ids) => setForm({ ...form, campements_ids: ids })}
              placeholder="Rechercher un campement..."
              error={formErrors.campements_ids}
              hint="Le responsable gère tous les blocs de ses campements et peut en gérer plusieurs. Un campement confié change de responsable."
            />
          )}
          <Input
            label={enModification ? 'Nouveau mot de passe' : 'Mot de passe'}
            required={!enModification}
            type="password"
            autoComplete="new-password"
            hint={enModification ? 'Laissez vide pour garder le mot de passe actuel.' : undefined}
            placeholder="10 caractères minimum, avec majuscule, minuscule et chiffre"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            error={formErrors.password}
          />
        </div>
      </Modal>
    </div>
  );
}
