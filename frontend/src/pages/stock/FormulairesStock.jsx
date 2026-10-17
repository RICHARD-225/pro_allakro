import AutoCodeInput from '@/components/AutoCodeInput';
import BlocPicker from '@/components/BlocPicker';
import { Button, Input, Modal, Select } from '@/components/ui';
import { produitsService } from '@/services';
import { formatNumber } from '@/utils/format';
import { today } from '@/utils/errors';

export const CATEGORIES = ['Phytosanitaire', 'Engrais', 'Carburant', 'Maintenance', 'Outillage', 'Autre'];
export const UNITES = [{ value: 'L', label: 'Litres (L)' }, { value: 'kg', label: 'Kilogrammes (kg)' }, { value: 'unité', label: 'Unité' }, { value: 'sac', label: 'Sac' }];

/** Fenêtre « Nouveau produit » / « Modifier le produit ». L'état du formulaire et la validation restent dans la page. */
export function ProduitFormulaire({ produitEdite, enModification, form, setForm, formErrors, saving, onClose, onSubmit }) {
  return (
    <Modal
      open={!!produitEdite}
      onClose={() => onClose()}
      title={enModification ? `Modifier ${produitEdite.code}` : 'Nouveau produit'}
      footer={
        <>
          <Button variant="outline" onClick={() => onClose()}>Annuler</Button>
          <Button onClick={onSubmit} loading={saving}>Enregistrer</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {enModification
            ? <Input label="Code" value={produitEdite.code} disabled readOnly />
            : <AutoCodeInput service={produitsService} />}
          <Input label="Nom" required placeholder="Ex: Herbicide" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} error={formErrors.nom} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Catégorie" required options={CATEGORIES} placeholder="Choisir" value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })} error={formErrors.categorie} />
          <Select label="Unité" required options={UNITES} placeholder="Choisir" value={form.unite} onChange={(e) => setForm({ ...form, unite: e.target.value })} error={formErrors.unite} />
        </div>
        {!enModification && (
          <Input
            label={`Quantité en stock${form.unite ? ` (${form.unite})` : ''}`} type="number" min="0" step="any" placeholder="0"
            value={form.quantite_initiale} onChange={(e) => setForm({ ...form, quantite_initiale: e.target.value })} error={formErrors.quantite_initiale}
            hint="Ce que vous avez déjà en magasin. Elle est enregistrée comme une entrée « Stock initial » ; laissez vide si le produit n'est pas encore arrivé."
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Seuil d'alerte" required type="number" min="0" step="any" placeholder="0" value={form.stock_minimum} onChange={(e) => setForm({ ...form, stock_minimum: e.target.value })} error={formErrors.stock_minimum} />
          <Input label="Prix unitaire (FCFA)" type="number" min="0" placeholder="0" value={form.prix_unitaire} onChange={(e) => setForm({ ...form, prix_unitaire: e.target.value })} error={formErrors.prix_unitaire} />
        </div>
        {enModification ? (
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={form.actif} onChange={(e) => setForm({ ...form, actif: e.target.checked })}
              className="h-4 w-4 rounded-sm border-ink-300 text-forest-600" />
            Produit en stock (décochez pour le retirer du stock)
          </label>
        ) : (
          <p className="text-xs text-ink-500">Ensuite, le stock évolue avec les mouvements : une entrée quand vous recevez du produit, une sortie quand vous l'utilisez.</p>
        )}
      </div>
    </Modal>
  );
}

/** Fenêtre « Nouveau mouvement » : entrée, sortie ou ajustement d'inventaire (stock constaté). */
export function MouvementFormulaire({ open, form, setForm, formErrors, saving, onClose, onSubmit, produits, produitChoisi, campements, blocs }) {
  return (
    <Modal
      open={open}
      onClose={() => onClose()}
      title="Nouveau mouvement"
      footer={
        <>
          <Button variant="outline" onClick={() => onClose()}>Annuler</Button>
          <Button onClick={onSubmit} loading={saving}>Enregistrer</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Produit"
          required
          options={produits.filter((p) => p.actif).map((p) => ({ value: p.id, label: `${p.nom} (${p.code}) — ${formatNumber(p.stock_calcule)} ${p.unite} en stock` }))}
          placeholder="Choisir un produit"
          value={form.produit_id}
          onChange={(e) => setForm({ ...form, produit_id: e.target.value })}
          error={formErrors.produit_id}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Type de mouvement"
            required
            options={[{ value: 'ENTREE', label: 'Entrée' }, { value: 'SORTIE', label: 'Sortie' }, { value: 'AJUSTEMENT', label: 'Ajustement (inventaire)' }]}
            placeholder="Choisir"
            value={form.type_mouvement}
            onChange={(e) => setForm({ ...form, type_mouvement: e.target.value })}
            error={formErrors.type_mouvement}
          />
          {form.type_mouvement === 'AJUSTEMENT' ? (
            <Input
              label={`Stock constaté${produitChoisi ? ` (${produitChoisi.unite})` : ''}`}
              required
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={form.stock_constate}
              onChange={(e) => setForm({ ...form, stock_constate: e.target.value })}
              error={formErrors.stock_constate}
              hint={produitChoisi && form.stock_constate !== ''
                ? `Stock enregistré : ${formatNumber(produitChoisi.stock_calcule)} · écart : ${Number(form.stock_constate) - Number(produitChoisi.stock_calcule) > 0 ? '+' : ''}${formatNumber(Number(form.stock_constate) - Number(produitChoisi.stock_calcule))} ${produitChoisi.unite}`
                : 'Quantité réellement comptée en magasin.'}
            />
          ) : (
            <Input
              label={`Quantité${produitChoisi ? ` (${produitChoisi.unite})` : ''}`}
              required
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={form.quantite}
              onChange={(e) => setForm({ ...form, quantite: e.target.value })}
              error={formErrors.quantite}
            />
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Motif" required placeholder="Ex: Traitement Bloc A1" value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} error={formErrors.motif} />
          <Input label="Date" required type="date" max={today()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} error={formErrors.date} />
        </div>
        <BlocPicker
          campements={campements}
          blocs={blocs}
          value={form}
          onChange={(v) => setForm({ ...form, ...v })}
          required
          errors={formErrors}
        />
      </div>
    </Modal>
  );
}
