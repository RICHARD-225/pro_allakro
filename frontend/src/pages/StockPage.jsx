import { useState, useEffect, useMemo } from 'react';
import { Package, Plus, AlertTriangle, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import AutoCodeInput from '@/components/AutoCodeInput';
import BlocPicker, { matchBlocFilter, buildBlocFilter } from '@/components/BlocPicker';
import { DataTable, Badge, Button, ErrorState, StatCard, Card, Modal, Input, Select } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { produitsService, mouvementsService, campementsService, blocsService } from '@/services';
import { formatDate, formatFCFA, formatNumber } from '@/utils/format';
import { showServerErrors, today } from '@/utils/errors';

const CATEGORIES = ['Phytosanitaire', 'Engrais', 'Carburant', 'Maintenance', 'Outillage', 'Autre'];
const UNITES = [{ value: 'L', label: 'Litres (L)' }, { value: 'kg', label: 'Kilogrammes (kg)' }, { value: 'unité', label: 'Unité' }, { value: 'sac', label: 'Sac' }];
const emptyProduit = () => ({ nom: '', categorie: '', unite: '', stock_minimum: '', prix_unitaire: '' });
const emptyMouvement = () => ({ produit_id: '', type_mouvement: '', quantite: '', motif: '', date: today(), campement_id: '', bloc_id: '' });

export default function StockPage() {
  const [produits, setProduits] = useState([]);
  const [mouvements, setMouvements] = useState([]);
  const [campements, setCampements] = useState([]);
  const [blocs, setBlocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filtreBloc, setFiltreBloc] = useState({ campement_id: '', bloc_id: '' });
  const [showAddProduit, setShowAddProduit] = useState(false);
  const [showAddMouvement, setShowAddMouvement] = useState(false);
  const [formP, setFormP] = useState(emptyProduit);
  const [formM, setFormM] = useState(emptyMouvement);
  const [formErrorsP, setFormErrorsP] = useState({});
  const [formErrorsM, setFormErrorsM] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const load = () => Promise.all([produitsService.getAll(), mouvementsService.getAll(), campementsService.getAll(), blocsService.getAll()])
    .then(([p, m, c, b]) => {
      setProduits(p);
      setMouvements(m);
      setCampements(c);
      setBlocs(b);
      setLoading(false);
    })
    .catch(() => { setError(true); setLoading(false); });

  useEffect(() => { load(); }, []);

  const mouvementsFiltres = useMemo(() => {
    const f = buildBlocFilter(filtreBloc, blocs);
    return mouvements.filter((m) => matchBlocFilter(m, f));
  }, [mouvements, filtreBloc, blocs]);

  const produitsFaibles = produits.filter((p) => p.actif && p.status === 'low');
  const valeurStock = produits.reduce((s, p) => s + p.valeur_stock, 0);
  const totalEntrees = mouvementsFiltres.filter((m) => m.type_mouvement === 'ENTREE').length;
  const totalSorties = mouvementsFiltres.filter((m) => m.type_mouvement === 'SORTIE').length;
  const produitChoisi = produits.find((p) => p.id === formM.produit_id);

  const validateProduit = () => {
    const errs = {};
    if (!formP.nom.trim()) errs.nom = 'Le nom est obligatoire';
    if (!formP.categorie) errs.categorie = 'La catégorie est obligatoire';
    if (!formP.unite) errs.unite = "L'unité est obligatoire";
    if (formP.stock_minimum === '' || Number(formP.stock_minimum) < 0) errs.stock_minimum = 'Le seuil doit être positif';
    if (Number(formP.prix_unitaire) < 0) errs.prix_unitaire = 'Le prix doit être positif';
    setFormErrorsP(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAddProduit = async () => {
    if (!validateProduit()) return;
    setSaving(true);
    try {
      const item = await produitsService.create({
        nom: formP.nom.trim(),
        categorie: formP.categorie,
        unite: formP.unite,
        stock_minimum: Number(formP.stock_minimum),
        prix_unitaire: Number(formP.prix_unitaire) || 0,
      });
      setProduits((list) => [...list, item].sort((a, b) => a.nom.localeCompare(b.nom)));
      setShowAddProduit(false);
      toast.success(`Produit ${item.code} ajouté — enregistrez une entrée pour l'approvisionner`);
    } catch (err) {
      showServerErrors(err, { setFormErrors: setFormErrorsP, toast });
    } finally {
      setSaving(false);
    }
  };

  const validateMouvement = () => {
    const errs = {};
    if (!formM.produit_id) errs.produit_id = 'Le produit est obligatoire';
    if (!formM.type_mouvement) errs.type_mouvement = 'Le type est obligatoire';
    if (!(Number(formM.quantite) > 0)) errs.quantite = 'La quantité doit être supérieure à 0';
    else if (formM.type_mouvement === 'SORTIE' && produitChoisi && Number(formM.quantite) > produitChoisi.stock_calcule)
      errs.quantite = `Stock insuffisant (${formatNumber(produitChoisi.stock_calcule)} ${produitChoisi.unite} disponibles)`;
    if (!formM.motif.trim()) errs.motif = 'Le motif est obligatoire';
    if (!formM.date) errs.date = 'La date est obligatoire';
    else if (formM.date > today()) errs.date = 'La date ne peut pas être dans le futur';
    if (!formM.bloc_id) errs.bloc_id = 'Le bloc est obligatoire';
    setFormErrorsM(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAddMouvement = async () => {
    if (!validateMouvement()) return;
    setSaving(true);
    try {
      await mouvementsService.create({
        produit_id: formM.produit_id,
        type_mouvement: formM.type_mouvement,
        quantite: Number(formM.quantite),
        motif: formM.motif.trim(),
        date: formM.date,
        bloc_id: formM.bloc_id,
      });
      await load();
      setShowAddMouvement(false);
      toast.success('Mouvement enregistré — stock mis à jour');
    } catch (err) {
      showServerErrors(err, { setFormErrors: setFormErrorsM, toast });
    } finally {
      setSaving(false);
    }
  };

  const produitColumns = [
    { key: 'nom', header: 'Produit', sortable: true, render: (row) => <span className="font-medium text-ink-800">{row.nom}</span> },
    { key: 'code', header: 'Code', render: (row) => <span className="font-mono text-xs text-forest-700">{row.code}</span> },
    { key: 'categorie', header: 'Catégorie', render: (row) => <Badge className="bg-sage-50 text-sage-700">{row.categorie || '—'}</Badge> },
    { key: 'stock_calcule', header: 'Stock', sortable: true, render: (row) => (
      <span className={`tabular-nums font-medium ${row.status === 'low' ? 'text-earth-600' : 'text-ink-800'}`}>{formatNumber(row.stock_calcule)} {row.unite}</span>
    ) },
    { key: 'stock_minimum', header: 'Seuil', render: (row) => <span className="tabular-nums text-ink-400">{formatNumber(row.stock_minimum)} {row.unite}</span> },
    { key: 'valeur_stock', header: 'Valeur', sortable: true, render: (row) => <span className="tabular-nums">{formatFCFA(row.valeur_stock)}</span> },
    { key: 'status', header: 'Statut', render: (row) => <Badge status={row.status}>{row.status === 'low' ? 'Faible' : 'OK'}</Badge> },
  ];

  const mouvementColumns = [
    { key: 'date', header: 'Date', sortable: true, render: (row) => formatDate(row.date) },
    { key: 'produit_nom', header: 'Produit', render: (row) => <span className="font-medium">{row.produit_nom}</span> },
    { key: 'type_mouvement', header: 'Type', render: (row) => (
      <span className={`flex items-center gap-1 ${row.type_mouvement === 'ENTREE' ? 'text-leaf-700' : 'text-earth-700'}`}>
        {row.type_mouvement === 'ENTREE' ? <ArrowDownCircle size={14} /> : <ArrowUpCircle size={14} />}
        {row.type_mouvement === 'ENTREE' ? 'Entrée' : row.type_mouvement === 'SORTIE' ? 'Sortie' : 'Ajustement'}
      </span>
    ) },
    { key: 'quantite', header: 'Quantité', sortable: true, render: (row) => <span className="tabular-nums">{formatNumber(row.quantite)} {row.unite}</span> },
    { key: 'motif', header: 'Motif' },
    { key: 'campement_nom', header: 'Campement' },
    { key: 'bloc_code', header: 'Bloc', render: (row) => <span className="font-mono text-xs">{row.bloc_code || '—'}</span> },
  ];

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock"
        subtitle="Produits et mouvements — le stock est calculé à partir des entrées et sorties"
        icon={Package}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setFormM(emptyMouvement()); setFormErrorsM({}); setShowAddMouvement(true); }}><Plus size={16} /> Mouvement</Button>
            <Button size="sm" onClick={() => { setFormP(emptyProduit()); setFormErrorsP({}); setShowAddProduit(true); }}><Plus size={16} /> Nouveau produit</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Valeur du stock" value={formatFCFA(valeurStock)} icon={Package} accent="forest" />
        <StatCard label="Produits en stock faible" value={produitsFaibles.length} icon={AlertTriangle} accent="earth" />
        <StatCard label="Entrées" value={totalEntrees} unit="mouvements" icon={ArrowDownCircle} accent="leaf" />
        <StatCard label="Sorties" value={totalSorties} unit="mouvements" icon={ArrowUpCircle} accent="olive" />
      </div>

      {produitsFaibles.length > 0 && (
        <Card className="p-4 border-earth-100">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-earth-600" />
            <h3 className="text-sm font-semibold text-earth-700">Alertes stock faible</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {produitsFaibles.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-earth-50/50 border border-earth-100">
                <div>
                  <p className="text-sm font-medium text-ink-700">{p.nom}</p>
                  <p className="text-xs text-ink-400">{formatNumber(p.stock_calcule)} {p.unite} / seuil {formatNumber(p.stock_minimum)} {p.unite}</p>
                </div>
                <Badge status="low">Faible</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-ink-700">Produits</h3>
        <DataTable
          columns={produitColumns}
          data={produits}
          loading={loading}
          searchPlaceholder="Rechercher un produit..."
          searchKeys={['nom', 'code', 'categorie']}
        />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold text-ink-700 mr-auto">Mouvements</h3>
          <BlocPicker mode="filter" campements={campements} blocs={blocs} value={filtreBloc} onChange={setFiltreBloc} />
        </div>
        <DataTable
          columns={mouvementColumns}
          data={mouvementsFiltres}
          loading={loading}
          searchPlaceholder="Rechercher un mouvement..."
          searchKeys={['produit_nom', 'motif', 'bloc_code']}
        />
      </div>

      <Modal
        open={showAddProduit}
        onClose={() => setShowAddProduit(false)}
        title="Nouveau produit"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAddProduit(false)}>Annuler</Button>
            <Button onClick={handleAddProduit} loading={saving}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AutoCodeInput service={produitsService} />
            <Input label="Nom" required placeholder="Ex: Herbicide" value={formP.nom} onChange={(e) => setFormP({ ...formP, nom: e.target.value })} error={formErrorsP.nom} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Catégorie" required options={CATEGORIES} placeholder="Choisir" value={formP.categorie} onChange={(e) => setFormP({ ...formP, categorie: e.target.value })} error={formErrorsP.categorie} />
            <Select label="Unité" required options={UNITES} placeholder="Choisir" value={formP.unite} onChange={(e) => setFormP({ ...formP, unite: e.target.value })} error={formErrorsP.unite} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Seuil d'alerte" required type="number" min="0" step="any" placeholder="0" value={formP.stock_minimum} onChange={(e) => setFormP({ ...formP, stock_minimum: e.target.value })} error={formErrorsP.stock_minimum} />
            <Input label="Prix unitaire (FCFA)" type="number" min="0" placeholder="0" value={formP.prix_unitaire} onChange={(e) => setFormP({ ...formP, prix_unitaire: e.target.value })} error={formErrorsP.prix_unitaire} />
          </div>
          <p className="text-xs text-ink-400">Le stock démarre à 0 : il évolue avec les mouvements d'entrée et de sortie.</p>
        </div>
      </Modal>

      <Modal
        open={showAddMouvement}
        onClose={() => setShowAddMouvement(false)}
        title="Nouveau mouvement"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAddMouvement(false)}>Annuler</Button>
            <Button onClick={handleAddMouvement} loading={saving}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Produit"
            required
            options={produits.filter((p) => p.actif).map((p) => ({ value: p.id, label: `${p.nom} (${p.code}) — ${formatNumber(p.stock_calcule)} ${p.unite} en stock` }))}
            placeholder="Choisir un produit"
            value={formM.produit_id}
            onChange={(e) => setFormM({ ...formM, produit_id: e.target.value })}
            error={formErrorsM.produit_id}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Type de mouvement"
              required
              options={[{ value: 'ENTREE', label: 'Entrée' }, { value: 'SORTIE', label: 'Sortie' }]}
              placeholder="Choisir"
              value={formM.type_mouvement}
              onChange={(e) => setFormM({ ...formM, type_mouvement: e.target.value })}
              error={formErrorsM.type_mouvement}
            />
            <Input
              label={`Quantité${produitChoisi ? ` (${produitChoisi.unite})` : ''}`}
              required
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={formM.quantite}
              onChange={(e) => setFormM({ ...formM, quantite: e.target.value })}
              error={formErrorsM.quantite}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Motif" required placeholder="Ex: Traitement Bloc A1" value={formM.motif} onChange={(e) => setFormM({ ...formM, motif: e.target.value })} error={formErrorsM.motif} />
            <Input label="Date" required type="date" max={today()} value={formM.date} onChange={(e) => setFormM({ ...formM, date: e.target.value })} error={formErrorsM.date} />
          </div>
          <BlocPicker
            campements={campements}
            blocs={blocs}
            value={formM}
            onChange={(v) => setFormM({ ...formM, ...v })}
            required
            errors={formErrorsM}
          />
        </div>
      </Modal>
    </div>
  );
}
