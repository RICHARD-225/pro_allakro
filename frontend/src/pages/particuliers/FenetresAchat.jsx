import { CheckCircle2, FileDown } from 'lucide-react';
import { Button, Input, Modal, Select } from '@/components/ui';
import { formatFCFA, formatNumber } from '@/utils/format';
import { today } from '@/utils/errors';
import { TYPES_PAIEMENT } from '@/pages/particuliers/AchatFormulaire';

/** Règlement d'un achat : montant (jamais au-delà du reste), date et mode de paiement. */
export function ReglementAchat({ achat, reglement, setReglement, erreurs, saving, onClose, onSubmit }) {
  return (
    <Modal
      open={!!achat}
      onClose={() => onClose()}
      title={`Régler l'achat ${achat?.reference || ''}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onClose()}>Annuler</Button>
          <Button onClick={onSubmit} loading={saving}>Enregistrer le paiement</Button>
        </>
      }
    >
      {achat && (
        <div className="space-y-4">
          <p className="text-sm text-ink-600">
            {achat.particulier_nom} — {achat.designation}<br />
            Montant {formatFCFA(achat.montant_total)}, déjà payé {formatFCFA(achat.montant_paye)}, <strong className="font-semibold">reste {formatFCFA(achat.reste)}</strong>
          </p>
          <Input
            label="Montant (FCFA)"
            required
            type="number"
            min="0"
            max={achat.reste}
            value={reglement.montant}
            onChange={(e) => setReglement({ ...reglement, montant: e.target.value })}
            error={erreurs.montant}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Date" type="date" max={today()} value={reglement.date} onChange={(e) => setReglement({ ...reglement, date: e.target.value })} error={erreurs.date} />
            <Select label="Mode" options={TYPES_PAIEMENT} placeholder="" value={reglement.type_paiement} onChange={(e) => setReglement({ ...reglement, type_paiement: e.target.value || 'ESPECES' })} />
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Confirmation après l'enregistrement d'un achat, avec le reçu PDF. */
export function AchatEnregistre({ achat, telechargement, onClose, onRecu }) {
  return (
    <Modal
      open={!!achat}
      onClose={() => onClose()}
      title="Achat enregistré"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onClose()}>Fermer</Button>
          <Button onClick={() => onRecu(achat)} loading={telechargement === achat?.id}>
            {telechargement !== achat?.id && <FileDown size={15} />} Télécharger le reçu
          </Button>
        </>
      }
    >
      {achat && (
        <div className="flex gap-3">
          <CheckCircle2 size={22} className="shrink-0 text-leaf-600" />
          <div className="text-sm text-ink-600">
            <p className="font-semibold text-ink-800">{achat.reference} — {formatFCFA(achat.montant_total)}</p>
            <p>{achat.particulier_nom} · {achat.designation} ({formatNumber(achat.poids)} {achat.unite_poids})</p>
            <p className="mt-1 text-xs text-ink-500">
              Payé {formatFCFA(achat.montant_paye)} · reste {formatFCFA(achat.reste)} · ajouté aux dépenses.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
