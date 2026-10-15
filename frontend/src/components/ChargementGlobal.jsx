import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { abonnerChargement, operationsEnCours } from '@/utils/chargement';

const DELAI_AFFICHAGE = 250; // une opération rapide n'affiche rien (pas de clignotement)
const DUREE_FIN = 380;

/**
 * Barre de progression fine en haut de l'écran : elle apparaît quand une opération dépasse 250 ms (requête à l'API, chargement
 * d'une page), avance en continu, puis se remplit et s'efface à la fin.
 */
export default function ChargementGlobal() {
  const enCours = useSyncExternalStore(abonnerChargement, operationsEnCours) > 0;
  const [etat, setEtat] = useState('repos'); // repos | cours | fin
  const minuteur = useRef(null);

  useEffect(() => {
    clearTimeout(minuteur.current);
    if (enCours) {
      minuteur.current = setTimeout(() => setEtat('cours'), etat === 'cours' ? 0 : DELAI_AFFICHAGE);
    } else if (etat === 'cours') {
      setEtat('fin');
      minuteur.current = setTimeout(() => setEtat('repos'), DUREE_FIN);
    } else if (etat !== 'fin') {
      setEtat('repos');
    }
    return () => clearTimeout(minuteur.current);
  }, [enCours]); // eslint-disable-line react-hooks/exhaustive-deps

  if (etat === 'repos') return null;
  return (
    <div className="barre-chargement" data-etat={etat} role="progressbar" aria-label="Chargement en cours" aria-busy={etat === 'cours'}>
      <div className="barre-chargement__piste" />
    </div>
  );
}
