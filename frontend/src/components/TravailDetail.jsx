import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, Ban, RotateCcw, Wallet, Pencil } from 'lucide-react';
import { Badge, Button, Modal } from '@/components/ui';
import RowActions from '@/components/RowActions';
import { useToast } from '@/contexts/ToastContext';
import { travauxService } from '@/services';
import { formatDate, formatDateTime, formatFCFA, formatNumber } from '@/utils/format';
import { showServerErrors } from '@/utils/errors';
import { STATUT_TRAVAIL_LABELS, TYPE_PAIEMENT_LABELS } from '@/constants';

function Ligne({ label, children }) {
  return (
    <div className="flex justify-between gap-3 border-b border-ink-100 py-1.5 text-sm last:border-0">
      <span className="text-ink-500">{label}</span>
      <span className="text-right font-medium tabular-nums text-ink-800">{children ?? '—'}</span>
    </div>
  );
}

/**
 * Fiche d'un travail : informations, équipe (et son historique), rémunération à payer et avance, actions.
 * Le travail n'a que son propre statut (À venir, En cours, Terminé, Annulé) : l'état de sa rémunération et ses
 * paiements se suivent dans Salaires (lien « Rémunération »).
 * onModifier(travail) : « Modifier » dans le pied ; onSupprimer(travail) : « Supprimer » (Super admin) dans le menu « ⋯ ».
 * Pied : « Modifier » et le lien vers la rémunération visibles ; annuler / supprimer dans le menu « ⋯ » (comme dans la liste).
 */
export default function TravailDetail({ travail, onClose, onChange, onAnnuler, onModifier, onSupprimer }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [historique, setHistorique] = useState([]);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (!travail) return;
    travauxService.historique(travail.id).then(setHistorique).catch(() => setHistorique([]));
  }, [travail?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!travail) return null;
  const remuneration = travail.remuneration;
  const retraits = historique.filter((h) => h.date_retrait);
  const annule = travail.statut === 'ANNULE';
  const peutAnnuler = !annule && onAnnuler;
  const peutCreerRemuneration = !remuneration && travail.responsable_id;
  const voirRemuneration = remuneration && !annule;
  // Sur téléphone, « Fermer » s'efface s'il y a une autre action (la croix du haut reste)
  const autresActions = peutAnnuler || onSupprimer || annule || peutCreerRemuneration || onModifier || voirRemuneration;

  const action = async (fonction, message) => {
    setEnCours(true);
    try {
      const mis = await fonction(travail.id);
      onChange?.(mis);
      toast.success(message);
    } catch (err) {
      showServerErrors(err, { toast });
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Modal open={!!travail} onClose={onClose} title={`${travail.activite} — ${travail.bloc_code}`} size="xl"
      footer={
        <>
          {(peutAnnuler || onSupprimer) && (
            <div className="mr-auto">
              <RowActions
                menu={[peutAnnuler && { label: 'Annuler le travail', icon: Ban, onClick: () => onAnnuler(travail) }]}
                onDelete={onSupprimer ? () => onSupprimer(travail) : undefined}
                deleteDisabled={!travail.peut_supprimer}
                deleteTitle="Des paiements (même annulés) sont rattachés : l'historique est conservé, annulez le travail plutôt"
                menuButtonClassName="rounded-lg border border-ink-200 bg-white p-2.5 text-ink-600 transition-colors hover:bg-cream-50 hover:text-ink-800"
              />
            </div>
          )}
          {annule && (
            <Button variant="outline" onClick={() => action(travauxService.retablir, 'Travail rétabli')} loading={enCours}>
              <RotateCcw size={15} /> Rétablir
            </Button>
          )}
          {peutCreerRemuneration && (
            <Button variant="outline" onClick={() => action(travauxService.creerRemuneration, 'Rémunération créée')} loading={enCours}>
              <Wallet size={15} /> Créer la rémunération
            </Button>
          )}
          {onModifier && (
            <Button variant="outline" onClick={() => onModifier(travail)}><Pencil size={15} /> Modifier</Button>
          )}
          {/* Le paiement se fait dans Salaires : la fiche y renvoie, sans afficher d'état de paiement */}
          {voirRemuneration && (
            <Button onClick={() => navigate(`/salaires?voir=${remuneration.id}`)} title="Voir la rémunération dans Salaires">
              <Wallet size={15} /> Rémunération
            </Button>
          )}
          <Button variant="outline" onClick={onClose} className={autresActions ? 'hidden sm:inline-flex' : ''}>Fermer</Button>
        </>
      }>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge status={travail.statut}>{STATUT_TRAVAIL_LABELS[travail.statut]}</Badge>
          {travail.precision_requise && <Badge status="planned">Activité « AUTRE »</Badge>}
          <span className="text-sm text-ink-500">{travail.plantation_nom} · {travail.campement_nom} · {travail.bloc_code} — {travail.bloc_nom}</span>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <section>
            <h3 className="mb-1 text-sm font-semibold text-ink-800">Travail</h3>
            <Ligne label="Activité">{travail.activite}</Ligne>
            <Ligne label="Période">du {formatDate(travail.date_travail)} au {formatDate(travail.date_fin)}</Ligne>
            <Ligne label="Quantité">{formatNumber(travail.quantite)} {travail.unite}</Ligne>
            <Ligne label="Prix unitaire">{formatFCFA(travail.prix_unitaire)}</Ligne>
            <Ligne label="Montant total">{formatFCFA(travail.montant_total)}</Ligne>
            {Number(travail.nombre_jours) > 0 && <Ligne label="Nombre de jours">{formatNumber(travail.nombre_jours)}</Ligne>}
            {travail.observation && <Ligne label="Observation">{travail.observation}</Ligne>}
          </section>
          <section>
            <h3 className="mb-1 text-sm font-semibold text-ink-800">Rémunération</h3>
            {remuneration ? (
              <>
                <Ligne label="Montant à payer">{formatFCFA(remuneration.montant_du)}</Ligne>
                <Ligne label="Bénéficiaire">{travail.equipe_nom ? `${travail.responsable_nom} (chef d'équipe)` : travail.responsable_nom}</Ligne>
                {annule && (
                  <p className="pt-2 text-sm text-ink-500">Rémunération annulée avec le travail : elle n'est plus payable. Son historique reste dans Salaires.</p>
                )}
                {!annule && <p className="pt-2 text-xs text-ink-500">Le paiement et son suivi se font dans Salaires.</p>}
                {travail.avance && (
                  <Ligne label="Avance">
                    {formatFCFA(travail.avance.montant)} le {formatDate(travail.avance.date)} ({TYPE_PAIEMENT_LABELS[travail.avance.type_paiement]})
                  </Ligne>
                )}
              </>
            ) : (
              <p className="text-sm text-ink-500">
                {travail.responsable_id ? 'Ancien travail sans rémunération générée.' : 'Désignez les personnes du travail pour générer sa rémunération.'}
              </p>
            )}
          </section>
        </div>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink-800">
            {travail.equipe_nom ? `Équipe « ${travail.equipe_nom} »` : 'Personne responsable'}
          </h3>
          <div className="flex flex-wrap gap-2">
            {travail.participants.map((p) => (
              <span key={p.personne_id} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${p.role === 'CHEF' ? 'bg-forest-600 text-white' : 'bg-forest-50 text-forest-800'}`}>
                {p.nom}
                <span className={p.role === 'CHEF' ? 'text-forest-100' : 'text-forest-600'}>· {p.role_libelle}</span>
              </span>
            ))}
            {travail.participants.length === 0 && <span className="text-sm text-ink-500">Aucune personne enregistrée.</span>}
          </div>
        </section>

        {retraits.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-800"><History size={15} /> Historique de l'équipe</h3>
            <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100 text-sm">
              {historique.map((h) => (
                <li key={h.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                  <span className="text-ink-700">{h.nom} <span className="text-ink-500">· {h.role_libelle}</span></span>
                  <span className="text-xs tabular-nums text-ink-500">
                    depuis le {formatDateTime(h.date_ajout)}{h.date_retrait ? ` · jusqu'au ${formatDateTime(h.date_retrait)}` : ' · actuel'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}
