import { useState, useEffect, useMemo } from 'react';
import { ShoppingBag, Plus, Phone, Scale, Users, HandCoins, Trash2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import AutoCodeInput from '@/components/AutoCodeInput';
import BlocPicker, { matchBlocFilter, buildBlocFilter } from '@/components/BlocPicker';
import { DataTable, Badge, Button, ErrorState, StatCard, Modal, Input, Select, ConfirmDialog } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { achatsParticuliersService, particuliersService, campementsService, blocsService } from '@/services';
import { formatFCFA, formatDate, formatNumber } from '@/utils/format';
import { showServerErrors, today } from '@/utils/errors';
import { ROLE, STATUT_DEPENSE_LABELS, TYPE_PAIEMENT_LABELS, CATEGORIE_ACHAT_PARTICULIERS } from '@/constants';

const emptyForm = () => ({
  particulier_id: '', particulier_nom: '', particulier_telephone: '', designation: '', poids: '', unite_poids: 'kg',
  prix_unitaire: '', date_achat: today(), campement_id: '', bloc_id: '', montant_verse: '', type_paiement: 'ESPECES',
});
const UNITES = [
  { value: 'kg', label: 'Kilogrammes (kg)' },
  { value: 't', label: 'Tonnes (t)' },
  { value: 'régime', label: 'Régimes' },
  { value: 'sac', label: 'Sacs' },
  { value: 'unité', label: 'Unités' },
];
const TYPES_PAIEMENT = Object.entries(TYPE_PAIEMENT_LABELS).map(([value, label]) => ({ value, label }));

export default function ParticuliersPage() {
  const { user } = useAuth();
  const isBoss = user?.role === ROLE.BIG_BOSS;
  const [achats, setAchats] = useState([]);
  const [particuliers, setParticuliers] = useState([]);
  const [campements, setCampements] = useState([]);
  const [blocs, setBlocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filtreBloc, setFiltreBloc] = useState({ campement_id: '', bloc_id: '' });
  const [filterStatut, setFilterStatut] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [aRegler, setARegler] = useState(null);
  const [reglement, setReglement] = useState({ montant: '', date: today(), type_paiement: 'ESPECES' });
  const [reglementErrors, setReglementErrors] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const toast = useToast();

  const load = () => Promise.all([
    achatsParticuliersService.getAll(), particuliersService.getAll(), campementsService.getAll(), blocsService.getAll(),
  ]).then(([a, p, c, b]) => {
    setAchats(a); setParticuliers(p); setCampements(c); setBlocs(b); setLoading(false);
  }).catch(() => { setError(true); setLoading(false); });

  useEffect(() => { load(); }, []);

  // Montant calculé automatiquement : quantité × prix unitaire (recalculé par le serveur)
  const montant = Math.round((Number(form.poids) || 0) * (Number(form.prix_unitaire) || 0) * 100) / 100;

  const filtered = useMemo(() => {
    const f = buildBlocFilter(filtreBloc, blocs);
    return achats.filter((a) => (!filterStatut || a.statut === filterStatut) && matchBlocFilter(a, f));
  }, [achats, filtreBloc, filterStatut, blocs]);

  const totalAchats = filtered.reduce((s, a) => s + a.montant_total, 0);
  const totalReste = filtered.reduce((s, a) => s + a.reste, 0);
  const totalKg = filtered.filter((a) => a.unite_poids === 'kg').reduce((s, a) => s + a.poids, 0);
  const nbVendeurs = new Set(filtered.map((a) => a.particulier_id)).size;

  const openCreate = () => { setForm(emptyForm()); setFormErrors({}); setShowAddModal(true); };

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
    if (form.montant_verse !== '' && (Number(form.montant_verse) < 0 || Number(form.montant_verse) > montant)) errs.montant_verse = `Entre 0 et ${formatFCFA(montant)}`;
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const achat = await achatsParticuliersService.create({
        ...(form.particulier_id ? { particulier_id: form.particulier_id } : { particulier_nom: form.particulier_nom.trim() }),
        particulier_telephone: form.particulier_telephone.trim(),
        designation: form.designation.trim(),
        poids: Number(form.poids),
        unite_poids: form.unite_poids,
        prix_unitaire: Number(form.prix_unitaire),
        date_achat: form.date_achat,
        bloc_id: form.bloc_id,
        montant_verse: form.montant_verse === '' ? montant : Number(form.montant_verse),
        type_paiement: form.type_paiement,
      });
      await load();
      setShowAddModal(false);
      toast.success(`Achat ${achat.reference} enregistré (${formatFCFA(achat.montant_total)}) — ajouté aux dépenses`);
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
      setAchats((list) => list.map((a) => (a.id === maj.id ? maj : a)));
      toast.success(`Paiement enregistré — ${maj.reference} : ${STATUT_DEPENSE_LABELS[maj.statut].toLowerCase()}`);
      setARegler(null);
    } catch (err) {
      showServerErrors(err, { setFormErrors: setReglementErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await achatsParticuliersService.remove(deleteTarget.id);
      setAchats((list) => list.filter((a) => a.id !== deleteTarget.id));
      toast.success(`Achat ${deleteTarget.reference} supprimé (ainsi que sa dépense)`);
    } catch (err) {
      showServerErrors(err, { toast });
    } finally {
      setDeleteTarget(null);
    }
  };

  const columns = [
    { key: 'reference', header: 'Réf.', sortable: true, render: (row) => <span className="font-mono text-xs font-medium text-forest-700">{row.reference}</span> },
    { key: 'date_achat', header: 'Date', sortable: true, render: (row) => formatDate(row.date_achat) },
    { key: 'particulier_nom', header: 'Vendeur', sortable: true, render: (row) => <span className="font-medium text-ink-800">{row.particulier_nom}</span> },
    { key: 'particulier_telephone', header: 'Téléphone', render: (row) => (row.particulier_telephone
      ? <span className="flex items-center gap-1 text-ink-600"><Phone size={12} />{row.particulier_telephone}</span>
      : '—') },
    { key: 'designation', header: 'Produit', sortable: true },
    { key: 'poids', header: 'Poids / Qté', sortable: true, render: (row) => <span className="tabular-nums">{formatNumber(row.poids)} {row.unite_poids}</span> },
    { key: 'prix_unitaire', header: 'Prix unit.', render: (row) => <span className="tabular-nums">{formatFCFA(row.prix_unitaire)}</span> },
    { key: 'montant_total', header: 'Montant', sortable: true, render: (row) => <span className="tabular-nums font-medium">{formatFCFA(row.montant_total)}</span> },
    { key: 'reste', header: 'Reste dû', sortable: true, render: (row) => <span className={`tabular-nums ${row.reste > 0 ? 'text-earth-600' : 'text-ink-400'}`}>{formatFCFA(row.reste)}</span> },
    { key: 'bloc_code', header: 'Bloc', render: (row) => <span className="font-mono text-xs">{row.bloc_code}</span> },
    { key: 'statut', header: 'Paiement', render: (row) => <Badge status={row.statut}>{STATUT_DEPENSE_LABELS[row.statut]}</Badge> },
  ];

  const ActionsCell = ({ row }) => (
    <div className="flex items-center justify-end gap-1">
      {row.reste > 0 && (
        <Button variant="outline" size="sm" onClick={() => openReglement(row)}><HandCoins size={14} /> Régler</Button>
      )}
      {isBoss && (
        <button onClick={() => setDeleteTarget(row)} className="p-1.5 rounded-lg text-ink-400 hover:bg-earth-50 hover:text-earth-600" aria-label="Supprimer">
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Achats particuliers"
        subtitle="Produits achetés auprès de particuliers — comptés en dépenses"
        icon={ShoppingBag}
        actions={<Button size="sm" onClick={openCreate}><Plus size={16} /> Nouvel achat</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total des achats" value={formatFCFA(totalAchats)} icon={ShoppingBag} accent="forest" />
        <StatCard label="Reste à payer" value={formatFCFA(totalReste)} icon={HandCoins} accent="earth" />
        <StatCard label="Poids acheté" value={formatNumber(totalKg)} unit="kg" icon={Scale} accent="olive" />
        <StatCard label="Vendeurs" value={nbVendeurs} icon={Users} accent="leaf" />
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          value={filterStatut}
          onChange={(e) => setFilterStatut(e.target.value)}
          options={Object.entries(STATUT_DEPENSE_LABELS).map(([value, label]) => ({ value, label }))}
          placeholder="Tous les paiements"
          className="w-full sm:w-48"
        />
        <BlocPicker mode="filter" campements={campements} blocs={blocs} value={filtreBloc} onChange={setFiltreBloc} />
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        searchPlaceholder="Rechercher un vendeur, un produit..."
        searchKeys={['reference', 'particulier_nom', 'particulier_telephone', 'designation']}
        emptyTitle="Aucun achat enregistré"
        actions={ActionsCell}
      />

      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Nouvel achat auprès d'un particulier"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Annuler</Button>
            <Button onClick={handleSubmit} loading={saving}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <AutoCodeInput service={achatsParticuliersService} label="Référence" />
            <Select
              label="Nom du vendeur"
              required
              creatable
              onCreate={nouveauVendeur}
              options={[
                ...particuliers.map((p) => ({ value: p.id, label: `${p.nom} ${p.prenom || ''}`.trim() })),
                ...(form.particulier_nom ? [{ value: '__nouveau__', label: `${form.particulier_nom} (nouveau)` }] : []),
              ]}
              placeholder="Tapez un nom..."
              value={form.particulier_id || (form.particulier_nom ? '__nouveau__' : '')}
              onChange={(e) => {
                if (e.target.value === '__nouveau__') return;
                if (e.target.value) choisirVendeur(e.target.value); else nouveauVendeur('');
              }}
              error={formErrors.particulier_nom || formErrors.particulier_id}
              hint={form.particulier_nom ? 'Nouveau vendeur : il sera ajouté à la liste.' : undefined}
              className="sm:col-span-2"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Téléphone"
              placeholder="Ex: 07 01 23 45 67"
              value={form.particulier_telephone}
              onChange={(e) => setForm({ ...form, particulier_telephone: e.target.value })}
              error={formErrors.particulier_telephone}
            />
            <Input
              label="Produit acheté"
              required
              placeholder="Ex: Régimes de palmier"
              value={form.designation}
              onChange={(e) => setForm({ ...form, designation: e.target.value })}
              error={formErrors.designation}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Input
              label="Poids / Quantité"
              required
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={form.poids}
              onChange={(e) => setForm({ ...form, poids: e.target.value })}
              error={formErrors.poids}
            />
            <Select
              label="Unité"
              options={UNITES}
              placeholder=""
              value={form.unite_poids}
              onChange={(e) => setForm({ ...form, unite_poids: e.target.value || 'kg' })}
            />
            <Input
              label="Prix unitaire (FCFA)"
              required
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={form.prix_unitaire}
              onChange={(e) => setForm({ ...form, prix_unitaire: e.target.value })}
              error={formErrors.prix_unitaire}
              className="col-span-2 sm:col-span-1"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-forest-50 px-4 py-3">
            <span className="text-sm text-forest-800">
              Montant total
              <span className="block text-xs text-forest-600">
                {formatNumber(Number(form.poids) || 0)} {form.unite_poids} × {formatFCFA(Number(form.prix_unitaire) || 0)}
              </span>
            </span>
            <span className="text-lg font-bold text-forest-800 tabular-nums">{formatFCFA(montant)}</span>
          </div>

          <BlocPicker
            campements={campements}
            blocs={blocs}
            value={form}
            onChange={(v) => setForm({ ...form, ...v })}
            required
            errors={formErrors}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Date d'achat"
              required
              type="date"
              max={today()}
              value={form.date_achat}
              onChange={(e) => setForm({ ...form, date_achat: e.target.value })}
              error={formErrors.date_achat}
            />
            <Input
              label="Montant versé (FCFA)"
              type="number"
              min="0"
              placeholder={String(montant)}
              value={form.montant_verse}
              onChange={(e) => setForm({ ...form, montant_verse: e.target.value })}
              error={formErrors.montant_verse}
              hint="Vide = payé comptant ; 0 = rien versé"
            />
            <Select
              label="Mode de paiement"
              options={TYPES_PAIEMENT}
              placeholder=""
              value={form.type_paiement}
              onChange={(e) => setForm({ ...form, type_paiement: e.target.value || 'ESPECES' })}
            />
          </div>

          <p className="text-xs text-ink-400">
            L'achat est aussi enregistré dans les dépenses, catégorie « {CATEGORIE_ACHAT_PARTICULIERS} ».
          </p>
        </div>
      </Modal>

      <Modal
        open={!!aRegler}
        onClose={() => setARegler(null)}
        title={`Régler l'achat ${aRegler?.reference || ''}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setARegler(null)}>Annuler</Button>
            <Button onClick={handleReglement} loading={saving}>Enregistrer le paiement</Button>
          </>
        }
      >
        {aRegler && (
          <div className="space-y-4">
            <p className="text-sm text-ink-600">
              {aRegler.particulier_nom} — {aRegler.designation}<br />
              Montant {formatFCFA(aRegler.montant_total)}, déjà payé {formatFCFA(aRegler.montant_paye)}, <strong>reste {formatFCFA(aRegler.reste)}</strong>
            </p>
            <Input
              label="Montant (FCFA)"
              required
              type="number"
              min="0"
              max={aRegler.reste}
              value={reglement.montant}
              onChange={(e) => setReglement({ ...reglement, montant: e.target.value })}
              error={reglementErrors.montant}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Date" type="date" max={today()} value={reglement.date} onChange={(e) => setReglement({ ...reglement, date: e.target.value })} error={reglementErrors.date} />
              <Select label="Mode" options={TYPES_PAIEMENT} placeholder="" value={reglement.type_paiement} onChange={(e) => setReglement({ ...reglement, type_paiement: e.target.value || 'ESPECES' })} />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        message={`Supprimer l'achat ${deleteTarget?.reference} ? Ses paiements et la dépense associée seront aussi supprimés.`}
      />
    </div>
  );
}
