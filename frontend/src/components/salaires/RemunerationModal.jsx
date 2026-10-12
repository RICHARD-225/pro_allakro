import { useEffect, useState } from 'react';
import { Button, Input, Modal, PlusDOptions, Select } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { salairesService } from '@/services';
import { formatFCFA, formatPeriode } from '@/utils/format';
import { showServerErrors, currentPeriode } from '@/utils/errors';

const PERIODE = /^\d{4}-\d{2}$/;
// Champ « mois » natif (Chrome, Edge, Safari) : le mois s'affiche déjà en toutes lettres, l'aide ne sert qu'aux autres navigateurs
const MOIS_NATIF = (() => { const champ = document.createElement('input'); champ.setAttribute('type', 'month'); return champ.type === 'month'; })();

const formulaireVide = () => ({
  personne_id: '', periode: currentPeriode(), libelle: '', montant_brut: '', montant_ponction: '', observation: '',
});

/**
 * « Nouvelle rémunération » saisie à la main (une personne, un mois).
 * Une rémunération ne se modifie jamais directement : celle d'un travail suit le travail ; une saisie manuelle
 * erronée s'annule (si elle n'a aucun paiement) puis se ressaisit, ce qui garde l'historique financier intact.
 */
export default function RemunerationModal({ open, personnes = [], onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFormErrors({});
    setForm(formulaireVide());
  }, [open]);

  if (!open || !form) return null;

  const brut = Number(form.montant_brut) || 0;
  const net = brut - (Number(form.montant_ponction) || 0);
  const maj = (patch) => setForm((f) => ({ ...f, ...patch }));

  const validate = () => {
    const errs = {};
    if (!form.personne_id) errs.personne_id = 'La personne est obligatoire';
    if (!PERIODE.test(form.periode)) errs.periode = 'Le mois est obligatoire';
    if (!(brut > 0)) errs.montant_brut = 'Le montant brut doit être supérieur à 0';
    if (Number(form.montant_ponction) < 0) errs.montant_ponction = 'La ponction ne peut pas être négative';
    else if (net < 0) errs.montant_ponction = 'La ponction ne peut pas dépasser le brut';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      personne_id: form.personne_id,
      periode: form.periode,
      libelle: form.libelle.trim(),
      montant_brut: brut,
      montant_ponction: Number(form.montant_ponction) || 0,
      observation: form.observation.trim(),
    };
    try {
      const item = await salairesService.create(payload);
      toast.success(`Rémunération de ${item.personne_nom} enregistrée — ${formatFCFA(item.montant_du)}`);
      onSaved?.(item);
    } catch (err) {
      showServerErrors(err, { setFormErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Nouvelle rémunération" size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSubmit} loading={saving}>Enregistrer</Button>
        </>
      }>
      <div className="space-y-4">
        <p className="rounded-lg bg-cream-50 px-3 py-2 text-xs text-ink-600">
          Les travaux génèrent eux-mêmes leur rémunération. Cette saisie sert aux rémunérations hors travail ; une fois
          enregistrée, elle ne se modifie plus (en cas d'erreur : l'annuler, tant qu'elle n'a aucun paiement, puis la ressaisir).
        </p>
        <Select
          label="Personne"
          required
          options={personnes.filter((p) => p.actif || p.id === form.personne_id)
            .map((p) => ({ value: p.id, label: `${p.prenom} ${p.nom} — ${p.matricule}` }))}
          placeholder="Rechercher une personne"
          value={form.personne_id}
          onChange={(e) => maj({ personne_id: e.target.value })}
          error={formErrors.personne_id}
        />
        <Input label="Mois" required type="month" value={form.periode}
          onChange={(e) => maj({ periode: e.target.value })} error={formErrors.periode}
          hint={MOIS_NATIF ? undefined : PERIODE.test(form.periode) ? formatPeriode(form.periode) : 'Format AAAA-MM'} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Montant brut (FCFA)" required type="number" min="0" step="any" value={form.montant_brut}
            onChange={(e) => maj({ montant_brut: e.target.value })} error={formErrors.montant_brut} />
          <Input label="Ponction (FCFA)" type="number" min="0" step="any" placeholder="0" value={form.montant_ponction}
            onChange={(e) => maj({ montant_ponction: e.target.value })} error={formErrors.montant_ponction} />
        </div>
        {/* Champs facultatifs repliés (libellé par défaut : « Rémunération <mois> ») ; ouverts s'ils sont renseignés ou en erreur */}
        <PlusDOptions
          key={formErrors.libelle || formErrors.observation ? 'erreur' : 'options'}
          resume="Libellé, observation"
          ouvertParDefaut={!!(form.libelle || form.observation || formErrors.libelle || formErrors.observation)}
        >
          <Input label="Libellé" placeholder={`Rémunération ${PERIODE.test(form.periode) ? formatPeriode(form.periode).toLowerCase() : ''}`}
            value={form.libelle} onChange={(e) => maj({ libelle: e.target.value })} error={formErrors.libelle} />
          <Input label="Observation" value={form.observation} onChange={(e) => maj({ observation: e.target.value })} error={formErrors.observation} />
        </PlusDOptions>
        <div className="flex items-center justify-between rounded-lg bg-forest-50 px-4 py-3">
          <span className="text-sm font-medium text-forest-800">Net à payer</span>
          <span className="text-lg font-semibold tabular-nums text-forest-800">{formatFCFA(Math.max(net, 0))}</span>
        </div>
      </div>
    </Modal>
  );
}
