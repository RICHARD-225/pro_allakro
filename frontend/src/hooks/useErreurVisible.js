import { useEffect, useRef, useState } from 'react';

const cleDe = (valeur) => (valeur !== null && typeof valeur === 'object' ? JSON.stringify(valeur) : valeur);

/**
 * Message d'erreur d'un champ de formulaire, effacé dès que l'utilisateur modifie le champ (il n'a plus à attendre le prochain envoi).
 * - une nouvelle erreur envoyée par le formulaire s'affiche toujours ;
 * - un clic sur un bouton du pied de la fenêtre (« Enregistrer ») réaffiche l'erreur si la validation la renvoie encore.
 * `racine` : référence de l'élément du champ (sert à retrouver la fenêtre ou le formulaire qui le contient).
 */
export function useErreurVisible(erreur, valeur, racine) {
  const [masquee, setMasquee] = useState(false);
  const derniere = useRef(cleDe(valeur));
  const cle = cleDe(valeur);

  useEffect(() => {
    setMasquee(false);
    derniere.current = cle;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [erreur]);

  useEffect(() => {
    if (erreur && cle !== derniere.current) setMasquee(true);
    derniere.current = cle;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  useEffect(() => {
    const zone = racine?.current?.closest('[role=dialog], form');
    if (!zone) return undefined;
    const clic = (e) => {
      // bouton du pied de la fenêtre ou bouton de validation du formulaire (pas ceux du corps : listes, « Plus d'options »…)
      const bouton = e.target.closest('button');
      if (bouton && (!bouton.closest('.overflow-y-auto') || bouton.type === 'submit')) setMasquee(false);
    };
    zone.addEventListener('click', clic, true);
    return () => zone.removeEventListener('click', clic, true);
  }, [racine]);

  return masquee ? '' : erreur;
}
