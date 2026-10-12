import { useState } from 'react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/contexts/ToastContext';
import { showServerErrors } from '@/utils/errors';

/**
 * Suppression avec confirmation. Le serveur a le dernier mot (droits, élément utilisé ailleurs, paiements liés) :
 * son message s'affiche tel quel en cas de refus.
 *
 *   const { demander, dialogue } = useSuppression({ supprimer: (row) => service.remove(row.id), apres, message, succes });
 *   … <button onClick={() => demander(row)}> … {dialogue}
 */
export function useSuppression({ supprimer, apres, titre = 'Confirmer la suppression', message, succes, libelleBouton = 'Supprimer' }) {
  const [cible, setCible] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const toast = useToast();
  const texte = (valeur) => (typeof valeur === 'function' ? valeur(cible) : valeur);

  const confirmer = async () => {
    setEnCours(true);
    try {
      await supprimer(cible);
      apres?.(cible);
      toast.success(texte(succes) || 'Suppression effectuée');
    } catch (err) {
      showServerErrors(err, { toast });
    } finally {
      setEnCours(false);
      setCible(null);
    }
  };

  const dialogue = (
    <ConfirmDialog
      open={!!cible}
      onClose={() => { if (!enCours) setCible(null); }}
      onConfirm={confirmer}
      loading={enCours}
      title={titre}
      confirmLabel={libelleBouton}
      message={cible ? texte(message) || 'Cette action est irréversible.' : ''}
    />
  );
  return { demander: setCible, dialogue };
}
