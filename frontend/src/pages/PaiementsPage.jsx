import { useState, useEffect, useMemo } from 'react';
import { HandCoins, Plus, UserCircle, Users, CheckCircle2, User, Trash2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import BlocPicker, { matchBlocFilter, buildBlocFilter } from '@/components/BlocPicker';
import { DataTable, Badge, Button, ErrorState, StatCard, Modal, Input, Select, ConfirmDialog } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { paiementsService, personnesService, salairesService, equipesService, campementsService, blocsService } from '@/services';
import { formatFCFA, formatDate, formatPeriode } from '@/utils/format';
import { showServerErrors, today, currentPeriode } from '@/utils/errors';
import { ROLE, TYPE_PAIEMENT_LABELS } from '@/constants';

const nomComplet = (p) => (p ? `${p.prenom} ${p.nom}` : '—');

const emptyForm = (periode = currentPeriode()) => ({
  mode: 'INDIVIDUEL', personne_id: '', montant: '', equipe_id: '', lignes: [],
  periode, date: today(), type_paiement: 'ESPECES',
});

export default function PaiementsPage() {
  const { user } = useAuth();
  const isBoss = user?.role === ROLE.BIG_BOSS;
  const [data, setData] = useState([]);
  const [personnes, setPersonnes] = useState([]);
  const [salaires, setSalaires] = useState([]);
  const [equipes, setEquipes] = useState([]);
  const [campements, setCampements] = useState([]);
  const [blocs, setBlocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filterMode, setFilterMode] = useState('');
  const [filtreBloc, setFiltreBloc] = useState({ campement_id: '', bloc_id: '' });
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const toast = useToast();

  const load = () => Promise.all([
    paiementsService.getAll(), personnesService.getAll(), salairesService.getAll(),
    equipesService.getAll(), campementsService.getAll(), blocsService.getAll(),
  ]).then(([p, pers, sal, eqs, camps, bl]) => {
    setData(p); setPersonnes(pers); setSalaires(sal); setEquipes(eqs); setCampements(camps); setBlocs(bl);
    setLoading(false);
  }).catch(() => { setError(true); setLoading(false); });

  useEffect(() => { load(); }, []);

  const getPersonne = (id) => personnes.find((x) => x.id === id);
  const getEquipe = (id) => equipes.find((e) => e.id === id);
  const salaireDe = (personneId, periode) => salaires.find((s) => s.personne_id === personneId && s.periode === periode);
  const resteDu = (personneId, periode) => salaireDe(personneId, periode)?.reste ?? 0;

  // Période renseignée automatiquement : la plus récente où il reste quelque chose à payer
  // (les rémunérations arrivent triées de la plus récente à la plus ancienne)
  const periodeParDefaut = () => salaires.find((s) => s.reste > 0)?.periode || salaires[0]?.periode || currentPeriode();
  const periodeAPayer = (personnesIds) => salaires.find((s) => personnesIds.includes(s.personne_id) && s.reste > 0)?.periode;

  const filtered = useMemo(() => {
    const f = buildBlocFilter(filtreBloc, blocs);
    return data.filter((p) => (!filterMode || p.mode === filterMode) && matchBlocFilter(p, f));
  }, [data, filterMode, filtreBloc, blocs]);

  const totalPaye = filtered.reduce((s, p) => s + p.montant, 0);

  // Mode équipe : une ligne par membre actif, montant pré-rempli avec son reste dû
  const lignesEquipe = (equipeId, periode) => (getEquipe(equipeId)?.membres_ids || [])
    .map((id) => getPersonne(id))
    .filter((p) => p && p.actif)
    .map((p) => {
      const reste = resteDu(p.id, periode);
      return { personne_id: p.id, inclus: reste > 0, montant: reste > 0 ? String(reste) : '' };
    });

  const setPeriode = (periode) => setForm((f) => ({
    ...f,
    periode,
    montant: f.mode === 'INDIVIDUEL' && f.personne_id ? String(resteDu(f.personne_id, periode) || '') : f.montant,
    lignes: f.equipe_id ? lignesEquipe(f.equipe_id, periode) : f.lignes,
  }));
  // Choisir une personne ou une équipe sans reste dû sur la période bascule sur sa période à payer
  const choisirPersonne = (id) => setForm((f) => {
    const periode = id && !(resteDu(id, f.periode) > 0) ? (periodeAPayer([id]) || f.periode) : f.periode;
    return { ...f, personne_id: id, periode, montant: id ? String(resteDu(id, periode) || '') : '' };
  });
  const choisirEquipe = (id) => setForm((f) => {
    const membres = getEquipe(id)?.membres_ids || [];
    const resteSurPeriode = membres.some((pid) => resteDu(pid, f.periode) > 0);
    const periode = id && !resteSurPeriode ? (periodeAPayer(membres) || f.periode) : f.periode;
    return { ...f, equipe_id: id, periode, lignes: id ? lignesEquipe(id, periode) : [] };
  });
  const setLigne = (i, patch) => setForm((f) => ({ ...f, lignes: f.lignes.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  const lignesRetenues = form.mode === 'EQUIPE'
    ? form.lignes.filter((l) => l.inclus && Number(l.montant) > 0)
    : (form.personne_id && Number(form.montant) > 0 ? [{ personne_id: form.personne_id, montant: form.montant }] : []);
  const totalForm = lignesRetenues.reduce((s, l) => s + Number(l.montant), 0);

  // Erreurs serveur des lignes (indexées dans l'ordre envoyé) rattachées à chaque personne
  const erreursLignes = useMemo(() => {
    const out = {};
    (Array.isArray(formErrors.lignes) ? formErrors.lignes : []).forEach((err, i) => {
      const ligne = lignesRetenues[i];
      if (ligne && err && Object.keys(err).length) out[ligne.personne_id] = err.montant || err.personne_id;
    });
    return out;
  }, [formErrors.lignes]); // eslint-disable-line react-hooks/exhaustive-deps

  const validate = () => {
    const errs = {};
    if (!/^\d{4}-\d{2}$/.test(form.periode)) errs.periode = 'La période est obligatoire';
    if (form.date > today()) errs.date = 'La date ne peut pas être dans le futur';
    if (form.mode === 'INDIVIDUEL') {
      if (!form.personne_id) errs.personne_id = 'Le bénéficiaire est obligatoire';
      else if (!salaireDe(form.personne_id, form.periode)) errs.personne_id = `Aucune rémunération enregistrée pour ${formatPeriode(form.periode)}`;
      if (!(Number(form.montant) > 0)) errs.montant = 'Le montant doit être supérieur à 0';
      else if (form.personne_id && Number(form.montant) > resteDu(form.personne_id, form.periode)) errs.montant = 'Dépasse le reste dû';
    } else if (!form.equipe_id) errs.equipe_id = "L'équipe est obligatoire";
    else if (lignesRetenues.length === 0) errs.lignes = 'Cochez au moins un membre avec un montant supérieur à 0';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    const commun = { periode: form.periode, date: form.date, type_paiement: form.type_paiement };
    try {
      if (form.mode === 'EQUIPE') {
        const crees = await paiementsService.createGroupe({
          ...commun,
          equipe_id: form.equipe_id,
          lignes: lignesRetenues.map((l) => ({ personne_id: l.personne_id, montant: Number(l.montant) })),
        });
        toast.success(`${crees.length} paiement(s) enregistré(s) pour ${getEquipe(form.equipe_id)?.nom} (${formatFCFA(totalForm)})`);
      } else {
        await paiementsService.create({ ...commun, personne_id: form.personne_id, montant: Number(form.montant) });
        toast.success(`Paiement de ${formatFCFA(totalForm)} enregistré`);
      }
      await load();
      setShowAddModal(false);
      setFormErrors({});
    } catch (err) {
      showServerErrors(err, { setFormErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await paiementsService.remove(deleteTarget.id);
      await load();
      toast.success('Paiement annulé — le reste dû a été recalculé');
    } catch (err) {
      showServerErrors(err, { toast });
    } finally {
      setDeleteTarget(null);
    }
  };

  const columns = [
    { key: 'personne_nom', header: 'Bénéficiaire', sortable: true, render: (row) => (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-forest-50 flex items-center justify-center shrink-0">
          <UserCircle size={16} className="text-forest-600" />
        </div>
        <span className="font-medium text-ink-800">{row.personne_nom}</span>
      </div>
    ) },
    { key: 'montant', header: 'Montant', sortable: true, render: (row) => <span className="tabular-nums font-medium">{formatFCFA(row.montant)}</span> },
    { key: 'mode', header: 'Type', render: (row) => (row.mode === 'EQUIPE'
      ? <Badge className="bg-olive-50 text-olive-700"><Users size={10} /> {row.equipe_nom || 'Équipe'}</Badge>
      : <Badge className="bg-sage-50 text-sage-700"><User size={10} /> Individuel</Badge>) },
    { key: 'type_paiement', header: 'Mode', render: (row) => TYPE_PAIEMENT_LABELS[row.type_paiement] || row.type_paiement },
    { key: 'bloc_code', header: 'Bloc', render: (row) => <span className="font-mono text-xs">{row.bloc_code || '—'}</span> },
    { key: 'periode', header: 'Période', sortable: true, render: (row) => formatPeriode(row.periode) },
    { key: 'date', header: 'Date', sortable: true, render: (row) => formatDate(row.date) },
  ];

  const ActionsCell = isBoss ? ({ row }) => (
    <button onClick={() => setDeleteTarget(row)} className="p-1.5 rounded-lg text-ink-400 hover:bg-earth-50 hover:text-earth-600" aria-label="Annuler le paiement">
      <Trash2 size={15} />
    </button>
  ) : undefined;

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  const equipeOptions = equipes.filter((e) => e.actif).map((e) => ({ value: e.id, label: `${e.nom} (${e.nb_membres} membres)` }));
  // Bénéficiaires : rémunération sur la période choisie, ou reste à payer sur une autre période
  const personnesAPayer = new Set(salaires.filter((s) => s.reste > 0).map((s) => s.personne_id));
  const personnesAvecSalaire = personnes.filter((p) => p.actif && (salaireDe(p.id, form.periode) || personnesAPayer.has(p.id)));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Paiements"
        subtitle="Paiements des rémunérations, individuels ou par équipe"
        icon={HandCoins}
        actions={<Button size="sm" onClick={() => { setForm(emptyForm(periodeParDefaut())); setFormErrors({}); setShowAddModal(true); }}><Plus size={16} /> Nouveau paiement</Button>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatCard label="Total versé" value={formatFCFA(totalPaye)} icon={HandCoins} accent="leaf" />
        <StatCard label="Nombre de paiements" value={filtered.length} icon={CheckCircle2} accent="forest" />
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          value={filterMode}
          onChange={(e) => setFilterMode(e.target.value)}
          options={[{ value: 'INDIVIDUEL', label: 'Individuels' }, { value: 'EQUIPE', label: 'Par équipe' }]}
          placeholder="Tous les paiements"
          className="w-full sm:w-44"
        />
        <BlocPicker mode="filter" campements={campements} blocs={blocs} value={filtreBloc} onChange={setFiltreBloc} />
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        searchPlaceholder="Rechercher un bénéficiaire..."
        searchKeys={['personne_nom', 'matricule', 'periode', 'equipe_nom']}
        actions={ActionsCell}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Annuler le paiement"
        message={`Annuler le paiement de ${formatFCFA(deleteTarget?.montant)} à ${deleteTarget?.personne_nom} ? Le reste dû sera recalculé.`}
      />

      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Nouveau paiement"
        size="lg"
        footer={
          <>
            <span className="mr-auto text-sm text-ink-600">
              Total : <strong className="tabular-nums text-ink-800">{formatFCFA(totalForm)}</strong>
              {form.mode === 'EQUIPE' && <span className="text-ink-400"> · {lignesRetenues.length} personne(s)</span>}
            </span>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Annuler</Button>
            <Button onClick={handleSubmit} loading={saving}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Choix du type de paiement */}
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Type de paiement">
            {[
              { value: 'INDIVIDUEL', label: 'Individuel', icon: User, desc: 'Une seule personne' },
              { value: 'EQUIPE', label: 'Par équipe', icon: Users, desc: 'Tous les membres en une fois' },
            ].map((opt) => {
              const Icon = opt.icon;
              const active = form.mode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => { setForm((f) => ({ ...f, mode: opt.value })); setFormErrors({}); }}
                  className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors ${
                    active ? 'border-forest-500 bg-forest-50' : 'border-ink-200 hover:bg-cream-50'
                  }`}
                >
                  <Icon size={18} className={active ? 'text-forest-700' : 'text-ink-400'} />
                  <span>
                    <span className={`block text-sm font-medium ${active ? 'text-forest-800' : 'text-ink-700'}`}>{opt.label}</span>
                    <span className="block text-xs text-ink-400">{opt.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Période"
              required
              type="month"
              value={form.periode}
              onChange={(e) => setPeriode(e.target.value)}
              error={formErrors.periode}
              hint="Renseignée selon le reste à payer"
            />
            <Input label="Date" type="date" max={today()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} error={formErrors.date} />
            <Select
              label="Mode de paiement"
              required
              options={Object.entries(TYPE_PAIEMENT_LABELS).map(([value, label]) => ({ value, label }))}
              placeholder=""
              value={form.type_paiement}
              onChange={(e) => setForm({ ...form, type_paiement: e.target.value || 'ESPECES' })}
              error={formErrors.type_paiement}
            />
          </div>

          {form.mode === 'INDIVIDUEL' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="Bénéficiaire"
                required
                options={personnesAvecSalaire.map((p) => ({ value: p.id, label: `${nomComplet(p)} — ${p.matricule}` }))}
                placeholder={personnesAvecSalaire.length ? 'Rechercher une personne' : 'Aucune rémunération sur la période'}
                value={form.personne_id}
                onChange={(e) => choisirPersonne(e.target.value)}
                error={formErrors.personne_id}
              />
              <Input
                label="Montant (FCFA)"
                required
                type="number"
                min="0"
                placeholder="0"
                value={form.montant}
                onChange={(e) => setForm({ ...form, montant: e.target.value })}
                error={formErrors.montant}
                hint={form.personne_id ? `Reste dû sur la période : ${formatFCFA(resteDu(form.personne_id, form.periode))}` : undefined}
              />
            </div>
          ) : (
            <>
              <Select
                label="Équipe"
                required
                options={equipeOptions}
                placeholder="Rechercher une équipe"
                value={form.equipe_id}
                onChange={(e) => choisirEquipe(e.target.value)}
                error={formErrors.equipe_id}
              />
              {form.equipe_id && (
                <div className="rounded-lg border border-ink-100 overflow-hidden">
                  <div className="flex items-center justify-between bg-cream-50/60 px-3 py-2 text-xs text-ink-500">
                    <span>Membres — montant pré-rempli avec le reste dû</span>
                    <button
                      type="button"
                      className="text-forest-700 hover:underline"
                      onClick={() => {
                        const tous = form.lignes.every((l) => l.inclus);
                        setForm((f) => ({ ...f, lignes: f.lignes.map((l) => ({ ...l, inclus: !tous })) }));
                      }}
                    >
                      {form.lignes.every((l) => l.inclus) ? 'Tout décocher' : 'Tout cocher'}
                    </button>
                  </div>
                  {form.lignes.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-ink-400">Aucun membre actif dans cette équipe.</p>
                  ) : (
                    <ul className="divide-y divide-ink-100 max-h-72 overflow-y-auto">
                      {form.lignes.map((l, i) => {
                        const p = getPersonne(l.personne_id);
                        const salaire = salaireDe(l.personne_id, form.periode);
                        const erreur = erreursLignes[l.personne_id];
                        return (
                          <li key={l.personne_id} className={`px-3 py-2 ${l.inclus ? '' : 'opacity-50'}`}>
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={l.inclus}
                                disabled={!salaire}
                                onChange={(e) => setLigne(i, { inclus: e.target.checked })}
                                className="h-4 w-4 rounded border-ink-300 text-forest-600"
                                aria-label={`Inclure ${nomComplet(p)}`}
                              />
                              <span className="flex-1 min-w-0">
                                <span className="block truncate text-sm text-ink-800">
                                  {nomComplet(p)}
                                  {getEquipe(form.equipe_id)?.chef_id === p?.id && <span className="ml-1 text-xs text-olive-700">(chef)</span>}
                                </span>
                                <span className="block text-xs text-ink-400">
                                  {salaire ? `Reste dû : ${formatFCFA(salaire.reste)}` : 'Aucune rémunération sur la période'}
                                </span>
                              </span>
                              <input
                                type="number"
                                min="0"
                                value={l.montant}
                                disabled={!l.inclus}
                                onChange={(e) => setLigne(i, { montant: e.target.value })}
                                placeholder="0"
                                className={`input-base w-28 sm:w-36 text-right tabular-nums ${erreur ? 'border-earth-400' : ''}`}
                                aria-label={`Montant pour ${nomComplet(p)}`}
                              />
                            </div>
                            {erreur && <p className="mt-1 pl-7 text-xs text-earth-600">{erreur}</p>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
              {typeof formErrors.lignes === 'string' && <p className="text-xs text-earth-600">{formErrors.lignes}</p>}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
