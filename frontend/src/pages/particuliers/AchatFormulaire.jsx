import AutoCodeInput from '@/components/AutoCodeInput';
import BlocPicker from '@/components/BlocPicker';
import { Button, Input, Modal, Select } from '@/components/ui';
import { achatsParticuliersService } from '@/services';
import { formatFCFA, formatNumber } from '@/utils/format';
import { today } from '@/utils/errors';
import { CATEGORIE_ACHAT_PARTICULIERS, TYPE_PAIEMENT_LABELS } from '@/constants';

// Unité proposée pour un achat (la liste des unités vient du serveur, commune aux travaux et aux achats)
export const UNITE_ACHAT = 'kg';
export const TYPES_PAIEMENT = Object.entries(TYPE_PAIEMENT_LABELS).map(([value, label]) => ({ value, label }));

/** Fenêtre « Nouvel achat » / « Modifier l'achat » : vendeur, produit, quantité, prix, bloc, date et premier versement. */
export default function AchatFormulaire({
  edition, enModification, form, setForm, formErrors, saving, onClose, onSubmit,
  particuliers, unites, campements, blocs, montant, nouveauVendeur, choisirVendeur,
}) {
  return (
    <Modal
      open={!!edition}
      onClose={() => onClose()}
      title={enModification ? `Modifier l'achat ${edition.reference}` : "Nouvel achat auprès d'un particulier"}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onClose()}>Annuler</Button>
          <Button onClick={onSubmit} loading={saving}>Enregistrer</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {enModification
            ? <Input label="Référence" value={edition.reference} disabled readOnly />
            : <AutoCodeInput service={achatsParticuliersService} label="Référence" />}
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
            options={unites.map((u) => ({ value: u.code, label: u.libelle }))}
            placeholder=""
            value={form.unite_poids}
            onChange={(e) => setForm({ ...form, unite_poids: e.target.value || UNITE_ACHAT })}
            error={formErrors.unite_poids}
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
            <span className="block text-xs tabular-nums text-forest-600">
              {formatNumber(Number(form.poids) || 0)} {form.unite_poids} × {formatFCFA(Number(form.prix_unitaire) || 0)}
            </span>
          </span>
          <span className="text-lg font-semibold text-forest-800 tabular-nums">{formatFCFA(montant)}</span>
        </div>

        <BlocPicker
          campements={campements}
          blocs={blocs}
          value={form}
          onChange={(v) => setForm({ ...form, ...v })}
          required
          errors={formErrors}
        />

        <div className={`grid grid-cols-1 gap-3 ${enModification ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
          <Input
            label="Date d'achat"
            required
            type="date"
            max={today()}
            value={form.date_achat}
            onChange={(e) => setForm({ ...form, date_achat: e.target.value })}
            error={formErrors.date_achat}
          />
          {enModification ? (
            <p className="self-end pb-2 text-xs text-ink-500">
              Déjà payé : {formatFCFA(edition.montant_paye)} · les paiements se règlent avec « Régler ».
            </p>
          ) : (
            <>
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
            </>
          )}
        </div>

        <p className="text-xs text-ink-500">
          L'achat est aussi enregistré dans les dépenses, catégorie « {CATEGORIE_ACHAT_PARTICULIERS} ».
        </p>
      </div>
    </Modal>
  );
}
