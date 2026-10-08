import { useState, useEffect } from 'react';
import { UserCircle, Plus, User } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { DataTable, Badge, Button, ErrorState, Modal, Input, Select } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { utilisateursService, personnesService } from '@/services';
import { formatDateTime } from '@/utils/format';
import { showServerErrors } from '@/utils/errors';
import { ROLE_LABELS, ROLE } from '@/constants';

const EMPTY_FORM = { personne_id: '', email: '', role: '', password: '' };

export default function UtilisateursPage() {
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [personnes, setPersonnes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    Promise.all([utilisateursService.getAll(), personnesService.getAll()])
      .then(([u, p]) => { setData(u); setPersonnes(p); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // Un compte par personne : on ne propose que les personnes actives sans compte
  const avecCompte = new Set(data.map((u) => u.personne_id));
  const personnesDisponibles = personnes.filter((p) => p.actif && !avecCompte.has(p.id));

  const validate = () => {
    const errs = {};
    if (!form.personne_id) errs.personne_id = 'La personne est obligatoire';
    if (!form.email.trim()) errs.email = "L'email est obligatoire";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Email invalide';
    if (!form.role) errs.role = 'Le rôle est obligatoire';
    if (form.password.length < 8) errs.password = 'Le mot de passe doit contenir au moins 8 caractères';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const item = await utilisateursService.create({ ...form, email: form.email.trim().toLowerCase() });
      setData((d) => [item, ...d]);
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      setFormErrors({});
      toast.success(`Compte créé pour ${item.nom}`);
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
      toast.success(updated.actif ? 'Compte réactivé' : 'Compte désactivé');
    } catch (err) {
      showServerErrors(err, { toast });
    }
  };

  const columns = [
    { key: 'nom', header: 'Nom', sortable: true, render: (row) => (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-forest-50 flex items-center justify-center shrink-0">
          <User size={16} className="text-forest-600" />
        </div>
        <span className="font-medium text-ink-800">{row.nom}</span>
      </div>
    ) },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Rôle', render: (row) => (
      <Badge className={row.role === ROLE.BIG_BOSS ? 'bg-forest-50 text-forest-700' : 'bg-sage-50 text-sage-700'}>
        {ROLE_LABELS[row.role] || row.role}
      </Badge>
    ) },
    { key: 'actif', header: 'Statut', render: (row) => <Badge status={row.actif ? 'active' : 'inactive'}>{row.actif ? 'Actif' : 'Inactif'}</Badge> },
    { key: 'derniere_connexion', header: 'Dernière connexion', sortable: true, render: (row) => formatDateTime(row.derniere_connexion) },
  ];

  const ActionsCell = ({ row }) => (row.id === String(user?.id)
    ? <span className="text-xs text-ink-400">Vous</span>
    : <Button variant="outline" size="sm" onClick={() => toggleActif(row)}>{row.actif ? 'Désactiver' : 'Activer'}</Button>);

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Utilisateurs"
        subtitle="Comptes d'accès et rôles"
        icon={UserCircle}
        actions={<Button size="sm" onClick={() => { setForm(EMPTY_FORM); setFormErrors({}); setShowAddModal(true); }}><Plus size={16} /> Nouvel utilisateur</Button>}
      />
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchPlaceholder="Rechercher un utilisateur..."
        searchKeys={['nom', 'email']}
        actions={ActionsCell}
      />

      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Nouvel utilisateur"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Annuler</Button>
            <Button onClick={handleSubmit} loading={saving}>Créer</Button>
          </>
        }
      >
        <div className="space-y-4">
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
              { value: ROLE.BIG_BOSS, label: ROLE_LABELS[ROLE.BIG_BOSS] },
              { value: ROLE.SUPERVISOR, label: ROLE_LABELS[ROLE.SUPERVISOR] },
            ]}
            placeholder="Choisir un rôle"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            error={formErrors.role}
          />
          <Input
            label="Mot de passe"
            required
            type="password"
            placeholder="8 caractères minimum, pas uniquement des chiffres"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            error={formErrors.password}
          />
        </div>
      </Modal>
    </div>
  );
}
