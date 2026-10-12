import BlocPicker from '@/components/BlocPicker';
import { Button, Input, Modal, PlusDOptions, Select } from '@/components/ui';
import { today } from '@/utils/errors';

/** Fenêtre « Nouvelle dépense » / « Modifier la dépense ». L'état du formulaire et la validation restent dans la page. */
export default function DepenseFormulaire({ edition, enModification, form, setForm, formErrors, saving, onClose, onSubmit, categoriesSaisie, campements, blocs }) {
  return (
    <Modal
      open={!!edition}
      onClose={() => onClose()}
      title={enModification ? 'Modifier la dépense' : 'Nouvelle dépense'}
      footer={
        <>
          <Button variant="outline" onClick={() => onClose()}>Annuler</Button>
          <Button onClick={onSubmit} loading={saving}>Enregistrer</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Désignation"
          required
          placeholder="Ex: Achat herbicide"
          value={form.designation}
          onChange={(e) => setForm({ ...form, designation: e.target.value })}
          error={formErrors.designation}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Catégorie"
            required
            options={categoriesSaisie}
            placeholder="Choisir"
            value={form.categorie_id}
            onChange={(e) => setForm({ ...form, categorie_id: e.target.value })}
            error={formErrors.categorie_id}
            hint="Achats particuliers et salaires s'enregistrent depuis leurs pages."
          />
          <Input
            label="Montant (FCFA)"
            required
            type="number"
            min="0"
            step="any"
            placeholder="0"
            value={form.montant_total}
            onChange={(e) => setForm({ ...form, montant_total: e.target.value })}
            error={formErrors.montant_total}
          />
        </div>
        <BlocPicker
          campements={campements}
          blocs={blocs}
          value={form}
          onChange={(v) => setForm({ ...form, ...v })}
          required
          errors={formErrors}
        />
        <Input
          label="Date"
          required
          type="date"
          max={today()}
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          error={formErrors.date}
          hint="Une dépense saisie ici est enregistrée comme payée."
        />
        <PlusDOptions
          resume="Justificatif, observation"
          ouvertParDefaut={Boolean(form.numero_justificatif || form.observation)}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="N° de justificatif"
              placeholder="Facture, reçu…"
              value={form.numero_justificatif}
              onChange={(e) => setForm({ ...form, numero_justificatif: e.target.value })}
              error={formErrors.numero_justificatif}
            />
            <Input
              label="Observation"
              value={form.observation}
              onChange={(e) => setForm({ ...form, observation: e.target.value })}
              error={formErrors.observation}
            />
          </div>
        </PlusDOptions>
      </div>
    </Modal>
  );
}
