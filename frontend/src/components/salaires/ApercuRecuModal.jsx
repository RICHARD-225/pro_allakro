import { Ban, FileDown, Pencil, Printer, RotateCcw } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import RecuPaiement, { imprimerRecu } from '@/components/salaires/RecuPaiement';
import { useToast } from '@/contexts/ToastContext';
import { paiementsService } from '@/services';
import { showServerErrors } from '@/utils/errors';

/**
 * Aperçu du reçu d'un paiement, tel qu'il sera imprimé (même composant que l'impression), avec ses actions :
 * « Imprimer le reçu » (reçu seul, sans menu ni boutons), « Reçu PDF » (fichier A4) et, si fourni, « Modifier » le paiement.
 */
export default function ApercuRecuModal({ paiement, onClose, onModifier, onAnnuler, onReactiver }) {
  const toast = useToast();
  if (!paiement) return null;

  const telecharger = async () => {
    try {
      await paiementsService.telechargerRecu(paiement.id);
    } catch (err) {
      showServerErrors(err, { toast });
    }
  };

  return (
    <Modal open onClose={onClose} size="xl" title={`Aperçu du reçu ${paiement.numero}`}
      footer={
        <>
          <div className="mr-auto flex flex-wrap gap-2">
            {onModifier && !paiement.annule && (
              <Button variant="outline" onClick={() => onModifier(paiement)}><Pencil size={15} /> Modifier</Button>
            )}
            {onAnnuler && !paiement.annule && (
              <Button variant="outline" onClick={() => onAnnuler(paiement)}><Ban size={15} /> Annuler le paiement</Button>
            )}
            {onReactiver && paiement.annule && (
              <Button variant="outline" onClick={() => onReactiver(paiement)}><RotateCcw size={15} /> Réactiver le paiement</Button>
            )}
          </div>
          <Button variant="outline" onClick={telecharger}><FileDown size={15} /> Reçu PDF</Button>
          <Button onClick={() => imprimerRecu(paiement)}><Printer size={15} /> Imprimer le reçu</Button>
          <Button variant="outline" onClick={onClose} className="hidden sm:inline-flex">Fermer</Button>
        </>
      }>
      <RecuPaiement paiement={paiement} />
    </Modal>
  );
}
