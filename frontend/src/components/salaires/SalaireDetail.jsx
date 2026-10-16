import { Ban, Eye, HandCoins, Pencil, RotateCcw, Trash2, Users } from 'lucide-react';
import { Badge, Button, Modal } from '@/components/ui';
import { formatDate, formatFCFA, formatNumber } from '@/utils/format';
import { ROLE_TRAVAIL_LABELS, STATUT_SALAIRE_LABELS, TYPE_PAIEMENT_LABELS } from '@/constants';

function Ligne({ label, children }) {
  return (
    <div className="flex justify-between gap-3 border-b border-ink-100 py-1.5 text-sm last:border-0">
      <span className="text-ink-500">{label}</span>
      <span className="text-right font-medium text-ink-800">{children || '—'}</span>
    </div>
  );
}

/**
 * Fiche d'une rémunération : travail, équipe, situation de chaque membre (payé via le chef…) et paiements avec reçus.
 * Une rémunération ne se modifie pas (elle vient du travail) : la fiche propose « Payer » et, pour chaque paiement,
 * l'aperçu du reçu, la correction et (Super admin) la suppression.
 * onPayer : action principale ; onApercu(paiement) : aperçu du reçu.
 */
export default function SalaireDetail({ salaire, isBoss, onClose, onPayer, onApercu, onModifierPaiement, onSupprimerPaiement, onAnnulerPaiement, onReactiverPaiement }) {
  if (!salaire) return null;
  const travail = salaire.travail;
  const payable = salaire.reste > 0 && salaire.statut !== 'ANNULEE';

  return (
    <Modal open onClose={onClose} size="xl" title={travail ? `${travail.activite} — ${salaire.bloc_code}` : salaire.libelle}
      footer={
        <>
          {payable && <Button onClick={() => onPayer(salaire)}><HandCoins size={15} /> Payer {formatFCFA(salaire.reste)}</Button>}
          {/* Sur téléphone, la croix du haut suffit quand une autre action est proposée */}
          <Button variant="outline" onClick={onClose} className={payable ? 'hidden sm:inline-flex' : ''}>Fermer</Button>
        </>
      }>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge status={salaire.statut}>{STATUT_SALAIRE_LABELS[salaire.statut]}</Badge>
          <Badge status={travail ? 'done' : 'planned'}>{travail ? 'Travail' : 'Saisie manuelle'}</Badge>
          <span className="text-sm text-ink-500">
            {[salaire.plantation_nom, salaire.campement_nom, salaire.bloc_code].filter(Boolean).join(' · ')}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <section>
            <h3 className="mb-1 text-sm font-semibold text-ink-800">{travail ? 'Travail' : 'Rémunération'}</h3>
            {travail ? (
              <>
                <Ligne label="Activité">{travail.activite}</Ligne>
                <Ligne label="Dates">{formatDate(travail.date_debut)} → {formatDate(travail.date_fin)}</Ligne>
                <Ligne label="Quantité">{formatNumber(travail.quantite)} {travail.unite}</Ligne>
                <Ligne label="Prix unitaire">{formatFCFA(travail.prix_unitaire)}</Ligne>
                <Ligne label="Statut du travail">{travail.statut_libelle}</Ligne>
              </>
            ) : (
              <>
                <Ligne label="Personne">{salaire.personne_nom} ({salaire.matricule})</Ligne>
                <Ligne label="Période">{formatDate(salaire.date_debut)} → {formatDate(salaire.date_fin)}</Ligne>
              </>
            )}
            {salaire.observation && <Ligne label="Observation">{salaire.observation}</Ligne>}
          </section>
          <section>
            <h3 className="mb-1 text-sm font-semibold text-ink-800">Montants</h3>
            <Ligne label="Montant brut">{formatFCFA(salaire.montant_brut)}</Ligne>
            {Number(salaire.montant_ponction) > 0 && <Ligne label="Ponction">{formatFCFA(salaire.montant_ponction)}</Ligne>}
            <Ligne label="Total dû (net)">{formatFCFA(salaire.montant_du)}</Ligne>
            {salaire.avance > 0 && <Ligne label="Dont avance versée">{formatFCFA(salaire.avance)}</Ligne>}
            <Ligne label="Payé">{formatFCFA(salaire.montant_paye)}</Ligne>
            <Ligne label="Reste à payer">{formatFCFA(salaire.reste)}</Ligne>
          </section>
        </div>

        {salaire.participants.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-800">
              <Users size={15} /> {salaire.equipe ? `Équipe « ${salaire.equipe.nom} »` : 'Personne'}
            </h3>
            <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100">
              {salaire.participants.map((p) => (
                <li key={p.personne_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium text-ink-800">{p.nom}</span>
                    <span className="ml-1.5 text-xs text-ink-500">{ROLE_TRAVAIL_LABELS[p.role] || p.role}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    {p.montant_recu > 0 && <span className="tabular-nums text-ink-600">Reçu {formatFCFA(p.montant_recu)}</span>}
                    {p.paye_via_libelle
                      ? <span className="text-olive-700">{p.paye_via_libelle}</span>
                      : <Badge status={p.statut}>{STATUT_SALAIRE_LABELS[p.statut]}</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink-800">Paiements</h3>
          {salaire.paiements.length === 0 ? (
            <p className="text-sm text-ink-500">Aucun paiement pour le moment.</p>
          ) : (
            <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100">
              {salaire.paiements.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className={`text-xs font-medium tabular-nums ${p.annule ? 'text-ink-500 line-through' : 'text-forest-700'}`}>{p.numero}</span>
                    <span className="ml-2 text-ink-700">{p.beneficiaire_nom}</span>
                    {p.annule && <Badge status="ANNULEE" className="ml-2">Annulé</Badge>}
                    {p.est_avance && <Badge status="pending" className="ml-2">Avance</Badge>}
                    {salaire.equipe && p.via_chef && <span className="ml-2 text-2xs text-forest-700">via le chef d'équipe</span>}
                    <span className="block text-xs tabular-nums text-ink-500">
                      {formatDate(p.date)} · {TYPE_PAIEMENT_LABELS[p.type_paiement]}{p.reference ? ` · Réf. ${p.reference}` : ''}
                    </span>
                    {p.observation && <span className="block text-xs text-ink-500">{p.observation}</span>}
                    {p.annule && p.motif_annulation && <span className="block text-xs text-earth-700">Motif d'annulation : {p.motif_annulation}</span>}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={`mr-1 tabular-nums font-medium ${p.annule ? 'text-ink-500 line-through' : 'text-ink-800'}`}>{formatFCFA(p.montant)}</span>
                    <button type="button" onClick={() => onApercu(p)} title="Aperçu du reçu" aria-label={`Aperçu du reçu ${p.numero}`}
                      className="rounded-lg p-2.5 text-ink-500 transition-colors hover:bg-forest-50 hover:text-forest-700 md:p-1.5"><Eye size={15} /></button>
                    {!p.annule && (
                      <button type="button" onClick={() => onModifierPaiement(p)} title="Modifier" aria-label={`Modifier ${p.numero}`}
                        className="rounded-lg p-2.5 text-ink-500 transition-colors hover:bg-forest-50 hover:text-forest-700 md:p-1.5"><Pencil size={15} /></button>
                    )}
                    {!p.annule && onAnnulerPaiement && (
                      <button type="button" onClick={() => onAnnulerPaiement(p)} title="Annuler le paiement" aria-label={`Annuler le paiement ${p.numero}`}
                        className="rounded-lg p-2.5 text-ink-500 transition-colors hover:bg-earth-50 hover:text-earth-600 md:p-1.5"><Ban size={15} /></button>
                    )}
                    {p.annule && onReactiverPaiement && (
                      <button type="button" onClick={() => onReactiverPaiement(p)} title="Réactiver le paiement" aria-label={`Réactiver le paiement ${p.numero}`}
                        className="rounded-lg p-2.5 text-ink-500 transition-colors hover:bg-forest-50 hover:text-forest-700 md:p-1.5"><RotateCcw size={15} /></button>
                    )}
                    {isBoss && (
                      <button type="button" onClick={() => onSupprimerPaiement(p)} title="Supprimer" aria-label={`Supprimer ${p.numero}`}
                        className="rounded-lg p-2.5 text-ink-500 transition-colors hover:bg-earth-50 hover:text-earth-600 md:p-1.5"><Trash2 size={15} /></button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}
