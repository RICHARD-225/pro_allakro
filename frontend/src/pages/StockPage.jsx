import { useState, useEffect, useMemo } from 'react';
import { Package, Plus, AlertTriangle, ArrowDownCircle, ArrowUpCircle, Coins, PackageMinus, PackagePlus } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import RowActions from '@/components/RowActions';
import BlocPicker from '@/components/BlocPicker';
import { MouvementFormulaire, ProduitFormulaire } from '@/pages/stock/FormulairesStock';
import { colonnesMouvements, colonnesProduits } from '@/pages/stock/colonnes';
import { DataTable, Button, ErrorState, KpiGrid, Select } from '@/components/ui';
import { compterFiltres } from '@/components/ui/Filtres';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSuppression } from '@/hooks/useSuppression';
import { useListeServeur } from '@/hooks/useListeServeur';
import { produitsService, mouvementsService, campementsService, blocsService } from '@/services';
import { formatNumber } from '@/utils/format';
import { showServerErrors, today } from '@/utils/errors';
import { ROLE } from '@/constants';

const emptyProduit = () => ({ nom: '', categorie: '', unite: '', stock_minimum: '', prix_unitaire: '', actif: true });
const emptyMouvement = () => ({ produit_id: '', type_mouvement: '', quantite: '', stock_constate: '', motif: '', date: today(), campement_id: '', bloc_id: '' });

export default function StockPage() {
  const { user } = useAuth();
  const isBoss = user?.role === ROLE.BIG_BOSS;
  const [produits, setProduits] = useState([]);
  const [campements, setCampements] = useState([]);
  const [blocs, setBlocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filtreBloc, setFiltreBloc] = useState({ campement_id: '', bloc_id: '' });
  const [onglet, setOnglet] = useState('produits');
  const [filtreEtat, setFiltreEtat] = useState('');
  const [filtreType, setFiltreType] = useState('');
  const [produitEdite, setProduitEdite] = useState(null); // null fermé · 'nouveau' · produit modifié
  const [showAddMouvement, setShowAddMouvement] = useState(false);
  const [formP, setFormP] = useState(emptyProduit);
  const [formM, setFormM] = useState(emptyMouvement);
  const [formErrorsP, setFormErrorsP] = useState({});
  const [formErrorsM, setFormErrorsM] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // Mouvements : liste paginée par le serveur (page, recherche, tri, type, campement / bloc) ; produits : liste de référence complète
  const mvt = useListeServeur({
    charger: (p) => mouvementsService.page(p),
    totaux: (p) => mouvementsService.totaux(p),
    filtres: { type_mouvement: filtreType, campement_id: filtreBloc.campement_id, bloc_id: filtreBloc.bloc_id },
  });
  const { recharger: rechargerMouvements } = mvt;
  useEffect(() => { if (mvt.erreur) setError(true); }, [mvt.erreur]);

  const load = () => Promise.all([produitsService.getAll(), campementsService.getAll(), blocsService.getAll()])
    .then(([p, c, b]) => {
      setProduits(p);
      setCampements(c);
      setBlocs(b);
      setLoading(false);
      rechargerMouvements();
    })
    .catch(() => { setError(true); setLoading(false); });

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const produitEnModification = produitEdite && produitEdite !== 'nouveau';

  // « Retirer du stock » : le produit et son historique sont conservés mais ne comptent plus (valeur, alertes, saisie de mouvements)
  const basculerProduit = async (row, actif) => {
    try {
      await produitsService.update(row.id, { actif });
      await load();
      toast.success(actif ? `Produit ${row.code} remis en stock` : `Produit ${row.code} retiré du stock`);
    } catch (err) {
      showServerErrors(err, { toast });
    }
  };

  const { demander: supprimerProduit, dialogue: dialogueProduit } = useSuppression({
    supprimer: (row) => produitsService.remove(row.id),
    apres: () => load(),
    message: (row) => (row.nb_mouvements > 0
      ? `Supprimer le produit « ${row.nom} » (${row.code}) ? `
        + (row.nb_mouvements === 1 ? 'Son unique mouvement sera supprimé avec lui. ' : `Ses ${row.nb_mouvements} mouvements (entrées, sorties, ajustements) seront supprimés avec lui. `)
        + 'Cette action est irréversible ; pour le garder en archive, désactivez-le plutôt.'
      : `Supprimer le produit « ${row.nom} » (${row.code}) ? Cette action est irréversible.`),
    succes: (row) => `Produit ${row.code} supprimé`,
  });

  const { demander: supprimerMouvement, dialogue: dialogueMouvement } = useSuppression({
    supprimer: (row) => mouvementsService.remove(row.id),
    apres: () => load(),
    message: (row) => {
      const produit = produits.find((p) => p.id === row.produit_id);
      const signe = row.type_mouvement === 'SORTIE' ? -1 : 1;
      const apres = produit ? produit.stock_calcule - signe * Number(row.quantite) : null;
      const type = { ENTREE: 'entrée', SORTIE: 'sortie', AJUSTEMENT: 'ajustement' }[row.type_mouvement] || 'mouvement';
      return `Supprimer ce mouvement (${type} de ${formatNumber(row.quantite)} ${row.unite} — ${row.produit_nom}) ? `
        + (apres === null ? 'Le stock sera recalculé.'
          : `Le stock passera de ${formatNumber(produit.stock_calcule)} à ${formatNumber(apres)} ${row.unite}.`
            + (apres < 0 ? ' Attention : le stock deviendrait négatif, pensez à le corriger par un ajustement.' : ''));
    },
    succes: () => 'Mouvement supprimé — stock recalculé',
  });

  const ouvrirProduit = (produit = null) => {
    setFormP(produit
      ? {
        nom: produit.nom, categorie: produit.categorie || '', unite: produit.unite || '',
        stock_minimum: String(produit.stock_minimum ?? ''), prix_unitaire: String(produit.prix_unitaire ?? ''), actif: produit.actif,
      }
      : emptyProduit());
    setFormErrorsP({});
    setProduitEdite(produit || 'nouveau');
  };

  const produitsFiltres = useMemo(() => produits.filter((p) => {
    if (filtreEtat === 'faible') return p.actif && p.status === 'low';
    if (filtreEtat === 'inactif') return !p.actif;
    if (filtreEtat === 'actif') return p.actif;
    return true;
  }), [produits, filtreEtat]);

  const produitsFaibles = produits.filter((p) => p.actif && p.status === 'low');
  // Un produit retiré du stock ne compte plus (valeur, alertes, tableau de bord)
  const valeurStock = produits.filter((p) => p.actif).reduce((s, p) => s + p.valeur_stock, 0);
  const totalEntrees = mvt.totaux?.entrees ?? 0;
  const totalSorties = mvt.totaux?.sorties ?? 0;
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
    const payload = {
      nom: formP.nom.trim(),
      categorie: formP.categorie,
      unite: formP.unite,
      stock_minimum: Number(formP.stock_minimum),
      prix_unitaire: Number(formP.prix_unitaire) || 0,
      ...(produitEnModification ? { actif: formP.actif } : {}),
    };
    try {
      if (produitEnModification) {
        await produitsService.update(produitEdite.id, payload);
        await load();
        toast.success(`Produit ${produitEdite.code} modifié`);
      } else {
        const item = await produitsService.create(payload);
        setProduits((list) => [...list, item].sort((a, b) => a.nom.localeCompare(b.nom)));
        toast.success(`Produit ${item.code} ajouté — enregistrez une entrée pour l'approvisionner`);
      }
      setProduitEdite(null);
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
    if (formM.type_mouvement === 'AJUSTEMENT') {
      // Inventaire : on saisit le stock réellement constaté, l'écart est calculé
      if (formM.stock_constate === '' || Number(formM.stock_constate) < 0) errs.stock_constate = 'Saisissez le stock constaté (0 ou plus)';
      else if (produitChoisi && Number(formM.stock_constate) === Number(produitChoisi.stock_calcule)) errs.stock_constate = 'Le stock constaté est identique au stock enregistré : aucun ajustement à faire';
    } else if (!(Number(formM.quantite) > 0)) errs.quantite = 'La quantité doit être supérieure à 0';
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
        // Ajustement : la quantité est l'écart entre le stock constaté et le stock enregistré (positif ou négatif)
        quantite: formM.type_mouvement === 'AJUSTEMENT'
          ? Number((Number(formM.stock_constate) - Number(produitChoisi.stock_calcule)).toFixed(3))
          : Number(formM.quantite),
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

  const produitColumns = colonnesProduits;

  const ActionsProduit = ({ row }) => (
    <RowActions
      onEdit={() => ouvrirProduit(row)}
      menu={[row.actif
        ? { label: 'Retirer du stock', icon: PackageMinus, onClick: () => basculerProduit(row, false) }
        : { label: 'Remettre en stock', icon: PackagePlus, onClick: () => basculerProduit(row, true) }]}
      onDelete={isBoss ? () => supprimerProduit(row) : undefined}
    />
  );
  const ActionsMouvement = ({ row }) => (isBoss ? <RowActions onDelete={() => supprimerMouvement(row)} /> : null);

  const mouvementColumns = colonnesMouvements;

  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Stock"
        subtitle="Produits, entrées et sorties"
        icon={Package}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setFormM(emptyMouvement()); setFormErrorsM({}); setShowAddMouvement(true); }}><Plus size={16} /> Mouvement</Button>
            <Button size="sm" onClick={() => ouvrirProduit()}><Plus size={16} /> Nouveau produit</Button>
          </div>
        }
      />

      <KpiGrid items={[
        { label: 'Valeur du stock', value: formatNumber(valeurStock), unit: 'FCFA', icon: Coins, accent: 'forest' },
        { label: 'Sous le seuil', value: produitsFaibles.length, unit: 'produit(s)', icon: AlertTriangle, accent: produitsFaibles.length ? 'earth' : 'leaf' },
        { label: 'Entrées', value: totalEntrees, unit: 'mouvements', icon: ArrowDownCircle, accent: 'leaf' },
        { label: 'Sorties', value: totalSorties, unit: 'mouvements', icon: ArrowUpCircle, accent: 'olive' },
      ]} />

      {produitsFaibles.length > 0 && (
        <button
          type="button"
          onClick={() => { setOnglet('produits'); setFiltreEtat('faible'); }}
          className="flex w-full items-center gap-2 rounded-lg border border-earth-100 bg-earth-50 px-3 py-2 text-left text-sm text-earth-700 transition-colors hover:bg-earth-100"
        >
          <AlertTriangle size={16} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            Sous le seuil d'alerte : {produitsFaibles.map((p) => `${p.nom} (${formatNumber(p.stock_calcule)} ${p.unite})`).join(', ')}
          </span>
          <span className="shrink-0 text-xs font-medium underline-offset-2 hover:underline">Voir</span>
        </button>
      )}

      <div className="flex w-full rounded-lg border border-ink-200 bg-white p-0.5 sm:inline-flex sm:w-auto" role="tablist">
        {[{ id: 'produits', label: `Produits (${produits.length})` }, { id: 'mouvements', label: `Mouvements (${mvt.total})` }].map((o) => (
          <button key={o.id} type="button" role="tab" aria-selected={onglet === o.id} onClick={() => setOnglet(o.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none ${onglet === o.id ? 'bg-forest-600 text-white' : 'text-ink-600 hover:bg-cream-100'}`}>
            {o.label}
          </button>
        ))}
      </div>

      {onglet === 'produits' ? (
        <DataTable
          columns={produitColumns}
          data={produitsFiltres}
          loading={loading}
          searchPlaceholder="Rechercher un produit..."
          searchKeys={['nom', 'code', 'categorie']}
          onRowClick={(row) => ouvrirProduit(row)}
          actions={ActionsProduit}
          filters={(
            <Select
              value={filtreEtat}
              onChange={(e) => setFiltreEtat(e.target.value)}
              options={[
                { value: 'faible', label: 'Stock faible' },
                { value: 'actif', label: 'Produits en stock' },
                { value: 'inactif', label: 'Produits retirés du stock' },
              ]}
              placeholder="État" emptyLabel="Tous les produits"
              className="w-full sm:w-40"
            />
          )}
          filtersActive={compterFiltres(filtreEtat)}
          onResetFilters={() => setFiltreEtat('')}
          emptyTitle="Aucun produit"
          emptyAction={<Button size="sm" onClick={() => ouvrirProduit()}><Plus size={14} /> Nouveau produit</Button>}
        />
      ) : (
        <DataTable
          columns={mouvementColumns}
          data={mvt.lignes}
          serveur={mvt.serveur}
          loading={mvt.chargement}
          searchPlaceholder="Rechercher un mouvement..."
          actions={isBoss ? ActionsMouvement : undefined}
          filters={(
            <>
              <Select
                value={filtreType}
                onChange={(e) => setFiltreType(e.target.value)}
                options={[{ value: 'ENTREE', label: 'Entrées' }, { value: 'SORTIE', label: 'Sorties' }, { value: 'AJUSTEMENT', label: 'Ajustements' }]}
                placeholder="Type" emptyLabel="Tous les mouvements"
                className="w-full sm:w-40"
              />
              <BlocPicker mode="filter" campements={campements} blocs={blocs} value={filtreBloc} onChange={setFiltreBloc} />
            </>
          )}
          filtersActive={compterFiltres(filtreType, filtreBloc.campement_id, filtreBloc.bloc_id)}
          onResetFilters={() => { setFiltreType(''); setFiltreBloc({ campement_id: '', bloc_id: '' }); }}
          emptyTitle="Aucun mouvement"
        />
      )}
      {dialogueProduit}
      {dialogueMouvement}

      <ProduitFormulaire
        produitEdite={produitEdite} enModification={produitEnModification} form={formP} setForm={setFormP} formErrors={formErrorsP}
        saving={saving} onClose={() => setProduitEdite(null)} onSubmit={handleAddProduit}
      />

      <MouvementFormulaire
        open={showAddMouvement} form={formM} setForm={setFormM} formErrors={formErrorsM} saving={saving}
        onClose={() => setShowAddMouvement(false)} onSubmit={handleAddMouvement}
        produits={produits} produitChoisi={produitChoisi} campements={campements} blocs={blocs}
      />
    </div>
  );
}
