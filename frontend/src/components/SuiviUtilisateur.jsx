import { useState, useEffect } from 'react';
import { Power, PowerOff, Pencil, LogIn, Activity } from 'lucide-react';
import { Badge, Button, Modal } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { utilisateursService } from '@/services';
import { formatDateTime } from '@/utils/format';
import { showServerErrors } from '@/utils/errors';
import { ROLE_LABELS, ROLE } from '@/constants';

function Chiffre({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-ink-100 bg-cream-50/60 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-ink-500"><Icon size={13} /> {label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-ink-800">{value}</p>
    </div>
  );
}

// Suivi d'un compte : connexions et actions enregistrées au journal
export default function SuiviUtilisateur({ compte, onClose, onModifier, onToggle, estMoi }) {
  const toast = useToast();
  const [suivi, setSuivi] = useState(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    if (!compte) return undefined;
    let annule = false;
    setSuivi(null);
    setErreur(false);
    utilisateursService.activite(compte.id)
      .then((s) => { if (!annule) setSuivi(s); })
      .catch((err) => { if (!annule) { setErreur(true); showServerErrors(err, { toast }); } });
    return () => { annule = true; };
  }, [compte?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!compte) return null;
  const types = suivi ? Object.entries(suivi.actions_par_type).sort((a, b) => b[1] - a[1]) : [];

  return (
    <Modal open onClose={onClose} size="xl" title={`Suivi — ${compte.nom}`}
      footer={
        <>
          {!estMoi && (
            <Button variant="outline" className="mr-auto" onClick={() => onToggle(compte)}>
              {compte.actif ? <><PowerOff size={15} /> Désactiver le compte</> : <><Power size={15} /> Réactiver le compte</>}
            </Button>
          )}
          <Button variant="outline" onClick={() => onModifier(compte)}><Pencil size={15} /> Modifier</Button>
          <Button variant="outline" onClick={onClose} className="hidden sm:inline-flex">Fermer</Button>
        </>
      }>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-600">{compte.email}</span>
          <Badge status={compte.role === ROLE.BIG_BOSS ? 'done' : 'planned'}>{ROLE_LABELS[compte.role] || compte.role}</Badge>
          <Badge status={compte.actif ? 'active' : 'inactive'}>{compte.actif ? 'Actif' : 'Inactif'}</Badge>
        </div>

        {erreur && <p className="text-sm text-earth-700">Le suivi n'a pas pu être chargé.</p>}
        {!suivi && !erreur && <p className="text-sm text-ink-500">Chargement du suivi…</p>}

        {suivi && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Chiffre icon={LogIn} label="Dernière connexion" value={suivi.derniere_connexion ? formatDateTime(suivi.derniere_connexion) : 'Jamais'} />
              <Chiffre icon={LogIn} label="Connexions" value={suivi.nb_connexions} />
              <Chiffre icon={Activity} label="Actions (total)" value={suivi.nb_actions} />
              <Chiffre icon={Activity} label="Actions sur 7 jours" value={suivi.nb_actions_7_jours} />
            </div>

            {types.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-ink-800">Actions par type</h3>
                <div className="flex flex-wrap gap-2">
                  {types.map(([type, nombre]) => (
                    <span key={type} className="rounded-full border border-ink-100 bg-white px-2.5 py-1 text-xs text-ink-700">
                      {type} <strong className="tabular-nums text-ink-800">{nombre}</strong>
                    </span>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-sm font-semibold text-ink-800">Dernières actions</h3>
              {suivi.dernieres_actions.length === 0 ? (
                <p className="text-sm text-ink-500">Aucune action enregistrée pour le moment.</p>
              ) : (
                <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100">
                  {suivi.dernieres_actions.map((a, i) => (
                    <li key={`${a.timestamp}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium text-ink-800">{a.action}</span>
                        <span className="ml-2 text-xs text-ink-500">{a.entite}</span>
                        {a.details && <span className="block text-xs text-ink-600">{a.details}</span>}
                      </span>
                      <span className="text-xs tabular-nums text-ink-500">{formatDateTime(a.timestamp)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}
