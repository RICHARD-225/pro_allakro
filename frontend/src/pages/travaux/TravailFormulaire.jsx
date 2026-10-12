import { User } from 'lucide-react';
import BlocPicker from '@/components/BlocPicker';
import { Badge, Button, Input, Modal, MultiSelect, PlusDOptions, Select } from '@/components/ui';
import { formatFCFA, formatNumber } from '@/utils/format';
import { today } from '@/utils/errors';
import { STATUT_TRAVAIL_LABELS, TYPE_PAIEMENT_LABELS } from '@/constants';

function Section({ titre, children }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-ink-800">{titre}</h3>
      {children}
    </section>
  );
}

/**
 * Fenêtre « Nouveau travail » / « Modifier le travail » : activité et lieu, dates, quantité et montant, personnes et équipe, avance.
 * L'état du formulaire et la validation restent dans la page (props).
 */
export default function TravailFormulaire({
  edition, enModification, form, formErrors, maj, saving, onClose, onSubmit,
  activites, campements, blocs, unites, optionsPersonnes, choisirActivite, choisirPersonnes, activiteChoisie, blocChoisi,
  montant, enEquipe, nomDe, titulaire, statutPrevu, avanceExistante, nomEquipeParDefaut, erreurOptions, optionsRenseignees, isBoss,
}) {
  return (
    <Modal
      open={!!edition}
      onClose={() => onClose()}
      title={enModification ? `Modifier « ${edition.activite} » — ${edition.bloc_code}` : 'Nouveau travail'}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={() => onClose()}>Annuler</Button>
          <Button onClick={onSubmit} loading={saving}>Enregistrer</Button>
        </>
      }
    >
      <div className="space-y-6">
        <Section titre="Activité et lieu">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label="Activité"
              required
              options={activites.filter((a) => a.actif || a.id === form.type_travail_id).map((a) => ({ value: a.id, label: a.libelle }))}
              placeholder="Choisir une activité"
              value={form.type_travail_id}
              onChange={(e) => choisirActivite(e.target.value)}
              error={formErrors.type_travail_id}
            />
            {activiteChoisie?.precision_requise && (
              <Input
                label="Nom de l'activité"
                required
                placeholder="Ex : Trouaison"
                value={form.activite_autre}
                onChange={(e) => maj({ activite_autre: e.target.value })}
                error={formErrors.activite_autre}
              />
            )}
          </div>
          <BlocPicker campements={campements} blocs={blocs} value={form} onChange={maj} required errors={formErrors} />
          {blocChoisi && (
            <p className="text-xs tabular-nums text-ink-500">
              {blocChoisi.code} — {formatNumber(blocChoisi.superficie)} ha · {formatNumber(blocChoisi.nombre_plantes)} plantes
            </p>
          )}
        </Section>

        <Section titre="Dates">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input label="Date de début" required type="date" value={form.date_travail}
              onChange={(e) => maj({ date_travail: e.target.value, date_fin: form.date_fin && form.date_fin < e.target.value ? e.target.value : form.date_fin })}
              error={formErrors.date_travail} />
            <Input label="Date de fin" required type="date" min={form.date_travail || undefined} value={form.date_fin}
              onChange={(e) => maj({ date_fin: e.target.value })} error={formErrors.date_fin} />
            <div>
              <p className="label-base">Statut</p>
              <div className="flex h-[38px] items-center gap-2">
                {enModification && edition.statut === 'ANNULE'
                  ? <Badge status="ANNULE">Annulé</Badge>
                  : <Badge status={statutPrevu}>{STATUT_TRAVAIL_LABELS[statutPrevu]}</Badge>}
                <span className="text-xs text-ink-500">selon les dates</span>
              </div>
            </div>
          </div>
        </Section>

        <Section titre="Quantité et montant">
          {/* Téléphone : unité et quantité côte à côte, prix sur toute la largeur */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Select
              label="Unité"
              required
              options={unites.unites.map((u) => ({ value: u.code, label: u.libelle }))}
              placeholder=""
              value={form.unite}
              onChange={(e) => maj({ unite: e.target.value || unites.defaut })}
              error={formErrors.unite}
            />
            <Input label="Quantité" required type="number" min="0" step="any" placeholder="0" value={form.quantite}
              onChange={(e) => maj({ quantite: e.target.value })} error={formErrors.quantite} />
            <Input label="Prix unitaire (FCFA)" required type="number" min="0" step="any" placeholder="0" value={form.prix_unitaire}
              onChange={(e) => maj({ prix_unitaire: e.target.value })} error={formErrors.prix_unitaire}
              className="col-span-2 sm:col-span-1" />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-forest-50 px-4 py-3">
            <span className="text-sm font-medium text-forest-800">
              Montant total (salaire à payer)
              <span className="block text-xs font-normal tabular-nums text-forest-600">
                {formatNumber(Number(form.quantite) || 0)} {form.unite} × {formatFCFA(Number(form.prix_unitaire) || 0)}
              </span>
            </span>
            <span className="text-lg font-semibold tabular-nums text-forest-800">{formatFCFA(montant)}</span>
          </div>
        </Section>

        <Section titre="Personnes et équipe">
          <MultiSelect
            label="Personnes qui réalisent le travail *"
            options={optionsPersonnes}
            value={form.personnes_ids}
            onChange={choisirPersonnes}
            placeholder="Nom, matricule ou bloc..."
            error={formErrors.personnes_ids}
            hint={form.bloc_id ? 'Les personnes affectées au bloc choisi apparaissent en premier.' : undefined}
          />
          {form.personnes_ids.length === 1 && (
            <p className="flex items-center gap-2 rounded-lg bg-cream-50 px-3 py-2 text-sm text-ink-700">
              <User size={15} className="text-forest-600" />
              <span><strong className="font-semibold">{nomDe(form.personnes_ids[0])}</strong> est le responsable du travail et reçoit sa rémunération.</span>
            </p>
          )}
          {enEquipe && (
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-forest-100 bg-forest-50/40 p-3 sm:grid-cols-2">
              <Input label="Nom de l'équipe" placeholder={nomEquipeParDefaut} value={form.equipe_nom}
                onChange={(e) => maj({ equipe_nom: e.target.value })} error={formErrors.equipe_nom}
                hint="Laissez vide pour le nom proposé." />
              <Select
                label="Chef d'équipe"
                required
                options={form.personnes_ids.map((id) => ({ value: id, label: nomDe(id) }))}
                placeholder="Choisir parmi les personnes"
                value={form.chef_id}
                onChange={(e) => maj({ chef_id: e.target.value })}
                error={formErrors.chef_id}
                hint="Le chef reçoit la rémunération de l'équipe."
              />
            </div>
          )}
          {enModification && form.personnes_ids.length > 0 && (
            <p className="text-xs text-ink-500">
              Les changements (arrivée, départ, nouveau chef) sont conservés dans l'historique de l'équipe.
            </p>
          )}
        </Section>

        <Section titre="Avance">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-ink-700">Une avance est-elle versée ?</span>
            <div className="inline-flex rounded-lg border border-ink-200 p-0.5" role="radiogroup" aria-label="Avance versée">
              {[{ v: false, l: 'Non' }, { v: true, l: 'Oui' }].map((o) => (
                <button key={o.l} type="button" role="radio" aria-checked={form.avance_oui === o.v}
                  onClick={() => maj({ avance_oui: o.v })}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${form.avance_oui === o.v ? 'bg-forest-600 text-white' : 'text-ink-600 hover:bg-cream-100'}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          {form.avance_oui && (
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-olive-100 bg-olive-50/40 p-3 sm:grid-cols-2">
              <Input label="Montant de l'avance (FCFA)" required type="number" min="0" step="any" placeholder="0"
                value={form.avance_montant} onChange={(e) => maj({ avance_montant: e.target.value })} error={formErrors.avance_montant} />
              <Select
                label="Bénéficiaire"
                options={form.personnes_ids.map((id) => ({
                  value: id, label: id === titulaire ? `${nomDe(id)} (${enEquipe ? "chef d'équipe" : 'responsable'})` : nomDe(id),
                }))}
                placeholder={titulaire ? `${nomDe(titulaire)} (par défaut)` : 'Choisir les personnes du travail'}
                value={form.avance_beneficiaire_id}
                onChange={(e) => maj({ avance_beneficiaire_id: e.target.value })}
                error={formErrors.avance_beneficiaire_id}
              />
              <Select
                label="Mode de paiement"
                options={Object.entries(TYPE_PAIEMENT_LABELS).map(([value, label]) => ({ value, label }))}
                placeholder=""
                value={form.avance_type}
                onChange={(e) => maj({ avance_type: e.target.value || 'ESPECES' })}
              />
              <Input label="Date de l'avance" required type="date" max={today()} value={form.avance_date}
                onChange={(e) => maj({ avance_date: e.target.value })} error={formErrors.avance_date} />
              <p className="text-xs text-olive-800 sm:col-span-2">
                L'avance est enregistrée comme un paiement du salaire (dépense et reçu compris) :
                reste à payer après l'avance <strong className="font-semibold tabular-nums">{formatFCFA(Math.max(montant - (Number(form.avance_montant) || 0), 0))}</strong>.
              </p>
            </div>
          )}
          {!form.avance_oui && avanceExistante && (
            <p className="rounded-lg bg-earth-50 px-3 py-2 text-xs text-earth-700">
              L'avance {avanceExistante.numero} ({formatFCFA(avanceExistante.montant)}) sera supprimée avec sa dépense.
              {!isBoss && ' Seul le Big Boss peut supprimer une avance déjà versée.'}
            </p>
          )}
          {formErrors.avance && typeof formErrors.avance === 'string' && !formErrors.avance_montant && !formErrors.avance_beneficiaire_id && (
            <p className="text-xs text-earth-600">{formErrors.avance}</p>
          )}
        </Section>

        {/* Champs facultatifs repliés ; la clé change quand l'un d'eux est en erreur : le bloc se rouvre pour la montrer */}
        <PlusDOptions
          key={erreurOptions ? 'erreur' : 'normal'}
          resume="Nombre de jours, observation"
          ouvertParDefaut={erreurOptions || optionsRenseignees}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input label="Nombre de jours" type="number" min="0" step="any" placeholder="—" value={form.nombre_jours}
              onChange={(e) => maj({ nombre_jours: e.target.value })} error={formErrors.nombre_jours} />
            <Input label="Observation" placeholder="Remarque éventuelle" value={form.observation}
              onChange={(e) => maj({ observation: e.target.value })} error={formErrors.observation}
              className="sm:col-span-2" />
          </div>
        </PlusDOptions>
      </div>
    </Modal>
  );
}
