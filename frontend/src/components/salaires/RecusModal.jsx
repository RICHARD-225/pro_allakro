import { useState } from 'react';
import { CheckCircle2, Eye, FileDown, Printer } from 'lucide-react';
import { Badge, Button, Modal } from '@/components/ui';
import ApercuRecuModal from '@/components/salaires/ApercuRecuModal';
import { imprimerRecu } from '@/components/salaires/RecuPaiement';
import { useToast } from '@/contexts/ToastContext';
import { paiementsService } from '@/services';
import { formatDate, formatFCFA } from '@/utils/format';
import { showServerErrors } from '@/utils/errors';
import { TYPE_PAIEMENT_LABELS } from '@/constants';

/**
 * Confirmation affichée après un paiement : récapitulatif et, pour chaque paiement enregistré, les reçus :
 * « Aperçu du reçu » (le reçu tel qu'il sera imprimé), « Imprimer le reçu » et le fichier PDF.
 */
export default function RecusModal({ paiements, onClose }) {
  const toast = useToast();
  const [enCours, setEnCours] = useState(null);
  const [apercu, setApercu] = useState(null);
  if (!paiements?.length) return null;
  const total = paiements.reduce((s, p) => s + Number(p.montant || 0), 0);

  const telecharger = async (paiement) => {
    setEnCours(paiement.id);
    try {
      await paiementsService.telechargerRecu(paiement.id);
    } catch (err) {
      showServerErrors(err, { toast });
    } finally {
      setEnCours(null);
    }
  };

  return (
    <>
      <Modal open onClose={onClose} title="Paiement enregistré" size="lg"
        footer={<Button onClick={onClose}>Terminer</Button>}>
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-leaf-50 px-4 py-3">
            <CheckCircle2 size={22} className="shrink-0 text-leaf-600" />
            <div className="min-w-0">
              <p className="font-semibold text-ink-800">{formatFCFA(total)} versé(s) à {paiements[0].beneficiaire_nom}</p>
              <p className="text-xs text-ink-500">
                {paiements.length > 1 ? `${paiements.length} rémunérations payées ensemble` : paiements[0].salaire_libelle}
                {' · '}enregistré dans les dépenses (Salaires et rémunérations)
              </p>
            </div>
          </div>
          <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100">
            {paiements.map((p) => (
              <li key={p.id} className="space-y-2.5 px-3 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-800">
                      <span className="text-xs font-medium tabular-nums text-forest-700">{p.numero}</span>
                      <span className="ml-2">{p.activite || p.salaire_libelle}</span>
                      {p.equipe_nom && <span className="font-normal text-ink-500"> · {p.equipe_nom}</span>}
                    </p>
                    <p className="text-xs text-ink-500">
                      {formatDate(p.date)} · {TYPE_PAIEMENT_LABELS[p.type_paiement]} · {p.bloc_code || '—'}
                      {p.reference && <> · Réf. {p.reference}</>}
                    </p>
                    {p.via_chef && <Badge status="done" className="mt-1">Paiement effectué via le chef d'équipe</Badge>}
                  </div>
                  <span className="tabular-nums font-semibold text-ink-800">{formatFCFA(p.montant)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setApercu(p)}><Eye size={14} /> Aperçu du reçu</Button>
                  <Button size="sm" variant="outline" onClick={() => imprimerRecu(p)}><Printer size={14} /> Imprimer le reçu</Button>
                  <Button size="sm" variant="ghost" onClick={() => telecharger(p)} loading={enCours === p.id}>
                    {enCours !== p.id && <FileDown size={14} />} PDF
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
      <ApercuRecuModal paiement={apercu} onClose={() => setApercu(null)} />
    </>
  );
}
