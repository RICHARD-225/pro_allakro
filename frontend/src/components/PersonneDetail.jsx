import { useEffect, useState } from 'react';
import { Phone, MapPin, Briefcase, CalendarDays, Hash, UserCheck, UserX, FileDown, Users, Pencil } from 'lucide-react';
import { Badge, Button, Modal } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { personnesService, paiementsService } from '@/services';
import { formatDate, formatFCFA, formatNumber } from '@/utils/format';
import { showServerErrors } from '@/utils/errors';
import { STATUT_SALAIRE_LABELS, TYPE_PAIEMENT_LABELS } from '@/constants';

function Info({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={15} className="mt-0.5 shrink-0 text-forest-600" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-500">{label}</p>
        <p className="text-sm text-ink-800 wrap-break-word">{children || '—'}</p>
      </div>
    </div>
  );
}

/**
 * Fiche d'une personne : informations, statut (actif / inactif) et historique (travaux, rôle, équipe,
 * rémunérations dont « payé via le chef d'équipe », paiements reçus avec leur reçu).
 * onModifier : affiche « Modifier » dans le pied de la fiche (reçoit la personne affichée).
 */
export default function PersonneDetail({ personne, onClose, onChange, onModifier }) {
  const toast = useToast();
  const [historique, setHistorique] = useState(null);
  const [changement, setChangement] = useState(false);

  useEffect(() => {
    if (!personne) return;
    setHistorique(null);
    personnesService.historique(personne.id).then(setHistorique).catch((err) => showServerErrors(err, { toast }));
  }, [personne?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!personne) return null;

  const basculerStatut = async () => {
    setChangement(true);
    try {
      const mise = await personnesService.update(personne.id, { actif: !personne.actif });
      onChange?.(mise);
      toast.success(`${mise.prenom} ${mise.nom} est maintenant ${mise.actif ? 'active' : 'inactive'}`);
    } catch (err) {
      showServerErrors(err, { toast });
    } finally {
      setChangement(false);
    }
  };

  const recu = async (paiement) => {
    try {
      await paiementsService.telechargerRecu(paiement.id);
    } catch (err) {
      showServerErrors(err, { toast });
    }
  };

  return (
    <Modal open={!!personne} onClose={onClose} title={`${personne.prenom} ${personne.nom}`} size="xl"
      footer={
        <>
          {onModifier && (
            <Button variant="outline" onClick={() => onModifier(personne)} disabled={changement}>
              <Pencil size={15} /> Modifier
            </Button>
          )}
          {/* Sur téléphone, la croix du haut suffit quand « Modifier » est proposé */}
          <Button variant="outline" onClick={onClose} className={onModifier ? 'hidden sm:inline-flex' : ''}>Fermer</Button>
        </>
      }>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 rounded-xl border border-ink-100 bg-cream-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-forest-100 text-lg font-semibold text-forest-700">
              {personne.prenom?.[0]}{personne.nom?.[0]}
            </div>
            <div>
              <p className="font-semibold text-ink-800">{personne.prenom} {personne.nom}</p>
              <p className="text-xs font-medium tabular-nums text-forest-700">{personne.matricule}</p>
            </div>
            <Badge status={personne.actif ? 'active' : 'inactive'}>{personne.actif ? 'Active' : 'Inactive'}</Badge>
          </div>
          <Button variant={personne.actif ? 'outline-solid' : 'success'} size="sm" onClick={basculerStatut} loading={changement}>
            {!changement && (personne.actif ? <UserX size={15} /> : <UserCheck size={15} />)}
            {personne.actif ? 'Passer en inactive' : 'Réactiver'}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Info icon={Briefcase} label="Fonction">{personne.fonction_libelle}</Info>
          <Info icon={Phone} label="Téléphone">{personne.telephone}</Info>
          <Info icon={CalendarDays} label="Date d'embauche">{formatDate(personne.date_embauche)}</Info>
          <Info icon={MapPin} label="Plantation · Campement">
            {[personne.plantation_nom, personne.campement_nom].filter(Boolean).join(' · ')}
          </Info>
          <Info icon={Hash} label="Bloc d'affectation">{personne.bloc_code ? `${personne.bloc_code} — ${personne.bloc_nom}` : 'À affecter'}</Info>
          <Info icon={MapPin} label="Adresse">{personne.adresse}</Info>
        </div>
        {personne.observation && <p className="rounded-lg bg-cream-50 px-3 py-2 text-sm text-ink-600">{personne.observation}</p>}

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-800"><Users size={15} /> Travaux et rémunérations</h3>
          {!historique ? (
            <p className="text-sm text-ink-500">Chargement…</p>
          ) : historique.travaux.length === 0 ? (
            <p className="text-sm text-ink-500">Aucun travail pour le moment.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-ink-100">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-cream-50 text-left text-xs text-ink-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Travail</th>
                    <th className="px-3 py-2 font-medium">Rôle</th>
                    <th className="px-3 py-2 font-medium">Dates</th>
                    <th className="px-3 py-2 text-right font-medium">Montant</th>
                    <th className="px-3 py-2 font-medium">Paiement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {historique.travaux.map((t) => (
                    <tr key={`${t.travail_id}-${t.role}-${t.date_ajout}`} className={t.actuel ? '' : 'opacity-60'}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-ink-800">{t.activite}</p>
                        <p className="text-xs text-ink-500">{t.bloc_code}{t.equipe_nom ? ` · ${t.equipe_nom}` : ''}</p>
                      </td>
                      <td className="px-3 py-2 text-ink-600">
                        {t.role_libelle}
                        {!t.actuel && <span className="block text-2xs tabular-nums text-ink-500">jusqu'au {formatDate(t.date_retrait)}</span>}
                      </td>
                      <td className="px-3 py-2 text-xs tabular-nums text-ink-500">{formatDate(t.date_debut)} → {formatDate(t.date_fin)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatFCFA(t.montant_total)}</td>
                      <td className="px-3 py-2">
                        {t.remuneration ? (
                          <>
                            <Badge status={t.remuneration.statut}>{STATUT_SALAIRE_LABELS[t.remuneration.statut]}</Badge>
                            {t.remuneration.paye_via_libelle && <p className="mt-1 text-2xs text-olive-700">{t.remuneration.paye_via_libelle}</p>}
                            {t.remuneration.montant_recu > 0 && <p className="mt-1 text-2xs tabular-nums text-ink-500">Reçu : {formatFCFA(t.remuneration.montant_recu)}</p>}
                          </>
                        ) : <span className="text-xs text-ink-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {historique?.remunerations?.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink-800">Rémunérations saisies</h3>
            <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100">
              {historique.remunerations.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="text-ink-700">{r.libelle}</span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums text-ink-600">{formatFCFA(r.montant_du)}</span>
                    <Badge status={r.statut}>{STATUT_SALAIRE_LABELS[r.statut]}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {historique && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink-800">
              Paiements reçus <span className="font-normal tabular-nums text-ink-500">· total {formatFCFA(historique.total_recu)}</span>
            </h3>
            {historique.paiements.length === 0 ? (
              <p className="text-sm text-ink-500">Aucun paiement reçu.</p>
            ) : (
              <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100">
                {historique.paiements.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="text-xs font-medium tabular-nums text-forest-700">{p.numero}</span>
                      <span className="ml-2 text-ink-700">{p.salaire_libelle}</span>
                      {p.est_avance && <Badge status="pending" className="ml-2">Avance</Badge>}
                      {p.pour_equipe && <span className="ml-2 text-2xs text-olive-700">pour toute l'équipe</span>}
                      <span className="block text-xs tabular-nums text-ink-500">{formatDate(p.date)} · {TYPE_PAIEMENT_LABELS[p.type_paiement]}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums font-medium text-ink-800">{formatFCFA(p.montant)}</span>
                      <button type="button" onClick={() => recu(p)} className="rounded-lg p-2.5 text-ink-500 transition-colors hover:bg-forest-50 hover:text-forest-700 md:p-1.5"
                        aria-label={`Télécharger le reçu ${p.numero}`} title="Reçu PDF">
                        <FileDown size={15} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        <p className="text-xs text-ink-500">Personne enregistrée le {formatDate(personne.created_at)} · {formatNumber(historique?.travaux?.length || 0)} participation(s)</p>
      </div>
    </Modal>
  );
}
