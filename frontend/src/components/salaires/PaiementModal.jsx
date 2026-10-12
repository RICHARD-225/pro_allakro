import { useEffect, useState } from 'react';
import { Users, User, Info } from 'lucide-react';
import { Button, Input, Modal, PlusDOptions, Select } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { paiementsService } from '@/services';
import { formatDate, formatFCFA, formatNumber } from '@/utils/format';
import { showServerErrors, today } from '@/utils/errors';
import { ROLE_TRAVAIL_LABELS, TYPE_PAIEMENT_LABELS } from '@/constants';

function Ligne({ label, children }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-ink-500">{label}</span>
      <span className="text-right font-medium tabular-nums text-ink-800">{children || '—'}</span>
    </div>
  );
}

/**
 * Paiement d'une rémunération, pré-rempli (bénéficiaire : chef d'équipe ou personne seule, montant : reste à payer).
 * Avec `paiement`, corrige un paiement existant (montant, date, mode, bénéficiaire).
 */
export default function PaiementModal({ salaire, paiement = null, onClose, onSaved }) {
  const toast = useToast();
  const edition = !!paiement;
  const [form, setForm] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!salaire) return;
    setFormErrors({});
    setForm({
      beneficiaire_id: paiement?.beneficiaire_id || salaire.beneficiaires?.[0]?.id || salaire.personne_id,
      montant: String(paiement ? paiement.montant : salaire.reste),
      date: paiement?.date || today(),
      type_paiement: paiement?.type_paiement || 'ESPECES',
      reference: paiement?.reference || '',
      observation: paiement?.observation || '',
    });
  }, [salaire?.id, paiement?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!salaire || !form) return null;

  const maximum = salaire.reste + (edition ? Number(paiement.montant) : 0);
  const travail = salaire.travail;
  const equipe = salaire.equipe;
  const beneficiaire = salaire.beneficiaires.find((b) => b.id === form.beneficiaire_id);
  const autres = salaire.participants.filter((p) => p.personne_id !== form.beneficiaire_id);
  const viaChef = equipe && form.beneficiaire_id === equipe.chef_id;
  const maj = (patch) => setForm((f) => ({ ...f, ...patch }));

  const validate = () => {
    const errs = {};
    if (!form.beneficiaire_id) errs.beneficiaire_id = 'Le bénéficiaire est obligatoire';
    if (!(Number(form.montant) > 0)) errs.montant = 'Le montant doit être supérieur à 0';
    else if (Number(form.montant) > maximum + 0.001) errs.montant = `Dépasse le reste à payer (${formatFCFA(maximum)})`;
    if (!form.date) errs.date = 'La date est obligatoire';
    else if (form.date > today()) errs.date = 'La date ne peut pas être dans le futur';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      beneficiaire_id: form.beneficiaire_id,
      montant: Number(form.montant),
      date: form.date,
      type_paiement: form.type_paiement,
      reference: form.reference.trim(),
      observation: form.observation.trim(),
    };
    try {
      const enregistre = edition
        ? await paiementsService.update(paiement.id, payload)
        : await paiementsService.create({ ...payload, salaire_id: salaire.id });
      toast.success(edition ? `Paiement ${enregistre.numero} modifié` : `Paiement ${enregistre.numero} enregistré — ${formatFCFA(enregistre.montant)}`);
      onSaved?.(enregistre, edition);
    } catch (err) {
      showServerErrors(err, { setFormErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="xl"
      title={edition ? `Modifier le paiement ${paiement.numero}` : `Payer — ${travail ? travail.activite : salaire.libelle}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSubmit} loading={saving}>{edition ? 'Enregistrer' : `Payer ${formatFCFA(Number(form.montant) || 0)}`}</Button>
        </>
      }>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-ink-100 bg-cream-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-ink-800">Récapitulatif</h3>
          <Ligne label="Personnes">
            {salaire.participants.length ? salaire.participants.map((p) => p.nom).join(', ') : salaire.personne_nom}
          </Ligne>
          <Ligne label="Plantation · campement">{[salaire.plantation_nom, salaire.campement_nom].filter(Boolean).join(' · ')}</Ligne>
          <Ligne label="Bloc">{salaire.bloc_code}</Ligne>
          {travail ? (
            <>
              <Ligne label="Travail · activité">{travail.activite}</Ligne>
              {equipe && <Ligne label="Équipe">{equipe.nom}</Ligne>}
              <Ligne label={equipe ? "Chef d'équipe" : 'Responsable'}>{equipe ? equipe.chef_nom : salaire.personne_nom}</Ligne>
              <Ligne label="Dates">{formatDate(travail.date_debut)} → {formatDate(travail.date_fin)}</Ligne>
              <Ligne label="Quantité">{formatNumber(travail.quantite)} {travail.unite} × {formatFCFA(travail.prix_unitaire)}</Ligne>
            </>
          ) : (
            <>
              <Ligne label="Rémunération">{salaire.libelle}</Ligne>
              <Ligne label="Période">{formatDate(salaire.date_debut)} → {formatDate(salaire.date_fin)}</Ligne>
            </>
          )}
          <div className="my-2 border-t border-ink-100" />
          <Ligne label="Montant dû (net)">{formatFCFA(salaire.montant_du)}</Ligne>
          {salaire.avance > 0 && <Ligne label="Avance versée">{formatFCFA(salaire.avance)}</Ligne>}
          <Ligne label="Déjà payé">{formatFCFA(salaire.montant_paye)}</Ligne>
          <div className="mt-1 flex justify-between rounded-lg bg-forest-600 px-3 py-2 text-white">
            <span className="text-sm">Reste à payer</span>
            <span className="font-semibold tabular-nums">{formatFCFA(salaire.reste)}</span>
          </div>
        </section>

        <section className="space-y-3">
          <Select
            label="Bénéficiaire"
            required
            options={salaire.beneficiaires.map((b) => ({
              value: b.id,
              label: `${b.nom} — ${ROLE_TRAVAIL_LABELS[b.role] || b.role}${equipe && b.id === equipe.chef_id ? ' (par défaut)' : ''}`,
            }))}
            placeholder=""
            value={form.beneficiaire_id}
            onChange={(e) => maj({ beneficiaire_id: e.target.value || salaire.beneficiaires?.[0]?.id })}
            error={formErrors.beneficiaire_id}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Montant (FCFA)" required type="number" min="0" step="any" value={form.montant}
              onChange={(e) => maj({ montant: e.target.value })} error={formErrors.montant}
              hint={`Maximum : ${formatFCFA(maximum)}`} />
            <Input label="Date du paiement" required type="date" max={today()} value={form.date}
              onChange={(e) => maj({ date: e.target.value })} error={formErrors.date} />
            <Select
              label="Mode de paiement"
              options={Object.entries(TYPE_PAIEMENT_LABELS).map(([value, label]) => ({ value, label }))}
              placeholder=""
              value={form.type_paiement}
              onChange={(e) => maj({ type_paiement: e.target.value || 'ESPECES' })}
              error={formErrors.type_paiement}
            />
          </div>
          {/* Champs facultatifs repliés ; rouverts d'office si le serveur refuse la référence */}
          <PlusDOptions
            key={formErrors.reference ? 'erreur' : 'options'}
            resume="Référence, observation"
            ouvertParDefaut={!!(form.reference || form.observation || formErrors.reference)}
          >
            <Input label="Référence" placeholder="N° de transaction…" value={form.reference}
              onChange={(e) => maj({ reference: e.target.value })} error={formErrors.reference} />
            <Input label="Observation" value={form.observation} onChange={(e) => maj({ observation: e.target.value })} />
          </PlusDOptions>

          {equipe ? (
            <div className="flex gap-2 rounded-lg bg-forest-50 px-3 py-2.5 text-xs text-forest-800">
              <Users size={15} className="mt-0.5 shrink-0" />
              <p>
                Paiement d'équipe : le montant est remis à <strong className="font-semibold">{beneficiaire?.nom}</strong>.
                {autres.length > 0 && (
                  <> Les autres membres ({autres.map((p) => p.nom).join(', ')}) seront marqués
                    « {viaChef ? "Payé via le chef d'équipe" : `Payé via ${beneficiaire?.nom}`} ».</>
                )}
              </p>
            </div>
          ) : (
            <div className="flex gap-2 rounded-lg bg-cream-50 px-3 py-2.5 text-xs text-ink-700">
              <User size={15} className="mt-0.5 shrink-0 text-forest-600" />
              <p>Paiement individuel à <strong className="font-semibold">{beneficiaire?.nom || salaire.personne_nom}</strong>.</p>
            </div>
          )}
          <p className="flex items-start gap-1.5 text-xs text-ink-500">
            <Info size={12} className="mt-0.5 shrink-0" />
            Le paiement est enregistré dans les dépenses (Salaires et rémunérations) et un reçu est généré.
          </p>
        </section>
      </div>
    </Modal>
  );
}
